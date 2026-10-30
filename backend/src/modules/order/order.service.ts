import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { OrderEvent } from './order-event.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { Driver } from '../driver/driver.entity';
import { TariffService } from '../tariff/tariff.service';
import { BalanceService } from '../balance/balance.service';
import { BalanceTxType } from '../balance/balance-transaction.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { haversineKm } from '../../common/utils/haversine';
import { computeFare } from '../../common/utils/fare';
import { reverseGeocode } from '../../common/utils/geocode';
import { OrderEvents } from './order.events';
import { Client } from '../client/client.entity';
import { SettingsService } from '../settings/settings.service';
import { Logger } from '@nestjs/common';

export interface OrdersFilter {
  from?: Date;
  to?: Date;
  status?: OrderStatus | OrderStatus[];
  driverId?: string;
  clientId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderEvent) private readonly orderEvents: Repository<OrderEvent>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Client) private readonly clientsRepo: Repository<Client>,
    private readonly tariff: TariffService,
    private readonly balance: BalanceService,
    private readonly realtime: RealtimeService,
    private readonly events: OrderEvents,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly ds: DataSource,
  ) {}

  async create(dto: CreateOrderDto): Promise<Order> {
    const order = this.orders.create({
      clientId: dto.clientId,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      pickupAddress: dto.pickupAddress ?? null,
      destinationLat: dto.destinationLat ?? null,
      destinationLng: dto.destinationLng ?? null,
      destinationAddress: dto.destinationAddress ?? null,
      status: OrderStatus.PENDING,
    });
    const saved = await this.orders.save(order);
    if (!saved.pickupAddress) this.labelPoint(saved.id, 'pickup', saved.pickupLat, saved.pickupLng);

    await this.logEvent(saved.id, 'created', null, {
      pickupAddress: saved.pickupAddress,
      destinationAddress: saved.destinationAddress,
      clientId: saved.clientId,
    });
    await this.broadcastToNearbyDrivers(saved);
    this.realtime.emitToAdmin('order_created', this.toPlain(saved));
    this.events.emit('order.created', { order: saved });
    return saved;
  }

  // --- dispatch -------------------------------------------------------------
  //
  // 1. The order is offered PERSONALLY to the nearest free online driver
  //    (VIP/branded cars first while `branded_priority_seconds` > 0) for
  //    `dispatch_offer_seconds` (default 15 s, loud alarm on the phone).
  // 2. No answer or "Rad etish" → the next nearest driver, up to
  //    `dispatch_sequential_count` drivers (default 3).
  // 3. Then the order "falls to the middle": every online driver gets it at
  //    once with the same 15 s alarm, first to accept wins.
  // Every step is written to order_events (admin timeline + live feed).
  // State lives in memory; after a restart unknown pending orders are simply
  // treated as already broadcast (visible to everyone in "Mavjud").

  private readonly dispatch = new Map<
    string,
    {
      stage: 'personal' | 'all';
      offeredTo: string | null;
      offeredAt: number;
      tried: Set<string>;
      timer: NodeJS.Timeout | null;
      offerSeconds: number;
      allAt: number | null;
      allDrivers: Set<string>;
      ringAt: Map<string, number>;
      /** Drivers who declined in the middle or gave the order back — never rung again. */
      declined: Set<string>;
      /** How many times the middle has rung (re-rings every RERING_MS). */
      rounds: number;
    }
  >();

  // An order nobody took rings everyone again every minute, for up to 30 minutes.
  private static readonly RERING_MS = 60_000;
  private static readonly RERING_MAX = 30;

  private newDispatch(stage: 'personal' | 'all', declined: string[] = []) {
    return {
      stage,
      offeredTo: null,
      offeredAt: Date.now(),
      tried: new Set<string>(declined),
      timer: null,
      offerSeconds: 15,
      allAt: null,
      allDrivers: new Set<string>(),
      ringAt: new Map<string, number>(),
      declined: new Set<string>(declined),
      rounds: 0,
    };
  }

  async broadcastToNearbyDrivers(order: Order): Promise<void> {
    this.dispatch.set(order.id, this.newDispatch('personal'));
    await this.offerNext(order.id).catch((e) =>
      this.logger.warn(`dispatch failed for ${order.id}: ${(e as Error).message}`),
    );
  }

  private async dispatchSettings() {
    const num = async (key: 'dispatch_offer_seconds' | 'dispatch_sequential_count', def: number, min: number, max: number) => {
      const raw = (await this.settings.get(key)).trim();
      const n = raw === '' ? def : Number(raw);
      return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : def;
    };
    return {
      offerSeconds: await num('dispatch_offer_seconds', 15, 5, 60),
      sequential: await num('dispatch_sequential_count', 3, 0, 20),
      brandedFirst: (await this.brandedPrioritySeconds()) > 0,
    };
  }

  /** Online, approved drivers with a known position and no ride in progress. */
  private async freeOnlineDrivers(): Promise<Driver[]> {
    const online = (
      await this.drivers.find({
        where: { isOnline: true, isActive: true, isApproved: true },
      })
    ).filter((d) => d.kind !== 'courier'); // couriers get deliveries only
    if (!online.length) return [];
    const busy = await this.orders.find({
      where: [
        OrderStatus.ACCEPTED,
        OrderStatus.ON_THE_WAY,
        OrderStatus.ARRIVED,
        OrderStatus.IN_PROGRESS,
      ].map((status) => ({ status })),
      select: { id: true, driverId: true },
    });
    const busyIds = new Set(busy.map((o) => o.driverId).filter(Boolean));
    // …and drivers carrying a food delivery right now.
    const delivering = (await this.ds.query(
      `SELECT courier_id FROM food_orders WHERE courier_id IS NOT NULL AND status IN ('COOKING','READY','PICKED_UP')`,
    )) as { courier_id: string }[];
    for (const r of delivering) busyIds.add(r.courier_id);
    return online.filter((d) => !busyIds.has(d.id) && d.currentLat != null && d.currentLng != null);
  }

  private driverLabel(d: Pick<Driver, 'fullName' | 'phone' | 'carPlate'> | null | undefined) {
    return d ? { driverName: d.fullName, driverPhone: d.phone, carPlate: d.carPlate ?? null } : {};
  }

  /** Offer the order to the next nearest driver, or fall back to everyone. */
  private async offerNext(orderId: string): Promise<void> {
    const st = this.dispatch.get(orderId);
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    st.timer = null;
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.status !== OrderStatus.PENDING) {
      this.dispatch.delete(orderId);
      return;
    }
    const cfg = await this.dispatchSettings();
    st.offerSeconds = cfg.offerSeconds;
    const radius = Number(this.config.get('ORDER_BROADCAST_RADIUS_KM') ?? 5);

    if (st.stage === 'personal' && st.tried.size < cfg.sequential) {
      const candidates = (await this.freeOnlineDrivers())
        .filter((d) => !st.tried.has(d.id))
        .map((d) => ({ d, km: haversineKm(order.pickupLat, order.pickupLng, d.currentLat!, d.currentLng!) }))
        .filter((x) => x.km <= radius)
        .sort((a, b) =>
          cfg.brandedFirst && a.d.isBranded !== b.d.isBranded ? (a.d.isBranded ? -1 : 1) : a.km - b.km,
        );
      const next = candidates[0];
      if (next) {
        st.offeredTo = next.d.id;
        st.offeredAt = Date.now();
        st.tried.add(next.d.id);
        await this.logEvent(orderId, 'offered', next.d.id, {
          ...this.driverLabel(next.d),
          km: Number(next.km.toFixed(2)),
          seconds: cfg.offerSeconds,
          attempt: st.tried.size,
          branded: next.d.isBranded,
        });
        this.realtime.emitToDriver(
          next.d.id,
          'new_order',
          await this.offerPayload(order, next.km, 'personal', cfg.offerSeconds),
        );
        // +2 s grace for the network round-trip of a last-second "Qabul".
        st.timer = setTimeout(() => {
          const cur = this.dispatch.get(orderId);
          if (!cur || cur.offeredTo !== next.d.id) return;
          const rangAt = cur.ringAt.get(next.d.id);
          cur.offeredTo = null;
          this.realtime.emitToDriver(next.d.id, 'order_offer_expired', { orderId });
          // Log first, then move on — keeps the admin timeline in order.
          void this.logEvent(orderId, 'expired', next.d.id, {
            ...this.driverLabel(next.d),
            waitedSec: Math.round((Date.now() - cur.offeredAt) / 1000),
            rangSec: rangAt ? Math.round((Date.now() - rangAt) / 1000) : 0,
            delivered: !!rangAt,
          })
            .then(() => this.offerNext(orderId))
            .catch(() => undefined);
        }, (cfg.offerSeconds + 2) * 1000);
        return;
      }
    }

    // Nobody (left) nearby took it → the order falls to the middle.
    st.stage = 'all';
    st.offeredTo = null;
    st.allAt = Date.now();
    st.ringAt = new Map();
    st.rounds += 1;
    const everyone = (await this.freeOnlineDrivers()).filter((d) => !st.declined.has(d.id));
    st.allDrivers = new Set(everyone.map((d) => d.id));
    for (const d of everyone) {
      const km = haversineKm(order.pickupLat, order.pickupLng, d.currentLat!, d.currentLng!);
      this.realtime.emitToDriver(d.id, 'new_order', await this.offerPayload(order, km, 'all', cfg.offerSeconds));
    }
    // Repeat rounds only make a timeline row when someone was rung.
    if (st.rounds === 1 || everyone.length) {
      await this.logEvent(orderId, everyone.length ? 'broadcast' : 'no_drivers', null, {
        drivers: everyone.length,
        names: everyone.slice(0, 30).map((d) => d.fullName),
        seconds: cfg.offerSeconds,
        triedBefore: st.tried.size,
        round: st.rounds,
        pickupAddress: order.pickupAddress,
      });
    }
    this.logger.log(`order ${orderId.slice(0, 8)} → all ${everyone.length} online drivers (round ${st.rounds})`);
    // Still nobody? Ring the middle again in a minute (new drivers included).
    if (st.rounds < OrderService.RERING_MAX) {
      st.timer = setTimeout(() => {
        const cur = this.dispatch.get(orderId);
        if (!cur || cur !== st) return;
        void this.offerNext(orderId).catch(() => undefined);
      }, OrderService.RERING_MS);
    }
  }

  /** Driver pressed "Rad etish" on a personal offer → move on immediately. */
  async declineOffer(driverId: string, orderId: string) {
    const st = this.dispatch.get(orderId);
    if (st?.stage === 'personal' && st.offeredTo === driverId) {
      const d = await this.drivers.findOne({ where: { id: driverId } });
      const rangAt = st.ringAt.get(driverId);
      await this.logEvent(orderId, 'declined', driverId, {
        ...this.driverLabel(d),
        afterSec: Math.round((Date.now() - st.offeredAt) / 1000),
        rangSec: rangAt ? Math.round((Date.now() - rangAt) / 1000) : 0,
      });
      st.offeredTo = null;
      await this.offerNext(orderId);
    } else if (st?.stage === 'all') {
      st.declined.add(driverId);
      const d = await this.drivers.findOne({ where: { id: driverId } });
      await this.logEvent(orderId, 'declined', driverId, {
        ...this.driverLabel(d),
        afterSec: st.allAt ? Math.round((Date.now() - st.allAt) / 1000) : null,
        stage: 'all',
      });
    }
    return { ok: true };
  }

  /**
   * The driver's phone confirms the alarm is ringing (from the app or the
   * background service) — the admin sees "signal yetib bordi" and how long
   * it rang before the answer.
   */
  async markRinging(driverId: string, orderId: string, via: string) {
    const st = this.dispatch.get(orderId);
    if (!st || st.ringAt.has(driverId)) return { ok: true };
    if (st.stage === 'personal' ? st.offeredTo !== driverId : !st.allDrivers.has(driverId)) {
      return { ok: true };
    }
    st.ringAt.set(driverId, Date.now());
    const d = await this.drivers.findOne({ where: { id: driverId } });
    await this.logEvent(orderId, 'ringing', driverId, {
      ...this.driverLabel(d),
      via: String(via || 'app').slice(0, 16),
      afterSec: Math.round((Date.now() - (st.stage === 'all' && st.allAt ? st.allAt : st.offeredAt)) / 1000),
      stage: st.stage,
    });
    return { ok: true };
  }

  /**
   * The offer currently ringing for this driver, if any — the app asks on
   * start/resume (e.g. opened from the notification after being closed).
   */
  async currentOffer(driverId: string) {
    const now = Date.now();
    for (const [orderId, st] of this.dispatch) {
      let startedAt: number | null = null;
      if (st.stage === 'personal' && st.offeredTo === driverId) startedAt = st.offeredAt;
      if (st.stage === 'all' && st.allAt && st.allDrivers.has(driverId)) startedAt = st.allAt;
      if (startedAt == null) continue;
      const remaining = Math.ceil(st.offerSeconds - (now - startedAt) / 1000);
      if (remaining <= 1) continue;
      const order = await this.orders.findOne({ where: { id: orderId } });
      if (!order || order.status !== OrderStatus.PENDING) continue;
      const d = await this.drivers.findOne({ where: { id: driverId } });
      const km =
        d?.currentLat != null && d.currentLng != null
          ? haversineKm(order.pickupLat, order.pickupLng, d.currentLat, d.currentLng)
          : 0;
      return {
        ...(await this.offerPayload(order, km, st.stage, st.offerSeconds)),
        remainingSeconds: remaining,
      };
    }
    return null;
  }

  /** Is this driver allowed to see/accept the order right now? */
  private canTake(driverId: string, orderId: string): boolean {
    const st = this.dispatch.get(orderId);
    if (!st || st.stage === 'all') return true;
    return st.offeredTo === driverId;
  }

  private endDispatch(orderId: string) {
    const st = this.dispatch.get(orderId);
    if (st?.timer) clearTimeout(st.timer);
    this.dispatch.delete(orderId);
  }

  private async offerPayload(order: Order, km: number, mode: 'personal' | 'all', offerSeconds: number) {
    // Rough fare preview when the passenger named a destination
    // (straight line × 1.3 road factor, same tariff math as completion).
    let estimate: { km: number; price: number } | null = null;
    if (order.destinationLat != null && order.destinationLng != null) {
      const ekm =
        Math.round(
          haversineKm(order.pickupLat, order.pickupLng, order.destinationLat, order.destinationLng) * 1.3 * 10,
        ) / 10;
      const t = await this.tariff.getCurrent();
      estimate = { km: ekm, price: computeFare(ekm, t) };
    }
    return {
      orderId: order.id,
      mode,
      offerSeconds,
      pickup: {
        lat: order.pickupLat,
        lng: order.pickupLng,
        address: order.pickupAddress,
      },
      distanceFromDriver: Number(km.toFixed(2)),
      destination:
        order.destinationLat != null && order.destinationLng != null
          ? { lat: order.destinationLat, lng: order.destinationLng, address: order.destinationAddress }
          : null,
      estimatedKm: estimate?.km ?? null,
      estimatedPrice: estimate?.price ?? null,
      createdAt: order.createdAt,
    };
  }

  // --- order timeline (admin) ----------------------------------------------

  /** Write one timeline step and push it to the admin panel live. */
  async logEvent(
    orderId: string,
    kind: string,
    driverId: string | null = null,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      const row = await this.orderEvents.save(
        this.orderEvents.create({ orderId, kind, driverId, data }),
      );
      this.realtime.emitToAdmin('order_event', row);
    } catch (e) {
      this.logger.warn(`order event ${kind} for ${orderId} not saved: ${(e as Error).message}`);
    }
  }

  eventsFor(orderId: string) {
    return this.orderEvents.find({ where: { orderId }, order: { createdAt: 'ASC' }, take: 500 });
  }

  recentEvents(limit = 50) {
    return this.orderEvents.find({ order: { createdAt: 'DESC' }, take: Math.min(200, Math.max(1, limit)) });
  }

  private async brandedPrioritySeconds(): Promise<number> {
    const raw = (await this.settings.get('branded_priority_seconds')).trim();
    const n = raw === '' ? 5 : Number(raw);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 60) : 5;
  }

  /** Atomic accept — first writer wins. */
  async accept(driverId: string, orderId: string): Promise<Order> {
    // Timeline row is written after the commit (the order row is locked
    // inside the transaction, an FK insert from another connection waits).
    let acceptedLog: Record<string, unknown> | null = null;
    const accepted = await this.ds.transaction(async (em) => {
      // Defense in depth: a soft-deleted or admin-deactivated driver must
      // never be able to claim an order even if their JWT is still valid.
      const me = await em.getRepository(Driver).findOne({
        where: { id: driverId },
      });
      if (!me || !me.isActive) {
        throw new BadRequestException('Hisobingiz faol emas');
      }
      if (!me.isApproved) {
        throw new BadRequestException('Hisobingiz tasdiqlanmagan');
      }
      if (!this.canTake(driverId, orderId)) {
        throw new BadRequestException(
          'Bu buyurtma hozir boshqa (yaqinroq) haydovchiga taklif qilingan',
        );
      }

      // Prevent driver from holding two active orders simultaneously.
      const activeStatuses = [
        OrderStatus.ACCEPTED,
        OrderStatus.ON_THE_WAY,
        OrderStatus.ARRIVED,
        OrderStatus.IN_PROGRESS,
      ];
      const existing = await em.getRepository(Order).findOne({
        where: activeStatuses.map((s) => ({ driverId, status: s })),
      });
      if (existing) {
        throw new BadRequestException(
          'Sizda allaqachon faol buyurtma bor. Avval uni yakunlang.',
        );
      }

      const result = await em
        .getRepository(Order)
        .createQueryBuilder()
        .update(Order)
        .set({
          driverId,
          status: OrderStatus.ACCEPTED,
          acceptedAt: () => 'now()',
        })
        .where('id = :id AND status = :status AND driver_id IS NULL', {
          id: orderId,
          status: OrderStatus.PENDING,
        })
        .execute();

      if (!result.affected) {
        throw new BadRequestException('Buyurtma allaqachon olingan yoki mavjud emas');
      }
      const order = await em.getRepository(Order).findOneOrFail({
        where: { id: orderId },
      });
      const driver = await em
        .getRepository(Driver)
        .findOneOrFail({ where: { id: driverId } });

      const st = this.dispatch.get(orderId);
      const since = st ? (st.stage === 'all' && st.allAt ? st.allAt : st.offeredAt) : null;
      const rangAt = st?.ringAt.get(driverId);
      acceptedLog = {
        ...this.driverLabel(driver),
        stage: st?.stage ?? 'list',
        afterSec: since ? Math.round((Date.now() - since) / 1000) : null,
        rangSec: rangAt ? Math.round((Date.now() - rangAt) / 1000) : 0,
      };
      this.endDispatch(orderId);
      this.realtime.emitToAllDrivers('order_taken', { orderId });
      this.realtime.emitToAdmin('order_accepted', this.toPlain(order));

      let etaMinutes: number | undefined;
      if (driver.currentLat != null && driver.currentLng != null) {
        const km = haversineKm(
          driver.currentLat,
          driver.currentLng,
          order.pickupLat,
          order.pickupLng,
        );
        // City average speed ≈ 25 km/h. Minimum 1 minute.
        etaMinutes = Math.max(1, Math.round((km / 25) * 60));
      }

      this.events.emit('order.accepted', {
        order,
        driver: {
          fullName: driver.fullName,
          phone: driver.phone,
          avatarUrl: driver.avatarUrl,
          carModel: driver.carModel,
          carColor: driver.carColor,
          carPlate: driver.carPlate,
          carPhotoUrl: driver.carPhotoUrl,
        },
        etaMinutes,
      });
      return order;
    });
    if (acceptedLog) await this.logEvent(orderId, 'accepted', driverId, acceptedLog);
    return accepted;
  }

  async transition(
    driverId: string,
    orderId: string,
    next: OrderStatus,
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.driverId !== driverId) {
      throw new BadRequestException('Not your order');
    }
    const valid = this.validTransition(order.status, next);
    if (!valid) {
      throw new BadRequestException(
        `Cannot transition ${order.status} -> ${next}`,
      );
    }
    order.status = next;
    if (next === OrderStatus.ARRIVED) {
      if (!order.arrivedAt) order.arrivedAt = new Date();
      // Pickup wait is metered from GPS pings while the car stands still.
      order.waitTickAt = new Date();
    }
    if (next === OrderStatus.IN_PROGRESS) {
      order.startedAt = new Date();
      // Close the pickup wait (fee is settled once at completion).
      this.settleWaitTail(order);
    }
    const saved = await this.orders.save(order);

    const driver = await this.drivers.findOne({ where: { id: driverId } });
    const driverSummary = driver
      ? {
          fullName: driver.fullName,
          phone: driver.phone,
          avatarUrl: driver.avatarUrl,
          carModel: driver.carModel,
          carColor: driver.carColor,
          carPlate: driver.carPlate,
          carPhotoUrl: driver.carPhotoUrl,
        }
      : undefined;

    // ETA — from driver's current location to pickup (for ON_THE_WAY)
    let etaMinutes: number | undefined;
    if (
      next === OrderStatus.ON_THE_WAY &&
      driver?.currentLat != null &&
      driver?.currentLng != null
    ) {
      const km = haversineKm(
        driver.currentLat,
        driver.currentLng,
        saved.pickupLat,
        saved.pickupLng,
      );
      etaMinutes = Math.max(1, Math.round((km / 25) * 60));
    }

    const eventMap: Record<string, Parameters<OrderEvents['emit']>[0]> = {
      [OrderStatus.ON_THE_WAY]: 'order.on_the_way',
      [OrderStatus.ARRIVED]: 'order.arrived',
      [OrderStatus.IN_PROGRESS]: 'order.in_progress',
    };
    await this.logEvent(saved.id, String(next).toLowerCase(), driverId, {
      ...this.driverLabel(driver),
      ...(etaMinutes ? { etaMinutes } : {}),
    });
    const evt = eventMap[next];
    if (evt)
      this.events.emit(evt, {
        order: saved,
        driver: driverSummary,
        etaMinutes,
      });
    this.realtime.emitToAdmin('order_updated', this.toPlain(saved));
    return saved;
  }

  async complete(
    driverId: string,
    orderId: string,
    distanceKm: number,
    opts: { allowAnyStatus?: boolean } = {},
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.driverId !== driverId) {
      throw new BadRequestException('Not your order');
    }
    // Idempotent: a retry after a lost response must not error out.
    if (order.status === OrderStatus.COMPLETED) return order;
    if (!opts.allowAnyStatus && order.status !== OrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Safar hali boshlanmagan — avval “Safarni boshlash”ni bosing');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Bekor qilingan buyurtmani yakunlab bo‘lmaydi');
    }
    // The phone's odometer can under-count (fixes dropped, app in the
    // background); the server-side tally from location pings is a floor.
    const km = Math.max(Number(distanceKm) || 0, Number(order.serverKm ?? 0));
    const tariff = await this.tariff.getCurrent();
    // Tiered price table when configured, else per-km with a minimum;
    // rounded to whole thousands.
    // Settle waiting: close a running pause, then charge beyond the free minutes.
    if (order.waitStartedAt) {
      this.settleWaitTail(order);
      order.waitStartedAt = null;
    }
    const waitMin = Number(order.waitingSeconds ?? 0) / 60;
    const billable = Math.max(0, Math.ceil(waitMin - Number(tariff.waitingFreeMinutes ?? 0)));
    order.waitingMinutes = Math.round(waitMin);
    order.waitingFee = (billable * Number(tariff.waitingPricePerMinute ?? 0)).toFixed(2);
    // Drop-off = where the driver is now.
    const drv = await this.drivers.findOne({ where: { id: driverId } });
    if (drv?.currentLat != null && drv.currentLng != null) {
      order.destinationLat = drv.currentLat;
      order.destinationLng = drv.currentLng;
    }
    const price = computeFare(km, tariff) + Math.round(Number(order.waitingFee ?? 0));

    // Percentage commission when configured, else the fixed per-order fee.
    const pct = Number(tariff.commissionPercent ?? 0);
    const commission =
      pct > 0
        ? Math.round((price * pct) / 100)
        : Number(tariff.commissionPerOrder);

    // Promo codes credit the bonus balance (PromoService.claim); nothing is
    // taken off the fare here any more. Kept as a field for old orders.
    const discount = 0;

    order.distanceKm = km.toFixed(3);
    order.price = price.toFixed(2);
    order.discount = discount.toFixed(2);
    order.commission = commission.toFixed(2);
    if (!order.receiptNo) {
      const [{ n }] = await this.ds.query(`SELECT nextval('orders_receipt_no_seq') AS n`);
      order.receiptNo = String(n);
    }
    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();
    const saved = await this.orders.save(order);
    if (saved.destinationLat != null && saved.destinationLng != null && !saved.destinationAddress) {
      this.labelPoint(saved.id, 'destination', saved.destinationLat, saved.destinationLng);
    }

    // Closed-loop financial model: driver receives the fare in cash from the
    // passenger (off-system), then owes commission to the treasury. So the
    // only on-ledger movement is `-commission` from driver to admin.
    // The order is already COMPLETED, so a ledger failure must not abort the
    // rest (client notification, admin feed) — log it for manual follow-up.
    await this.balance
      .adjust({
        driverId,
        amount: -commission,
        type: BalanceTxType.COMMISSION,
        allowNegative: true,
        orderId: saved.id,
        note: `Order ${saved.id} completed: price=${price.toFixed(2)}, commission=${commission.toFixed(2)}`,
      })
      .catch((e) =>
        this.logger.error(
          `Commission debit failed for order ${saved.id}: ${(e as Error).message}`,
        ),
      );

    // The client paid (price − discount) in cash, so the driver is short by
    // the discount — the treasury makes it up on the driver's balance.
    if (discount > 0) {
      await this.balance
        .adjust({
          driverId,
          amount: discount,
          type: BalanceTxType.ADJUSTMENT,
          orderId: saved.id,
          note: `Promo chegirma kompensatsiyasi (order ${saved.id.slice(0, 8)})`,
        })
        .catch((e) =>
          this.logger.error(
            `Promo compensation failed for order ${saved.id}: ${(e as Error).message}`,
          ),
        );
    }

    // Referral bonus: paid out only once, on the client's first COMPLETED
    // order, and only if they were referred by someone other than themselves.
    // Bonuses are drawn from the treasury, preserving the 100M invariant.
    if (saved.clientId) await this.maybePayReferralBonus(saved.id, saved.clientId).catch((e) =>
      this.logger.warn(
        `Referral bonus failed for order ${saved.id}: ${(e as Error).message}`,
      ),
    );

    this.realtime.emitToAdmin('order_completed', this.toPlain(saved));
    const driver = await this.drivers.findOne({ where: { id: driverId } });
    await this.logEvent(saved.id, 'completed', driverId, {
      ...this.driverLabel(driver),
      price: Number(saved.price ?? 0),
      km: Number(saved.distanceKm ?? 0),
      waitingFee: Number((saved as any).waitingFee ?? 0),
      byAdmin: !!opts.allowAnyStatus,
    });
    this.events.emit('order.completed', {
      order: saved,
      driver: driver
        ? {
            fullName: driver.fullName,
            phone: driver.phone,
            avatarUrl: driver.avatarUrl,
            carModel: driver.carModel,
            carColor: driver.carColor,
            carPlate: driver.carPlate,
            carPhotoUrl: driver.carPhotoUrl,
          }
        : undefined,
    });
    return saved;
  }

  /** Mid-ride pause (client asked to stop): start/stop the waiting clock. */
  async setWaiting(driverId: string, orderId: string, on: boolean): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.driverId !== driverId) throw new BadRequestException('Not your order');
    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Kutish faqat safar davomida');
    }
    if (on) {
      if (!order.waitStartedAt) {
        order.waitStartedAt = new Date();
        order.waitTickAt = order.waitStartedAt;
      }
    } else if (order.waitStartedAt) {
      this.settleWaitTail(order);
      order.waitStartedAt = null;
    }
    return this.orders.save(order);
  }

  /**
   * GPS ping while waiting (at the pickup, or a mid-ride pause): the time
   * since the previous ping counts only if the car stood still, judged by
   * how far it moved. Gaps without pings count as standing. Emits the new
   * total to the driver app.
   */
  async onWaitPing(driverId: string, movedKm: number) {
    const order = await this.orders.findOne({
      where: [
        { driverId, status: OrderStatus.ARRIVED },
        { driverId, status: OrderStatus.IN_PROGRESS, waitStartedAt: Not(IsNull()) },
      ],
    });
    if (!order || !order.waitTickAt) return null;
    const now = new Date();
    const dt = Math.max(0, Math.round((now.getTime() - new Date(order.waitTickAt).getTime()) / 1000));
    const kmh = dt > 0 ? (movedKm / dt) * 3600 : 0;
    // Driving = ≥50 m since the last ping at ≥8 km/h. Lower values are GPS
    // jitter at a standstill or crawling in a jam — both count as waiting.
    const moving = movedKm >= 0.05 && kmh >= 8;
    const waitingSeconds = Number(order.waitingSeconds ?? 0) + (moving ? 0 : dt);
    await this.orders.update({ id: order.id }, { waitingSeconds, waitTickAt: now });
    const tick = { orderId: order.id, waitingSeconds, waitTickAt: now.toISOString(), moving };
    this.realtime.emitToDriver(driverId, 'wait_tick', tick);
    return tick;
  }

  /** Add the time since the last wait tick (assumed standing) and clear it. */
  private settleWaitTail(order: Order) {
    if (!order.waitTickAt) return;
    const sec = Math.round((Date.now() - new Date(order.waitTickAt).getTime()) / 1000);
    order.waitingSeconds = Number(order.waitingSeconds ?? 0) + Math.max(0, sec);
    order.waitTickAt = null;
  }

  /** Live driver position for the passenger app while the ride is active. */
  async pushDriverPosition(driverId: string, lat: number, lng: number) {
    const order = await this.orders.findOne({
      where: [
        OrderStatus.ACCEPTED,
        OrderStatus.ON_THE_WAY,
        OrderStatus.ARRIVED,
        OrderStatus.IN_PROGRESS,
      ].map((status) => ({ driverId, status })),
      select: { id: true, clientId: true, status: true },
    });
    if (!order) return;
    this.realtime.emitToClient(order.clientId, 'driver_location', {
      orderId: order.id,
      status: order.status,
      lat,
      lng,
      at: new Date().toISOString(),
    });
  }

  /** Background reverse-geocode so the admin sees street names, not coordinates. */
  private labelPoint(orderId: string, which: 'pickup' | 'destination', lat: number, lng: number) {
    void reverseGeocode(lat, lng)
      .then((addr) => {
        if (!addr) return;
        return this.orders.update(
          { id: orderId },
          which === 'pickup' ? { pickupAddress: addr } : { destinationAddress: addr },
        );
      })
      .catch(() => undefined);
  }

  /** Server-side odometer: add a GPS-ping segment to the driver's live ride. */
  /**
   * One GPS ping from the driver (socket from the app, or HTTP from the
   * phone's background service when the app is closed): store the position,
   * advance the server odometer, meter waiting time and move the car on the
   * passenger's map.
   */
  /**
   * Taximeter: the driver picked up someone on the street (not via the bot
   * or app). A ride starts right away (IN_PROGRESS); waiting and completion
   * use the normal endpoints, so the price, commission and admin view are
   * the same as for any ride.
   */
  async startStreetRide(driverId: string, lat: number, lng: number): Promise<Order> {
    const me = await this.drivers.findOne({ where: { id: driverId } });
    if (!me || !me.isActive || !me.isApproved) throw new BadRequestException('Hisobingiz faol emas');
    if (me.kind === 'courier') throw new BadRequestException('Kuryerlar taksometrdan foydalanmaydi');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequestException('GPS joylashuv aniqlanmadi');
    const [busy] = (await this.ds.query(
      `SELECT 1 FROM orders WHERE driver_id = $1 AND status IN ('ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS')
       UNION ALL SELECT 1 FROM food_orders WHERE courier_id = $1 AND status IN ('COOKING','READY','PICKED_UP') LIMIT 1`,
      [driverId],
    )) as any[];
    if (busy) throw new BadRequestException('Sizda faol buyurtma bor — avval uni yakunlang');
    const now = new Date();
    const saved = await this.orders.save(
      this.orders.create({
        clientId: null,
        driverId,
        pickupLat: lat,
        pickupLng: lng,
        status: OrderStatus.IN_PROGRESS,
        source: 'street',
        acceptedAt: now,
        startedAt: now,
      } as any),
    ) as unknown as Order;
    this.labelPoint(saved.id, 'pickup', lat, lng);
    await this.logEvent(saved.id, 'street_start', driverId, { ...this.driverLabel(me) });
    this.realtime.emitToAdmin('order_created', this.toPlain(saved));
    return saved;
  }

  /** Last accepted fix per driver (for the jump filter). */
  private readonly lastFix = new Map<string, { lat: number; lng: number; at: number }>();

  async handleLocationPing(driverId: string, lat: number, lng: number): Promise<void> {
    // Drop impossible jumps (a bad fix from cell towers / Wi-Fi): faster than
    // 160 km/h since the last accepted fix, if that was under 2 minutes ago.
    const last = this.lastFix.get(driverId);
    const now = Date.now();
    if (last && now - last.at < 120_000) {
      const km = haversineKm(last.lat, last.lng, lat, lng);
      const hours = Math.max(1, now - last.at) / 3_600_000;
      if (km > 0.3 && km / hours > 160) return;
    }
    this.lastFix.set(driverId, { lat, lng, at: now });
    const prev = await this.drivers.findOne({
      where: { id: driverId },
      select: { id: true, currentLat: true, currentLng: true },
    });
    await this.drivers.update(driverId, { currentLat: lat, currentLng: lng });
    // Pings come every ~10 s: skip jitter (<5 m) and impossible jumps (>1.5 km).
    const delta =
      prev?.currentLat != null && prev.currentLng != null
        ? haversineKm(prev.currentLat, prev.currentLng, lat, lng)
        : 0;
    if (delta >= 0.005 && delta <= 1.5) await this.addServerKm(driverId, delta);
    await this.onWaitPing(driverId, delta <= 1.5 ? delta : 0).catch(() => undefined);
    await this.pushDriverPosition(driverId, lat, lng).catch(() => undefined);
  }

  async addServerKm(driverId: string, km: number): Promise<void> {
    if (!(km > 0)) return;
    await this.orders
      .createQueryBuilder()
      .update(Order)
      .set({ serverKm: () => `server_km + ${km.toFixed(3)}` })
      .where('driver_id = :driverId AND status = :status', {
        driverId,
        status: OrderStatus.IN_PROGRESS,
      })
      .execute();
  }

  /**
   * Driver-initiated cancellation. Only allowed for orders the driver owns
   * and only before IN_PROGRESS — once the ride has started the order must
   * be completed normally.
   */
  async cancelByDriver(driverId: string, orderId: string): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.driverId !== driverId) {
      throw new BadRequestException('Not your order');
    }
    const cancellable = [
      OrderStatus.ACCEPTED,
      OrderStatus.ON_THE_WAY,
      OrderStatus.ARRIVED,
    ];
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException(
        'Bu bosqichda bekor qilib bo‘lmaydi',
      );
    }
    // A street ride has no passenger in the system to hand over.
    if (!order.clientId) return this.cancel(orderId, 'driver');
    return this.requeue(order, driverId);
  }

  /**
   * The driver gave the order back: instead of cancelling it for the client,
   * it returns to the middle — every other free driver gets the alarm, and it
   * keeps re-ringing until someone takes it. The driver who gave it back is
   * not rung for it again.
   */
  private async requeue(order: Order, driverId: string): Promise<Order> {
    const prevStatus = order.status;
    const result = await this.orders
      .createQueryBuilder()
      .update(Order)
      .set({
        driverId: null,
        status: OrderStatus.PENDING,
        acceptedAt: null,
        arrivedAt: null,
        startedAt: null,
        waitingMinutes: 0,
        waitingFee: '0',
        waitingSeconds: 0,
        waitStartedAt: null,
        waitTickAt: null,
        serverKm: '0',
      } as any)
      .where('id = :id AND driver_id = :driverId AND status = :status', {
        id: order.id,
        driverId,
        status: prevStatus,
      })
      .execute();
    if (!result.affected) {
      throw new BadRequestException('Buyurtma holati o‘zgardi — sahifani yangilang');
    }
    const saved = await this.orders.findOneOrFail({ where: { id: order.id } });
    const d = await this.drivers.findOne({ where: { id: driverId } });
    await this.logEvent(saved.id, 'released', driverId, {
      ...this.driverLabel(d),
      atStatus: prevStatus,
    });
    this.realtime.emitToDriver(driverId, 'order_cancelled', { orderId: saved.id, by: 'driver' });
    this.realtime.emitToAdmin('order_requeued', this.toPlain(saved));
    this.events.emit('order.requeued', { order: saved });
    this.endDispatch(saved.id);
    this.dispatch.set(saved.id, this.newDispatch('all', [driverId]));
    await this.offerNext(saved.id).catch((e) =>
      this.logger.warn(`requeue dispatch failed for ${saved.id}: ${(e as Error).message}`),
    );
    return saved;
  }

  /**
   * Admin-initiated completion — unwinds an order regardless of its current
   * state. Used to resolve stuck orders (no-shows, broken driver phones).
   * Uses the supplied distance, or falls back to 0 (which trips minimumFare).
   */
  async forceCompleteByAdmin(
    orderId: string,
    distanceKm: number | undefined,
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.COMPLETED) return order;
    if (!order.driverId) {
      throw new BadRequestException(
        'Buyurtmaga haydovchi biriktirilmagan — yakunlab bo‘lmaydi',
      );
    }
    return this.complete(
      order.driverId,
      orderId,
      Math.max(0, distanceKm ?? 0),
      { allowAnyStatus: true },
    );
  }

  async cancel(orderId: string, by: 'client' | 'driver' | 'admin'): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException('Order is already final');
    }
    const wasArrived = order.status === OrderStatus.ARRIVED;
    const prevStatus = order.status;
    if (order.status === OrderStatus.PENDING) {
      // Stop the alarm on every phone that is still ringing for it.
      this.endDispatch(orderId);
      this.realtime.emitToAllDrivers('order_taken', { orderId });
    }
    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    // Client bailed after the driver reached the pickup: take the admin-set
    // penalty from their bonus balance (as much of it as they have).
    if (by === 'client' && order.clientId) {
      const client = await this.clientsRepo.findOne({ where: { id: order.clientId } });
      if (client) {
        let taken = 0;
        if (wasArrived) {
          const penalty = Number((await this.settings.get('cancel_penalty_amount')) || '0');
          taken = Math.max(0, Math.min(penalty, Number(client.balance)));
          if (taken > 0) {
            await this.balance.adjustClient({
              clientId: client.id,
              amount: -taken,
              note: `Bekor qilish jarimasi (order ${order.id.slice(0, 8)})`,
            });
          }
        }
        order.cancelPenalty = taken.toFixed(2);
        await this.clientsRepo.update(
          { id: client.id },
          {
            cancelCount: () => 'cancel_count + 1',
            penaltyTotal: () => `penalty_total + ${taken}`,
          } as any,
        );
      }
    }
    const saved = await this.orders.save(order);
    const cancelDriver = saved.driverId
      ? await this.drivers.findOne({ where: { id: saved.driverId } })
      : null;
    await this.logEvent(saved.id, 'cancelled', saved.driverId ?? null, {
      ...this.driverLabel(cancelDriver),
      by,
      atStatus: prevStatus,
      penalty: Number(saved.cancelPenalty ?? 0),
    });
    this.realtime.emitToAdmin('order_cancelled', { ...this.toPlain(saved), by });
    this.events.emit('order.cancelled', { order: saved });
    if (saved.driverId) {
      this.realtime.emitToDriver(saved.driverId, 'order_cancelled', {
        orderId: saved.id,
        by,
      });
    }
    return saved;
  }

  history(driverId: string, limit = 50) {
    return this.orders.find({
      where: { driverId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findOneForDriver(driverId: string, orderId: string) {
    const order = await this.orders.findOne({
      where: { id: orderId },
      relations: { client: true },
    });
    if (!order) return null;
    if (order.driverId && order.driverId !== driverId) return null;
    return order;
  }

  /**
   * Pending orders not yet accepted, within the broadcast radius of the
   * driver's last-known location. Used by the driver app's "Mavjud" tab.
   */
  async available(driverId: string, limit = 30): Promise<Order[]> {
    const driver = await this.drivers.findOne({ where: { id: driverId } });
    if (!driver) return [];
    // Couriers carry food only — no taxi orders in their list.
    if (driver.kind === 'courier') return [];
    const radius = Number(
      this.config.get('ORDER_BROADCAST_RADIUS_KM') ?? 5,
    );

    const pending = await this.orders.find({
      where: { status: OrderStatus.PENDING },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    // While an order is offered personally to one driver, nobody else may
    // see it in the list — otherwise the "nearest first" queue is bypassed.
    const visible = pending.filter((o) => this.canTake(driverId, o.id));

    if (driver.currentLat == null || driver.currentLng == null) return visible;

    return visible.filter((o) => {
      const km = haversineKm(
        o.pickupLat,
        o.pickupLng,
        driver.currentLat as number,
        driver.currentLng as number,
      );
      return km <= radius;
    });
  }

  async listForAdmin(filter: OrdersFilter) {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filter.pageSize ?? 25));
    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.driver', 'd')
      .leftJoinAndSelect('o.client', 'c')
      // TypeORM skip()/take() with joins rewrites the query and resolves
      // ORDER BY columns through entity metadata — must reference the
      // property name (createdAt), not the snake_case DB column.
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (filter.from) qb.andWhere('o.createdAt >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('o.createdAt <= :to', { to: filter.to });
    if (filter.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      qb.andWhere('o.status IN (:...statuses)', { statuses });
    }
    if (filter.driverId) qb.andWhere('o.driver_id = :did', { did: filter.driverId });
    if (filter.clientId) qb.andWhere('o.client_id = :cid', { cid: filter.clientId });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async statsFor(period: 'day' | 'week' | 'month') {
    const since = new Date();
    if (period === 'day') since.setHours(0, 0, 0, 0);
    if (period === 'week') since.setDate(since.getDate() - 7);
    if (period === 'month') since.setMonth(since.getMonth() - 1);

    const completed = await this.orders.find({
      where: { status: OrderStatus.COMPLETED },
    });
    const within = completed.filter(
      (o) => o.completedAt && o.completedAt >= since,
    );
    const totalRevenue = within.reduce((s, o) => s + Number(o.price ?? 0), 0);
    const totalCommission = within.reduce(
      (s, o) => s + Number(o.commission ?? 0),
      0,
    );
    const orderCount = within.length;
    const activeDrivers = await this.drivers.count({
      where: { isOnline: true },
    });
    return { totalRevenue, totalCommission, orderCount, activeDrivers, since };
  }

  private validTransition(curr: OrderStatus, next: OrderStatus): boolean {
    const map: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
      [OrderStatus.ACCEPTED]: [OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED],
      [OrderStatus.ON_THE_WAY]: [OrderStatus.ARRIVED, OrderStatus.CANCELLED],
      [OrderStatus.ARRIVED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
      [OrderStatus.IN_PROGRESS]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.CANCELLED]: [],
    };
    return map[curr].includes(next);
  }

  private toPlain(order: Order) {
    return { ...order };
  }

  /**
   * On the client's first ever COMPLETED order, credit both the client and
   * their referrer (if any) with the configured bonus amounts. Both bonuses
   * are debited from the treasury so the 100M invariant holds.
   */
  private async maybePayReferralBonus(orderId: string, clientId: string) {
    const completedForClient = await this.orders.count({
      where: { clientId, status: OrderStatus.COMPLETED },
    });
    // The just-saved order is already COMPLETED, so "first ever" means count===1.
    if (completedForClient !== 1) return;

    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client?.referredById) return;

    const clientBonus = Number(
      (await this.settings.get('referral_bonus_client')) || '0',
    );
    const referrerBonus = Number(
      (await this.settings.get('referral_bonus_referrer')) || '0',
    );

    if (clientBonus > 0) {
      await this.balance.adjustClient({
        clientId: client.id,
        amount: clientBonus,
        note: `Referral bonus for first ride (order ${orderId.slice(0, 8)})`,
      });
    }
    if (referrerBonus > 0) {
      await this.balance.adjustClient({
        clientId: client.referredById,
        amount: referrerBonus,
        note: `Referral bonus: invited ${client.firstName} (order ${orderId.slice(0, 8)})`,
      });
    }
    if (clientBonus > 0 || referrerBonus > 0) {
      // Let the bot tell both sides what they just earned.
      this.events.emitReferralPaid({
        orderId,
        clientId: client.id,
        clientName: client.firstName,
        clientBonus,
        referrerId: client.referredById,
        referrerBonus,
      });
    }
  }
}
