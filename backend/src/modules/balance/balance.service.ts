import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BalanceTransaction,
  BalanceTxType,
} from './balance-transaction.entity';
import { Driver } from '../driver/driver.entity';

export interface AdjustParams {
  driverId: string;
  amount: number;
  type: BalanceTxType;
  orderId?: string | null;
  note?: string | null;
}

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(BalanceTransaction)
    private readonly txRepo: Repository<BalanceTransaction>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    private readonly ds: DataSource,
  ) {}

  /** Atomic balance change. amount can be negative. */
  async adjust(params: AdjustParams): Promise<{
    balance: string;
    tx: BalanceTransaction;
  }> {
    if (!Number.isFinite(params.amount)) {
      throw new BadRequestException('amount must be a finite number');
    }
    return this.ds.transaction(async (em) => {
      const driver = await em.getRepository(Driver)
        .createQueryBuilder('d')
        .setLock('pessimistic_write')
        .where('d.id = :id', { id: params.driverId })
        .getOne();
      if (!driver) throw new BadRequestException('Driver not found');

      const next = Number(driver.balance) + params.amount;
      driver.balance = next.toFixed(2);
      await em.save(driver);

      const tx = em.getRepository(BalanceTransaction).create({
        driverId: driver.id,
        amount: params.amount.toFixed(2),
        type: params.type,
        orderId: params.orderId ?? null,
        note: params.note ?? null,
      });
      await em.save(tx);
      return { balance: driver.balance, tx };
    });
  }

  list(driverId: string, limit = 50) {
    return this.txRepo.find({
      where: { driverId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
