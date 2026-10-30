import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { BonusPayment, BonusPaymentStatus } from './bonus-payment.entity';
import { BonusEvents } from './bonus.events';
import { Order, OrderStatus } from '../order/order.entity';
import { Client } from '../client/client.entity';
import { BalanceService } from '../balance/balance.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { PromoService } from '../promo/promo.service';

@Injectable()
export class BonusService {
  constructor(
    @InjectRepository(BonusPayment)
    private readonly payments: Repository<BonusPayment>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly balance: BalanceService,
    private readonly realtime: RealtimeService,
    private readonly events: BonusEvents,
    private readonly settings: SettingsService,
    private readonly promo: PromoService,
    private readonly ds: DataSource,
  ) {}

  /** Cash still owed on a finished ride after promo discount and bonus. */
  static cashDue(order: Order): number {
    return Math.max(
      0,
      Number(order.price ?? 0) -
        Number(order.discount ?? 0) -
        Number(order.bonusUsed ?? 0),
    );
  }

  /** How much bonus the client could still put towards this order. */
  async maxForOrder(clientId: string, orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.clientId !== clientId) {
      throw new NotFoundException('Buyurtma topilmadi');
    }
    if (order.status !== OrderStatus.COMPLETED || !order.driverId) {
      throw new BadRequestException('Bonus faqat yakunlangan safar uchun');
    }
    const open = await this.payments.findOne({
      where: {
        orderId,
        status: In([BonusPaymentStatus.PENDING, BonusPaymentStatus.APPROVED]),
      },
    });
    if (open) {
      throw new BadRequestException(
        open.status === BonusPaymentStatus.PENDING
          ? 'Bu safar uchun so‘rov allaqachon yuborilgan, haydovchi javobini kuting'
          : 'Bu safar uchun bonus allaqachon ishlatilgan',
      );
    }
    const client = await this.clients.findOneOrFail({ where: { id: clientId } });
    const price = Number(order.price ?? 0);
    // Admin may cap how much of a ride can be paid from bonus (% of fare).
    const pct = Number((await this.settings.get('bonus_max_percent_per_ride')) || '0');
    const cap = pct > 0 ? Math.floor((price * pct) / 100) : Infinity;
    // Promo money on the balance is limited per ride by each promo's own
    // rule; the rest of the balance (referral etc.) is unrestricted.
    const promo = await this.promo.allowanceFor(clientId, price);
    const free = Math.max(0, Number(client.balance) - promo.locked);
    const spendable = free + Math.min(promo.allowed, Number(client.balance));
    const max = Math.min(spendable, BonusService.cashDue(order), cap);
    const promoNote =
      promo.rules.length > 0
        ? promo.rules
            .map((r) => {
              if (!r.unlocked) {
                return `${r.code}: 🔒 ${r.minRides} ta safardan keyin ochiladi (hozir ${r.ridesDone} ta), qoldiq ${r.remaining.toLocaleString('uz')} so‘m`;
              }
              const rule = [r.pct > 0 ? `narxning ${r.pct}%` : null, r.amount > 0 ? `${r.amount.toLocaleString('uz')} so‘m` : null]
                .filter(Boolean)
                .join(', ko‘pi bilan ');
              return `${r.code}: qoldiq ${r.remaining.toLocaleString('uz')} so‘m, bu safarda ${r.cap.toLocaleString('uz')} so‘m gacha${rule ? ` (${rule})` : ''}`;
            })
            .join('\n')
        : null;
    return { order, client, max: Math.max(0, Math.floor(max)), capPercent: pct, promoNote };
  }

  /** Client asks to pay `amount` of the ride from bonus; driver must confirm. */
  async request(clientId: string, orderId: string, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Summa noto‘g‘ri');
    }
    const { order, client, max } = await this.maxForOrder(clientId, orderId);
    if (max <= 0) throw new BadRequestException('Bonus balansingiz yetarli emas');
    if (amount > max) {
      throw new BadRequestException(`Maksimal ${max.toLocaleString('uz')} so‘m`);
    }
    const saved = await this.payments.save(
      this.payments.create({
        orderId,
        clientId,
        driverId: order.driverId!,
        amount: amount.toFixed(2),
        status: BonusPaymentStatus.PENDING,
      }),
    );
    this.realtime.emitToDriver(order.driverId!, 'bonus_request', this.toDriverPayload(saved, client.firstName, order));
    return saved;
  }

  /** Driver app: bonus requests waiting for this driver's answer. */
  async pendingForDriver(driverId: string) {
    const rows = await this.payments.find({
      where: { driverId, status: BonusPaymentStatus.PENDING },
      relations: { client: true, order: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((p) => this.toDriverPayload(p, p.client.firstName, p.order));
  }

  async decide(driverId: string, paymentId: string, approve: boolean) {
    const payment = await this.ds.transaction(async (em) => {
      const repo = em.getRepository(BonusPayment);
      const p = await repo.findOne({
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!p || p.driverId !== driverId) throw new NotFoundException('So‘rov topilmadi');
      if (p.status !== BonusPaymentStatus.PENDING) {
        throw new BadRequestException('So‘rov allaqachon ko‘rib chiqilgan');
      }
      p.status = approve ? BonusPaymentStatus.APPROVED : BonusPaymentStatus.REJECTED;
      p.decidedAt = new Date();
      await repo.save(p);
      if (approve) {
        await em
          .getRepository(Order)
          .increment({ id: p.orderId }, 'bonusUsed', Number(p.amount));
      }
      return p;
    });

    if (approve) {
      // Separate transaction (own locks); if it fails the payment is still
      // APPROVED, so surface the error rather than hide it.
      await this.balance.payBonusToDriver({
        clientId: payment.clientId,
        driverId: payment.driverId,
        amount: Number(payment.amount),
        orderId: payment.orderId,
      });
      // Book the spent promo money (per-ride caps) — best effort.
      const o = await this.orders.findOne({ where: { id: payment.orderId } });
      await this.promo
        .spend(payment.clientId, payment.orderId, Number(payment.amount), Number(o?.price ?? 0))
        .catch(() => undefined);
    }
    const order = await this.orders.findOneOrFail({ where: { id: payment.orderId } });
    this.events.emitDecided({ payment, order, approved: approve });
    return { payment, order };
  }

  private toDriverPayload(p: BonusPayment, clientName: string, order: Order) {
    return {
      id: p.id,
      orderId: p.orderId,
      amount: Number(p.amount),
      clientName,
      price: Number(order.price ?? 0),
      cashAfter: Math.max(0, BonusService.cashDue(order) - Number(p.amount)),
      createdAt: p.createdAt,
    };
  }
}
