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
import { BalanceService } from '../balance/balance.service';
import { BalanceTxType } from '../balance/balance-transaction.entity';
import { PaymentEvents } from './payment.events';

export interface SubmitParams {
  coordinatorId: string;
  driverId: string;
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

  async submit(params: SubmitParams): Promise<PaymentRequest> {
    this.validateAmount(params.amount);
    const driver = await this.drivers.findOne({ where: { id: params.driverId } });
    if (!driver) throw new NotFoundException('Haydovchi topilmadi');
    if (!driver.isActive) {
      throw new BadRequestException('Haydovchi faol emas');
    }
    const row = this.requests.create({
      driverId: params.driverId,
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

  /** Driver-initiated request via the wallet bot. */
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
      relations: { driver: true },
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

  /** Admin-scoped: every request, optionally filtered by status. */
  listAll(
    status?: PaymentRequestStatus,
    limit = 200,
  ): Promise<PaymentRequest[]> {
    return this.requests.find({
      where: status ? { status } : {},
      relations: {
        driver: true,
        requester: true,
        decider: true,
        driverRequester: true,
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
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
    // Execute the actual balance move atomically under the treasury invariant.
    await this.balance.adjust({
      driverId: row.driverId,
      amount: Number(row.amount),
      type:
        Number(row.amount) >= 0
          ? BalanceTxType.TOPUP
          : BalanceTxType.WITHDRAW,
      note:
        row.note?.trim() ||
        `Payment request ${row.id.slice(0, 8).toUpperCase()}`,
    });
    row.status = PaymentRequestStatus.APPROVED;
    row.decidedBy = adminId;
    row.decidedAt = new Date();
    const saved = await this.requests.save(row);
    const driver = await this.drivers.findOne({ where: { id: row.driverId } });
    this.events.emit('payment.approved', {
      request: saved,
      driverBalance: driver ? Number(driver.balance) : undefined,
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
}
