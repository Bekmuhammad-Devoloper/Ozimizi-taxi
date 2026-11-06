import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Client } from '../client/client.entity';
import { Order, OrderStatus } from '../order/order.entity';
import { Driver } from '../driver/driver.entity';
import { OrderService } from '../order/order.service';
import { ChatService } from '../chat/chat.service';
import { BonusService } from '../bonus/bonus.service';
import { PromoService } from '../promo/promo.service';
import { TariffService } from '../tariff/tariff.service';
import { ReceiptService } from '../receipt/receipt.service';
import { ClientAuthService, normalizePhone } from './client-auth.service';
import { haversineKm } from '../../common/utils/haversine';

const ACTIVE = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.ON_THE_WAY,
  OrderStatus.ARRIVED,
  OrderStatus.IN_PROGRESS,
];

/** What the client app may see about the driver of their order. */
export function driverPublic(d: Driver | null | undefined) {
  if (!d) return null;
  return {
    id: d.id,
    fullName: d.fullName,
    phone: d.phone,
    avatarUrl: d.avatarUrl,
    carModel: d.carModel,
    carColor: d.carColor,
    carPlate: d.carPlate,
    carPhotoUrl: d.carPhotoUrl,
    isBranded: d.isBranded,
    lat: d.currentLat,
    lng: d.currentLng,
  };
}

export function orderForClient(o: Order, driver?: Driver | null) {
  const d = driver ?? o.driver ?? null;
  let etaMinutes: number | null = null;
  if (d?.currentLat != null && d.currentLng != null && (o.status === OrderStatus.ACCEPTED || o.status === OrderStatus.ON_THE_WAY)) {
    const km = haversineKm(d.currentLat, d.currentLng, o.pickupLat, o.pickupLng);
    etaMinutes = Math.max(1, Math.round((km / 25) * 60));
  }
  return {
    id: o.id,
    status: o.status,
    pickupLat: o.pickupLat,
    pickupLng: o.pickupLng,
    pickupAddress: o.pickupAddress,
    destinationLat: o.destinationLat,
    destinationLng: o.destinationLng,
    destinationAddress: o.destinationAddress,
    distanceKm: o.distanceKm,
    price: o.price,
    discount: o.discount,
    bonusUsed: o.bonusUsed,
    waitingMinutes: o.waitingMinutes,
    waitingFee: o.waitingFee,
    // Live waiting meter (pickup wait + paid pauses): seconds so far and
    // whether it is running right now — the app shows time and its cost.
    waitingSeconds: Number((o as any).waitingSeconds ?? 0),
    waitRunning: o.status === OrderStatus.ARRIVED || !!(o as any).waitStartedAt,
    waitTickAt: (o as any).waitTickAt ?? null,
    outsideKm: Number((o as any).outsideKm ?? 0),
    outsideFee: Number((o as any).outsideFee ?? 0),
    cancelPenalty: o.cancelPenalty,
    receiptNo: o.receiptNo,
    createdAt: o.createdAt,
    acceptedAt: o.acceptedAt,
    arrivedAt: o.arrivedAt,
    startedAt: o.startedAt,
    completedAt: o.completedAt,
    cancelledAt: o.cancelledAt,
    driver: driverPublic(d),
    etaMinutes,
  };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('client')
@Controller('client')
export class ClientApiController {
  constructor(
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly orderService: OrderService,
    private readonly chat: ChatService,
    private readonly bonus: BonusService,
    private readonly promo: PromoService,
    private readonly tariff: TariffService,
    private readonly receipts: ReceiptService,
    private readonly auth: ClientAuthService,
  ) {}

  private async me(user: JwtPayload): Promise<Client> {
    const c = await this.clients.findOne({ where: { id: user.sub } });
    if (!c) throw new NotFoundException('Klient topilmadi');
    if (c.isBlocked) throw new ForbiddenException('Hisobingiz bloklangan');
    return c;
  }

  private async own(user: JwtPayload, orderId: string): Promise<Order> {
    const o = await this.orders.findOne({ where: { id: orderId }, relations: { driver: true } });
    if (!o || o.clientId !== user.sub) throw new NotFoundException('Buyurtma topilmadi');
    return o;
  }

  @Get('me')
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.auth.publicClient(await this.me(user));
  }

  @Patch('me')
  async patchMe(@CurrentUser() user: JwtPayload, @Body() body: { firstName?: string; phoneSecondary?: string | null }) {
    const c = await this.me(user);
    if (body.firstName !== undefined) {
      const name = (body.firstName ?? '').trim();
      if (name.length < 2) throw new BadRequestException('Ism kamida 2 belgi');
      c.firstName = name.slice(0, 80);
    }
    if (body.phoneSecondary !== undefined) {
      const p = body.phoneSecondary ? normalizePhone(body.phoneSecondary) : null;
      if (p && !/^\+\d{9,15}$/.test(p)) throw new BadRequestException('Qo‘shimcha raqam noto‘g‘ri');
      c.phoneSecondary = p;
    }
    await this.clients.save(c);
    return this.auth.publicClient(c);
  }

  @Get('tariff')
  async getTariff() {
    const t = await this.tariff.getCurrent();
    return {
      pricePerKm: Number(t.pricePerKm),
      minimumFare: Number(t.minimumFare),
      waitingFreeMinutes: Number(t.waitingFreeMinutes ?? 0),
      waitingPricePerMinute: Number(t.waitingPricePerMinute ?? 0),
      tiers: (t as any).tiers ?? null,
      zonePolygon: t.zonePolygon ?? [],
      outsidePricePerKm: Number(t.outsidePricePerKm ?? 0),
    };
  }

  // --- orders ---------------------------------------------------------------

  @Get('orders/active')
  async active(@CurrentUser() user: JwtPayload) {
    const o = await this.orders.findOne({
      where: { clientId: user.sub, status: In(ACTIVE) },
      relations: { driver: true },
      order: { createdAt: 'DESC' },
    });
    return o ? orderForClient(o) : null;
  }

  @Post('orders')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      lat: number;
      lng: number;
      address?: string;
      dest?: { lat: number; lng: number; address?: string } | null;
    },
  ) {
    const c = await this.me(user);
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException('Joylashuv noto‘g‘ri');
    }
    const existing = await this.orders.findOne({ where: { clientId: c.id, status: In(ACTIVE) } });
    if (existing) throw new BadRequestException('Sizda faol buyurtma bor');
    const dLat = Number(body.dest?.lat);
    const dLng = Number(body.dest?.lng);
    const hasDest = body.dest && Number.isFinite(dLat) && Number.isFinite(dLng) && Math.abs(dLat) <= 90 && Math.abs(dLng) <= 180;
    const order = await this.orderService.create({
      clientId: c.id,
      pickupLat: lat,
      pickupLng: lng,
      pickupAddress: body.address?.trim().slice(0, 200) || undefined,
      destinationLat: hasDest ? dLat : undefined,
      destinationLng: hasDest ? dLng : undefined,
      destinationAddress: hasDest ? body.dest?.address?.trim().slice(0, 200) || undefined : undefined,
    });
    return orderForClient(order);
  }

  @Get('orders')
  async history(@CurrentUser() user: JwtPayload) {
    const rows = await this.orders.find({
      where: { clientId: user.sub },
      relations: { driver: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((o) => orderForClient(o));
  }

  @Get('orders/:id')
  async one(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return orderForClient(await this.own(user, id));
  }

  @Post('orders/:id/cancel')
  async cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const o = await this.own(user, id);
    if (o.status === OrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Safar boshlangan — bekor qilib bo‘lmaydi');
    }
    if (o.status === OrderStatus.COMPLETED || o.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Buyurtma allaqachon yakunlangan');
    }
    const saved = await this.orderService.cancel(id, 'client');
    return orderForClient(saved, o.driver);
  }

  // --- chat -----------------------------------------------------------------

  @Get('orders/:id/messages')
  async messages(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.own(user, id);
    return this.chat.listForClient(user.sub, id);
  }

  @Post('orders/:id/messages')
  async send(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { text: string }) {
    await this.own(user, id);
    return this.chat.sendFromClientToOrder(user.sub, id, body?.text ?? '');
  }

  // --- bonus / promo --------------------------------------------------------

  @Get('orders/:id/bonus-max')
  async bonusMax(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.own(user, id);
    try {
      const r = await this.bonus.maxForOrder(user.sub, id);
      return { max: r.max, capPercent: r.capPercent, promoNote: r.promoNote, balance: r.client.balance };
    } catch (e) {
      return { max: 0, reason: (e as Error).message };
    }
  }

  @Post('orders/:id/bonus')
  async bonusRequest(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { amount: number }) {
    await this.own(user, id);
    const p = await this.bonus.request(user.sub, id, Number(body?.amount));
    return { id: p.id, amount: p.amount, status: p.status };
  }

  @Post('promo/claim')
  async claim(@CurrentUser() user: JwtPayload, @Body() body: { code: string }) {
    await this.me(user);
    const r = await this.promo.claim(user.sub, body?.code ?? '');
    const c = await this.me(user);
    const ridesDone = await this.promo.completedRides(user.sub);
    return {
      amount: r.amount,
      balance: c.balance,
      code: r.promo?.code,
      minRides: Number(r.promo?.minRides ?? 0),
      ridesDone,
      lockNote: this.promo.lockNote(r.promo, ridesDone),
    };
  }

  // --- receipts -------------------------------------------------------------

  @Get('receipts/:id')
  async receipt(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.own(user, id);
    return this.receipts.dataFor(id);
  }
}
