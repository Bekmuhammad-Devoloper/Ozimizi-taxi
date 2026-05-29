import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BalanceTransaction,
  BalanceTxType,
} from './balance-transaction.entity';
import { Driver } from '../driver/driver.entity';
import { Admin } from '../admin/admin.entity';
import { Client } from '../client/client.entity';

export interface AdjustParams {
  driverId: string;
  amount: number;
  type: BalanceTxType;
  orderId?: string | null;
  note?: string | null;
}

export interface AdjustClientParams {
  clientId: string;
  amount: number;
  note?: string | null;
}

const SCALE = 2;

function fmt(n: number): string {
  return n.toFixed(SCALE);
}

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(BalanceTransaction)
    private readonly txRepo: Repository<BalanceTransaction>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly ds: DataSource,
  ) {}

  /**
   * Closed-loop ledger entry for a driver.
   * Adding amount X to a driver removes X from the treasury (and vice versa),
   * so the system-wide total is conserved.
   */
  async adjust(params: AdjustParams): Promise<{
    balance: string;
    tx: BalanceTransaction;
  }> {
    if (!Number.isFinite(params.amount)) {
      throw new BadRequestException('amount must be a finite number');
    }
    return this.ds.transaction(async (em) => {
      const driver = await this.lockDriver(em, params.driverId);
      const admin = await this.lockTreasury(em);

      const nextDriver = Number(driver.balance) + params.amount;
      const nextAdmin = Number(admin.balance) - params.amount;
      this.assertNonNegative(nextDriver, 'haydovchi');
      this.assertNonNegative(nextAdmin, 'admin (treasury)');

      driver.balance = fmt(nextDriver);
      admin.balance = fmt(nextAdmin);
      await em.save(driver);
      await em.save(admin);

      const tx = em.getRepository(BalanceTransaction).create({
        driverId: driver.id,
        amount: fmt(params.amount),
        type: params.type,
        orderId: params.orderId ?? null,
        note: params.note ?? null,
      });
      await em.save(tx);
      return { balance: driver.balance, tx };
    });
  }

  /**
   * Same closed-loop semantics for clients (used by referral bonuses and
   * admin-driven client top-ups). Client transactions are not journaled
   * separately yet — admin notes live on the driver-side tx table only.
   */
  async adjustClient(params: AdjustClientParams): Promise<{ balance: string }> {
    if (!Number.isFinite(params.amount)) {
      throw new BadRequestException('amount must be a finite number');
    }
    return this.ds.transaction(async (em) => {
      const client = await this.lockClient(em, params.clientId);
      const admin = await this.lockTreasury(em);

      const nextClient = Number(client.balance) + params.amount;
      const nextAdmin = Number(admin.balance) - params.amount;
      this.assertNonNegative(nextClient, 'klient');
      this.assertNonNegative(nextAdmin, 'admin (treasury)');

      client.balance = fmt(nextClient);
      admin.balance = fmt(nextAdmin);
      await em.save(client);
      await em.save(admin);
      return { balance: client.balance };
    });
  }

  /**
   * Force-drain a driver back to zero, returning whatever was there to the
   * treasury. Called when an admin soft-deletes a driver — the closed-loop
   * invariant requires the funds to land somewhere.
   */
  async drainDriverToTreasury(driverId: string, note = 'Driver removed') {
    return this.ds.transaction(async (em) => {
      const driver = await this.lockDriver(em, driverId);
      const remaining = Number(driver.balance);
      if (remaining === 0) return;
      const admin = await this.lockTreasury(em);
      admin.balance = fmt(Number(admin.balance) + remaining);
      driver.balance = fmt(0);
      await em.save(driver);
      await em.save(admin);
      await em.save(
        em.getRepository(BalanceTransaction).create({
          driverId: driver.id,
          amount: fmt(-remaining),
          type: BalanceTxType.ADJUSTMENT,
          note,
        }),
      );
    });
  }

  list(driverId: string, limit = 50) {
    return this.txRepo.find({
      where: { driverId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async treasuryBalance(): Promise<string> {
    const admin = await this.admins.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    return admin[0]?.balance ?? '0.00';
  }

  // --- internals -----------------------------------------------------------

  private async lockDriver(em: EntityManager, id: string): Promise<Driver> {
    const driver = await em
      .getRepository(Driver)
      .createQueryBuilder('d')
      .setLock('pessimistic_write')
      .where('d.id = :id', { id })
      .getOne();
    if (!driver) throw new BadRequestException('Driver not found');
    return driver;
  }

  private async lockClient(em: EntityManager, id: string): Promise<Client> {
    const client = await em
      .getRepository(Client)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id })
      .getOne();
    if (!client) throw new BadRequestException('Client not found');
    return client;
  }

  /**
   * The "treasury" is the oldest admin row — created at seed time with the
   * initial 100M float. Newer admins / coordinators get balance=0 and are
   * not part of the ledger; only the primary admin holds the pool.
   */
  private async lockTreasury(em: EntityManager): Promise<Admin> {
    const admin = await em
      .getRepository(Admin)
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .orderBy('a.created_at', 'ASC')
      .limit(1)
      .getOne();
    if (!admin) {
      throw new BadRequestException(
        'Treasury is not configured. Run the seed script first.',
      );
    }
    return admin;
  }

  private assertNonNegative(n: number, who: string) {
    if (n < 0) {
      throw new BadRequestException(
        `${who} balansi manfiy bo‘la olmaydi`,
      );
    }
  }
}
