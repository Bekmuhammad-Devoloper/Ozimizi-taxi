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
import { LedgerEvent, LedgerKind } from './ledger-event.entity';

export const SYSTEM_TOTAL = 100_000_000;

export interface AdjustParams {
  driverId: string;
  amount: number;
  type: BalanceTxType;
  orderId?: string | null;
  note?: string | null;
  /**
   * Let the driver's balance go below zero (debt). Used for ride commission:
   * a finished ride must never be blocked by an empty balance — the driver
   * tops up later.
   */
  allowNegative?: boolean;
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
      if (!params.allowNegative) this.assertNonNegative(nextDriver, 'haydovchi');
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
      await this.journal(em, {
        kind: 'driver_adjust',
        amount: fmt(-params.amount),
        treasuryAfter: admin.balance,
        driverId: driver.id,
        orderId: params.orderId ?? null,
        note: `${params.type}${params.note ? ': ' + params.note : ''}`,
      });
      return { balance: driver.balance, tx };
    });
  }

  /**
   * Client bonus → driver balance (driver confirmed the client paying part
   * of the fare from bonus). Treasury is untouched: money just moves from
   * the client's purse to the driver's.
   */
  async payBonusToDriver(params: {
    clientId: string;
    driverId: string;
    amount: number;
    orderId: string;
  }): Promise<{ clientBalance: string; driverBalance: string }> {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new BadRequestException('Summa noto‘g‘ri');
    }
    return this.ds.transaction(async (em) => {
      const client = await this.lockClient(em, params.clientId);
      const driver = await this.lockDriver(em, params.driverId);
      const nextClient = Number(client.balance) - params.amount;
      this.assertNonNegative(nextClient, 'klient bonus');
      client.balance = fmt(nextClient);
      driver.balance = fmt(Number(driver.balance) + params.amount);
      await em.save(client);
      await em.save(driver);
      await em.save(
        em.getRepository(BalanceTransaction).create({
          driverId: driver.id,
          amount: fmt(params.amount),
          type: BalanceTxType.BONUS,
          orderId: params.orderId,
          note: `Mijoz bonusidan to‘lov (${client.firstName})`,
        }),
      );
      await this.journal(em, {
        kind: 'bonus_to_driver',
        amount: fmt(params.amount),
        clientId: client.id,
        driverId: driver.id,
        orderId: params.orderId,
        note: 'Mijoz bonusi → haydovchi (xazina o‘zgarmaydi)',
      });
      return { clientBalance: client.balance, driverBalance: driver.balance };
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
      await this.journal(em, {
        kind: 'client_adjust',
        amount: fmt(-params.amount),
        treasuryAfter: admin.balance,
        clientId: client.id,
        note: params.note ?? null,
      });
      return { balance: client.balance };
    });
  }

  /**
   * Treasury ↔ kitchen wallet (closed loop). Positive = admin tops the
   * kitchen up; negative = commission / claw-back. `allowNegative` lets a
   * commission push the kitchen into debt (it tops up later).
   */
  async adjustKitchen(params: {
    kitchenId: string;
    amount: number;
    note?: string | null;
    allowNegative?: boolean;
  }): Promise<{ balance: string }> {
    if (!Number.isFinite(params.amount) || params.amount === 0) {
      throw new BadRequestException('Summa noto‘g‘ri');
    }
    return this.ds.transaction(async (em) => {
      const [k] = (await em.query(`SELECT id, balance FROM kitchens WHERE id = $1 FOR UPDATE`, [params.kitchenId])) as {
        id: string;
        balance: string;
      }[];
      if (!k) throw new BadRequestException('Oshxona topilmadi');
      const admin = await this.lockTreasury(em);
      const nextKitchen = Number(k.balance) + params.amount;
      const nextAdmin = Number(admin.balance) - params.amount;
      if (!params.allowNegative) this.assertNonNegative(nextKitchen, 'oshxona');
      this.assertNonNegative(nextAdmin, 'admin (treasury)');
      await em.query(`UPDATE kitchens SET balance = $2 WHERE id = $1`, [k.id, fmt(nextKitchen)]);
      admin.balance = fmt(nextAdmin);
      await em.save(admin);
      await this.journal(em, {
        kind: 'kitchen_adjust',
        amount: fmt(-params.amount),
        treasuryAfter: admin.balance,
        kitchenId: k.id,
        note: params.note ?? null,
      });
      return { balance: fmt(nextKitchen) };
    });
  }

  /** Last wallet movements of a kitchen (admin + kitchen panel). */
  kitchenLedger(kitchenId: string, limit = 50) {
    return this.ds.query(
      `SELECT id, kind, (-amount)::float AS amount, note, created_at AS "createdAt"
         FROM ledger_events WHERE kitchen_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [kitchenId, Math.min(200, Math.max(1, limit))],
    );
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
      await this.journal(em, {
        kind: 'driver_drain',
        amount: fmt(remaining),
        treasuryAfter: admin.balance,
        driverId: driver.id,
        note,
      });
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

  /**
   * Move funds between the treasury and a coordinator's purse.
   * Positive amount = treasury → coord (allocation).
   * Negative amount = coord → treasury (claw-back).
   * Coordinator can then transfer from their purse without further
   * admin approval.
   */
  async allocateToCoordinator(params: {
    coordId: string;
    amount: number;
    note?: string | null;
  }): Promise<{ coordBalance: string; treasuryBalance: string }> {
    if (!Number.isFinite(params.amount) || params.amount === 0) {
      throw new BadRequestException('Summa noto‘g‘ri');
    }
    return this.ds.transaction(async (em) => {
      const treasury = await this.lockTreasury(em);
      const coord = await this.lockAdmin(em, params.coordId);
      if (coord.id === treasury.id) {
        throw new BadRequestException('Treasury admin allocate sub-account emas');
      }
      if ((coord.role ?? 'admin') !== 'coordinator') {
        throw new BadRequestException('Faqat koordinatorga ajratish mumkin');
      }
      const nextTreasury = Number(treasury.balance) - params.amount;
      const nextCoord = Number(coord.balance) + params.amount;
      this.assertNonNegative(nextTreasury, 'xazina');
      this.assertNonNegative(nextCoord, 'koordinator');
      treasury.balance = fmt(nextTreasury);
      coord.balance = fmt(nextCoord);
      await em.save(treasury);
      await em.save(coord);
      await this.journal(em, {
        kind: 'coord_allocate',
        amount: fmt(-params.amount),
        treasuryAfter: treasury.balance,
        coordAfter: coord.balance,
        coordId: coord.id,
        note: params.note ?? null,
      });
      return {
        coordBalance: coord.balance,
        treasuryBalance: treasury.balance,
      };
    });
  }

  /**
   * Direct transfer from coordinator's purse to a driver or client.
   * Atomic and irrevocable — no admin approval step. The driver tx is
   * journaled in balance_transactions; the coord side is reflected
   * only in admin.balance (no separate ledger table yet).
   */
  async adjustFromCoordinator(params: {
    coordId: string;
    driverId?: string;
    clientId?: string;
    amount: number;
    type: BalanceTxType;
    note?: string | null;
  }): Promise<{ targetBalance: string; coordBalance: string }> {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new BadRequestException(
        'Koordinator faqat pul tashlay oladi. Yechish admin orqali.',
      );
    }
    if (!params.driverId && !params.clientId) {
      throw new BadRequestException('Haydovchi yoki klient tanlang');
    }
    if (params.driverId && params.clientId) {
      throw new BadRequestException(
        'Bir vaqtning o‘zida haydovchi va klient tanlanmasin',
      );
    }
    return this.ds.transaction(async (em) => {
      const coord = await this.lockAdmin(em, params.coordId);
      if ((coord.role ?? 'admin') !== 'coordinator') {
        throw new BadRequestException('Faqat koordinator o‘tkazma qila oladi');
      }
      // Topup = coord-balance debited, target credited.
      // Withdraw = target debited, coord credited (returns to purse).
      const sign = params.amount >= 0 ? 1 : -1;
      const absAmt = Math.abs(params.amount);
      const nextCoord =
        Number(coord.balance) - sign * absAmt; // positive transfer leaves purse
      this.assertNonNegative(nextCoord, 'koordinator hamyoni');

      let targetBalance = '';
      if (params.driverId) {
        const driver = await this.lockDriver(em, params.driverId);
        const nextDriver = Number(driver.balance) + sign * absAmt;
        // A top-up may leave a driver in debt still below zero (it only
        // reduces the debt) — block only withdrawals that would go negative.
        if (sign < 0) this.assertNonNegative(nextDriver, 'haydovchi');
        driver.balance = fmt(nextDriver);
        await em.save(driver);
        await em.save(
          em.getRepository(BalanceTransaction).create({
            driverId: driver.id,
            amount: fmt(sign * absAmt),
            type: params.type,
            note: params.note ?? `Coordinator ${coord.username}`,
          }),
        );
        targetBalance = driver.balance;
      } else if (params.clientId) {
        const client = await this.lockClient(em, params.clientId);
        const nextClient = Number(client.balance) + sign * absAmt;
        this.assertNonNegative(nextClient, 'klient');
        client.balance = fmt(nextClient);
        await em.save(client);
        targetBalance = client.balance;
      }

      coord.balance = fmt(nextCoord);
      await em.save(coord);
      await this.journal(em, {
        kind: 'coord_transfer',
        amount: fmt(-sign * absAmt),
        coordAfter: coord.balance,
        coordId: coord.id,
        driverId: params.driverId ?? null,
        clientId: params.clientId ?? null,
        note: params.note ?? null,
      });
      return { targetBalance, coordBalance: coord.balance };
    });
  }

  async coordinatorBalance(coordId: string): Promise<string> {
    const a = await this.admins.findOne({ where: { id: coordId } });
    return a?.balance ?? '0.00';
  }

  /**
   * Closed-loop check: treasury + coordinator purses + all driver balances
   * + all client balances must equal SYSTEM_TOTAL. Pending payment requests
   * are informational (nothing is reserved until approval).
   */
  async integrity() {
    const one = async (sql: string) => Number((await this.ds.query(sql))[0]?.v ?? 0);
    const treasury = await one(`SELECT COALESCE(SUM(balance),0) AS v FROM admins WHERE role IS NULL OR role <> 'coordinator'`);
    const coordinators = await one(`SELECT COALESCE(SUM(balance),0) AS v FROM admins WHERE role = 'coordinator'`);
    const drivers = await one(`SELECT COALESCE(SUM(balance),0) AS v FROM drivers WHERE deleted_at IS NULL`);
    const driversDeleted = await one(`SELECT COALESCE(SUM(balance),0) AS v FROM drivers WHERE deleted_at IS NOT NULL`);
    const clients = await one(`SELECT COALESCE(SUM(balance),0) AS v FROM clients`);
    const kitchens = await one(`SELECT COALESCE(SUM(balance),0) AS v FROM kitchens`).catch(() => 0);
    const pending = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM payment_requests WHERE status = 'PENDING'`);
    const total = treasury + coordinators + drivers + driversDeleted + clients + kitchens;
    return {
      treasury,
      coordinators,
      drivers,
      driversDeleted,
      clients,
      kitchens,
      pending,
      total,
      expected: SYSTEM_TOTAL,
      diff: Math.round((total - SYSTEM_TOTAL) * 100) / 100,
      ok: Math.abs(total - SYSTEM_TOTAL) < 0.005,
    };
  }

  /** Latest treasury-journal rows with names resolved. */
  events(limit = 60) {
    return this.ds.query(
      `SELECT e.id, e.kind, e.amount, e.treasury_after AS "treasuryAfter", e.coord_after AS "coordAfter",
              e.note, e.created_at AS "createdAt", e.order_id AS "orderId",
              d.full_name AS "driverName", c.first_name AS "clientName", a.username AS "coordName"
         FROM ledger_events e
         LEFT JOIN drivers d ON d.id = e.driver_id
         LEFT JOIN clients c ON c.id = e.client_id
         LEFT JOIN admins a ON a.id = e.coord_id
        ORDER BY e.created_at DESC
        LIMIT $1`,
      [Math.min(500, Math.max(1, limit))],
    );
  }

  /**
   * Manual correction of the treasury (admin only) — used to put money
   * back that was lost to an old bug. Always journaled.
   */
  async reconcile(amount: number, note: string) {
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException('Summa noto‘g‘ri');
    }
    return this.ds.transaction(async (em) => {
      const treasury = await this.lockTreasury(em);
      treasury.balance = fmt(Number(treasury.balance) + amount);
      await em.save(treasury);
      await this.journal(em, {
        kind: 'reconcile',
        amount: fmt(amount),
        treasuryAfter: treasury.balance,
        note,
      });
      return { treasuryBalance: treasury.balance };
    });
  }

  private async journal(em: EntityManager, e: Partial<LedgerEvent> & { kind: LedgerKind; amount: string }) {
    const repo = em.getRepository(LedgerEvent);
    await repo.save(repo.create(e));
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

  /** Pessimistic-write lock on any admin row (treasury or coordinator). */
  private async lockAdmin(em: EntityManager, id: string): Promise<Admin> {
    const admin = await em
      .getRepository(Admin)
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where('a.id = :id', { id })
      .getOne();
    if (!admin) throw new BadRequestException('Admin not found');
    return admin;
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
