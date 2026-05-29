import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { Driver } from '../driver/driver.entity';
import { TariffService } from '../tariff/tariff.service';
import { BalanceService } from '../balance/balance.service';
import { BalanceTxType } from '../balance/balance-transaction.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { haversineKm } from '../../common/utils/haversine';
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
      status: OrderStatus.PENDING,
    });
    const saved = await this.orders.save(order);

    await this.broadcastToNearbyDrivers(saved);
    this.realtime.emitToAdmin('order_created', this.toPlain(saved));
    this.events.emit('order.created', { order: saved });
    return saved;
  }

  async broadcastToNearbyDrivers(order: Order): Promise<void> {
    const radius = Number(
      this.config.get('ORDER_BROADCAST_RADIUS_KM') ?? 5,
    );
    const onlineDrivers = await this.drivers.find({
      where: { isOnline: true, isActive: true, isApproved: true },
    });

    for (const d of onlineDrivers) {
      if (d.currentLat == null || d.currentLng == null) continue;
      const distance = haversineKm(
        order.pickupLat,
        order.pickupLng,
        d.currentLat,
        d.currentLng,
      );
      if (distance <= radius) {
        this.realtime.emitToDriver(d.id, 'new_order', {
          orderId: order.id,
          pickup: {
            lat: order.pickupLat,
            lng: order.pickupLng,
            address: order.pickupAddress,
          },
          distanceFromDriver: Number(distance.toFixed(2)),
          createdAt: order.createdAt,
        });
      }
    }
  }

  /** Atomic accept — first writer wins. */
  async accept(driverId: string, orderId: string): Promise<Order> {
    return this.ds.transaction(async (em) => {
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
    if (!opts.allowAnyStatus && order.status !== OrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Order must be IN_PROGRESS to complete');
    }
    if (order.status === OrderStatus.COMPLETED) return order;
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Bekor qilingan buyurtmani yakunlab bo‘lmaydi');
    }
    const tariff = await this.tariff.getCurrent();
    const pricePerKm = Number(tariff.pricePerKm);
    const minFare = Number(tariff.minimumFare);
    const commission = Number(tariff.commissionPerOrder);

    let price = distanceKm * pricePerKm;
    if (price < minFare) price = minFare;

    order.distanceKm = distanceKm.toFixed(3);
    order.price = price.toFixed(2);
    order.commission = commission.toFixed(2);
    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();
    const saved = await this.orders.save(order);

    // Closed-loop financial model: driver receives the fare in cash from the
    // passenger (off-system), then owes commission to the treasury. So the
    // only on-ledger movement is `-commission` from driver to admin.
    await this.balance.adjust({
      driverId,
      amount: -commission,
      type: BalanceTxType.COMMISSION,
      orderId: saved.id,
      note: `Order ${saved.id} completed: price=${price.toFixed(2)}, commission=${commission.toFixed(2)}`,
    });

    // Referral bonus: paid out only once, on the client's first COMPLETED
    // order, and only if they were referred by someone other than themselves.
    // Bonuses are drawn from the treasury, preserving the 100M invariant.
    await this.maybePayReferralBonus(saved.id, saved.clientId).catch((e) =>
      this.logger.warn(
        `Referral bonus failed for order ${saved.id}: ${(e as Error).message}`,
      ),
    );

    this.realtime.emitToAdmin('order_completed', this.toPlain(saved));
    const driver = await this.drivers.findOne({ where: { id: driverId } });
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
    return this.cancel(orderId, 'driver');
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
    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    const saved = await this.orders.save(order);
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
    const radius = Number(
      this.config.get('ORDER_BROADCAST_RADIUS_KM') ?? 5,
    );

    const pending = await this.orders.find({
      where: { status: OrderStatus.PENDING },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    if (driver.currentLat == null || driver.currentLng == null) return pending;

    return pending.filter((o) => {
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
  }
}
