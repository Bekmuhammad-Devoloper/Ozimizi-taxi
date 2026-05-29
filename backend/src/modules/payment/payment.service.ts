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

export interface SubmitParams {
  coordinatorId: string;
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
  ) {}

  async submit(params: SubmitParams): Promise<PaymentRequest> {
    if (!Number.isFinite(params.amount) || params.amount === 0) {
      throw new BadRequestException('amount noto‘g‘ri');
    }
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
      note: params.note ?? null,
    });
    return this.requests.save(row);
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

  /** Admin-scoped: every request, optionally filtered by status. */
  listAll(
    status?: PaymentRequestStatus,
    limit = 200,
  ): Promise<PaymentRequest[]> {
    return this.requests.find({
      where: status ? { status } : {},
      relations: { driver: true, requester: true, decider: true },
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
        `Coordinator request ${row.id.slice(0, 8).toUpperCase()}`,
    });
    row.status = PaymentRequestStatus.APPROVED;
    row.decidedBy = adminId;
    row.decidedAt = new Date();
    return this.requests.save(row);
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
    return this.requests.save(row);
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
