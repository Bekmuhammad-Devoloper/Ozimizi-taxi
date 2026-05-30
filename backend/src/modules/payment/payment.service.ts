import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaymentRequest,
  PaymentRequestStatus,
} from './payment-request.entity';
import { Driver } from '../driver/driver.entity';
import { Admin } from '../admin/admin.entity';
import { Client } from '../client/client.entity';
import { BalanceService } from '../balance/balance.service';
import { BalanceTxType } from '../balance/balance-transaction.entity';
import { PaymentEvents } from './payment.events';

export type PaymentTarget =
  | { driverId: string; clientId?: undefined }
  | { driverId?: undefined; clientId: string };

export interface SubmitParams {
  coordinatorId: string;
  target: PaymentTarget;
  amount: number;
  note?: string | null;
}

export interface SubmitByDriverParams {
  driverId: string;
  amount: number;
  note?: string | null;
}

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentRequest)
    private readonly requests: Repository<PaymentRequest>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly balance: BalanceService,
    private readonly events: PaymentEvents,
  ) {}

  private validateAmount(amount: number) {
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException('Summa noto‘g‘ri');
    }
    if (Math.abs(amount) > 50_000_000) {
      throw new BadRequestException('Summa juda katta');
    }
  }

  private async resolveTarget(target: PaymentTarget): Promise<{
    driverId: string | null;
    clientId: string | null;
  }> {
    if (target.driverId && target.clientId) {
      throw new BadRequestException(
        'Bir vaqtning o‘zida haydovchi va klient tanlanmasin',
      );
    }
    if (target.driverId) {
      const driver = await this.drivers.findOne({
        where: { id: target.driverId },
      });
      if (!driver) throw new NotFoundException('Haydovchi topilmadi');
      if (!driver.isActive) {
        throw new BadRequestException('Haydovchi faol emas');
      }
      return { driverId: driver.id, clientId: null };
    }
    if (target.clientId) {
      const client = await this.clients.findOne({
        where: { id: target.clientId },
      });
      if (!client) throw new NotFoundException('Klient topilmadi');
      return { driverId: null, clientId: client.id };
    }
    throw new BadRequestException('Haydovchi yoki klient tanlanmagan');
  }

  /** Coordinator/admin-initiated request for either a driver or a client. */
  async submit(params: SubmitParams): Promise<PaymentRequest> {
    this.validateAmount(params.amount);
    const { driverId, clientId } = await this.resolveTarget(params.target);
    const row = this.requests.create({
      driverId,
      clientId,
      amount: params.amount.toFixed(2),
      status: PaymentRequestStatus.PENDING,
      requestedBy: params.coordinatorId,
      requestedByDriver: null,
      note: params.note ?? null,
    });
    const saved = await this.requests.save(row);
    this.events.emit('payment.submitted', { request: saved });
    return saved;
  }

  /** Client-initiated top-up request via the wallet bot. Always positive. */
  async submitByClient(params: {
    clientId: string;
    amount: number;
    note?: string | null;
  }): Promise<PaymentRequest> {
    this.validateAmount(params.amount);
    if (params.amount < 0) {
      throw new BadRequestException(
        'Klient hisobini faqat to‘ldirish mumkin, yechish admin orqali.',
      );
    }
    const client = await this.clients.findOne({
      where: { id: params.clientId },
    });
    if (!client) throw new NotFoundException('Klient topilmadi');
    const pending = await this.requests.count({
      where: {
        clientId: params.clientId,
        status: PaymentRequestStatus.PENDING,
      },
    });
    if (pending >= 3) {
      throw new BadRequestException(
        'Sizda 3 ta tasdiqlanmagan so‘rov bor. Avvalgilarini kuting.',
      );
    }
    const row = this.requests.create({
      driverId: null,
      clientId: params.clientId,
      amount: params.amount.toFixed(2),
      status: PaymentRequestStatus.PENDING,
      requestedBy: null,
      requestedByDriver: null,
      requestedByClient: params.clientId,
      note: params.note ?? null,
    });
    const saved = await this.requests.save(row);
    this.events.emit('payment.submitted', { request: saved });
    return saved;
  }

  /** Driver-initiated request via the wallet bot. Always targets self. */
  async submitByDriver(
    params: SubmitByDriverParams,
  ): Promise<PaymentRequest> {
    this.validateAmount(params.amount);
    const driver = await this.drivers.findOne({ where: { id: params.driverId } });
    if (!driver) throw new NotFoundException('Haydovchi topilmadi');
    if (!driver.isActive) {
      throw new BadRequestException('Haydovchi faol emas');
    }
    // Block duplicate pending requests from the same driver to keep the
    // admin queue from being spammed.
    const pending = await this.requests.count({
      where: {
        requestedByDriver: params.driverId,
        status: PaymentRequestStatus.PENDING,
      },
    });
    if (pending >= 3) {
      throw new BadRequestException(
        'Sizda 3 ta tasdiqlanmagan so‘rov bor. Avvalgilarini kuting.',
      );
    }
    const row = this.requests.create({
      driverId: params.driverId,
      clientId: null,
      amount: params.amount.toFixed(2),
      status: PaymentRequestStatus.PENDING,
      requestedBy: null,
      requestedByDriver: params.driverId,
      note: params.note ?? null,
    });
    const saved = await this.requests.save(row);
    this.events.emit('payment.submitted', { request: saved });
    return saved;
  }

  /** Coordinator-scoped: only own requests. */
  listOwn(coordinatorId: string, limit = 100): Promise<PaymentRequest[]> {
    return this.requests.find({
      where: { requestedBy: coordinatorId },
      relations: { driver: true, client: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Driver-scoped: own requests submitted via the wallet bot. */
  listByDriver(driverId: string, limit = 20): Promise<PaymentRequest[]> {
    return this.requests.find({
      where: { requestedByDriver: driverId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Client-scoped: own top-up requests submitted via the wallet bot. */
  listByClient(clientId: string, limit = 20): Promise<PaymentRequest[]> {
    return this.requests.find({
      where: { requestedByClient: clientId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Admin-scoped: every request, optionally filtered by status. */
  listAll(
    status?: PaymentRequestStatus,
    limit = 200,
  ): Promise<PaymentRequest[]> {
    return this.requests.find({
      where: status ? { status } : {},
      relations: {
        driver: true,
        client: true,
        requester: true,
        decider: true,
        driverRequester: true,
        clientRequester: true,
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Coordinator-visible pending queue: bot-initiated requests (driver or
   * client self-submits) that need a verdict. Coordinators' own
   * /coordinator/requests submissions are excluded — those are admin-only
   * to approve so a coordinator can't sign off on their own ask.
   */
  listPendingForCoordinator(limit = 100): Promise<PaymentRequest[]> {
    return this.requests
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.driver', 'd')
      .leftJoinAndSelect('r.client', 'c')
      .leftJoinAndSelect('r.driverRequester', 'dr')
      .leftJoinAndSelect('r.clientRequester', 'cr')
      .where('r.status = :s', { s: PaymentRequestStatus.PENDING })
      .andWhere(
        '(r.requested_by_driver IS NOT NULL OR r.requested_by_client IS NOT NULL)',
      )
      .orderBy('r.created_at', 'DESC')
      .take(limit)
      .getMany();
  }

  async approve(
    requestId: string,
    adminId: string,
  ): Promise<PaymentRequest> {
    const row = await this.requests.findOne({ where: { id: requestId } });
    if (!row) throw new NotFoundException('So‘rov topilmadi');
    if (row.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException('So‘rov allaqachon ko‘rib chiqilgan');
    }
    const amount = Number(row.amount);
    const noteFallback =
      row.note?.trim() ||
      `Payment request ${row.id.slice(0, 8).toUpperCase()}`;

    // Dispatch to the right balance helper based on the target. Both keep
    // the closed-loop treasury invariant.
    let resolvedBalance: number | undefined;
    if (row.driverId) {
      await this.balance.adjust({
        driverId: row.driverId,
        amount,
        type:
          amount >= 0 ? BalanceTxType.TOPUP : BalanceTxType.WITHDRAW,
        note: noteFallback,
      });
      const driver = await this.drivers.findOne({
        where: { id: row.driverId },
      });
      resolvedBalance = driver ? Number(driver.balance) : undefined;
    } else if (row.clientId) {
      const res = await this.balance.adjustClient({
        clientId: row.clientId,
        amount,
        note: noteFallback,
      });
      resolvedBalance = Number(res.balance);
    } else {
      throw new BadRequestException('So‘rovning manzili noaniq');
    }

    row.status = PaymentRequestStatus.APPROVED;
    row.decidedBy = adminId;
    row.decidedAt = new Date();
    const saved = await this.requests.save(row);
    this.events.emit('payment.approved', {
      request: saved,
      driverBalance: resolvedBalance,
    });
    return saved;
  }

  async reject(
    requestId: string,
    adminId: string,
  ): Promise<PaymentRequest> {
    const row = await this.requests.findOne({ where: { id: requestId } });
    if (!row) throw new NotFoundException('So‘rov topilmadi');
    if (row.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException('So‘rov allaqachon ko‘rib chiqilgan');
    }
    row.status = PaymentRequestStatus.REJECTED;
    row.decidedBy = adminId;
    row.decidedAt = new Date();
    const saved = await this.requests.save(row);
    this.events.emit('payment.rejected', { request: saved });
    return saved;
  }

  /** Driver listing for the coordinator — strictly minimal fields. */
  async listDriversForCoordinator() {
    const rows = await this.drivers.find({
      where: { isActive: true },
      order: { fullName: 'ASC' },
    });
    return rows.map((d) => ({
      id: d.id,
      fullName: d.fullName,
      phone: d.phone,
    }));
  }

  /** Client listing for the coordinator — strictly minimal fields. */
  async listClientsForCoordinator() {
    const rows = await this.clients.find({
      order: { firstName: 'ASC' },
    });
    return rows.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      phonePrimary: c.phonePrimary,
    }));
  }
}
