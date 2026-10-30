import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { PromoCode, PromoRedemption } from './promo-code.entity';
import { BalanceService } from '../balance/balance.service';

export interface PromoInput {
  code?: string;
  discountAmount?: number;
  maxUses?: number | null;
  maxPercentPerRide?: number | null;
  maxAmountPerRide?: number | null;
  minRides?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

function normalizeCode(raw: string): string {
  return (raw ?? '').trim().toUpperCase();
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Sana noto‘g‘ri');
  }
  return d;
}

@Injectable()
export class PromoService {
  constructor(
    @InjectRepository(PromoCode) private readonly codes: Repository<PromoCode>,
    @InjectRepository(PromoRedemption)
    private readonly redemptions: Repository<PromoRedemption>,
    private readonly balance: BalanceService,
    private readonly ds: DataSource,
  ) {}

  // --- admin ---------------------------------------------------------------

  async list() {
    const rows = await this.codes.find({ order: { createdAt: 'DESC' } });
    const applied = await this.redemptions
      .createQueryBuilder('r')
      .select('r.promo_id', 'promoId')
      .addSelect('COUNT(*) FILTER (WHERE r.amount > r.remaining)', 'count')
      .addSelect('COALESCE(SUM(r.amount - r.remaining), 0)', 'total')
      .groupBy('r.promo_id')
      .getRawMany<{ promoId: string; count: string; total: string }>();
    const byId = new Map(applied.map((a) => [a.promoId, a]));
    return rows.map((p) => ({
      ...p,
      appliedCount: Number(byId.get(p.id)?.count ?? 0),
      appliedTotal: Number(byId.get(p.id)?.total ?? 0),
    }));
  }

  async create(input: PromoInput) {
    const code = normalizeCode(input.code ?? '');
    if (!CODE_RE.test(code)) {
      throw new BadRequestException(
        'Kod 3–32 belgi: lotin harflari, raqam, - yoki _',
      );
    }
    if (await this.codes.findOne({ where: { code } })) {
      throw new BadRequestException('Bu kod allaqachon mavjud');
    }
    const row = this.codes.create({ code, isActive: true });
    this.applyInput(row, input);
    return this.codes.save(row);
  }

  async update(id: string, input: PromoInput) {
    const row = await this.codes.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Promo kod topilmadi');
    if (input.code !== undefined) {
      const code = normalizeCode(input.code);
      if (!CODE_RE.test(code)) {
        throw new BadRequestException(
          'Kod 3–32 belgi: lotin harflari, raqam, - yoki _',
        );
      }
      const clash = await this.codes.findOne({ where: { code } });
      if (clash && clash.id !== id) {
        throw new BadRequestException('Bu kod allaqachon mavjud');
      }
      row.code = code;
    }
    this.applyInput(row, input);
    if (input.isActive !== undefined) row.isActive = !!input.isActive;
    return this.codes.save(row);
  }

  async remove(id: string) {
    const row = await this.codes.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Promo kod topilmadi');
    await this.codes.remove(row);
    return { ok: true };
  }

  redemptionsFor(promoId: string) {
    return this.redemptions.find({
      where: { promoId },
      relations: { client: true },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  private applyInput(row: PromoCode, input: PromoInput) {
    if (input.discountAmount !== undefined) {
      const amount = Number(input.discountAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('Chegirma summasi musbat bo‘lsin');
      }
      row.discountAmount = amount.toFixed(2);
    }
    if (input.maxUses !== undefined) {
      const max = input.maxUses == null ? null : Math.floor(Number(input.maxUses));
      if (max != null && (!Number.isFinite(max) || max < 1)) {
        throw new BadRequestException('Soni kamida 1 bo‘lsin');
      }
      row.maxUses = max;
    }
    if (input.maxPercentPerRide !== undefined) {
      const pct = Number(input.maxPercentPerRide ?? 0);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new BadRequestException('Foiz 0 dan 100 gacha bo‘lsin');
      }
      row.maxPercentPerRide = pct.toFixed(2);
    }
    if (input.maxAmountPerRide !== undefined) {
      const amt = Number(input.maxAmountPerRide ?? 0);
      if (!Number.isFinite(amt) || amt < 0) {
        throw new BadRequestException('Bir safardagi summa manfiy bo‘lmasin');
      }
      row.maxAmountPerRide = amt.toFixed(2);
    }
    if (input.minRides !== undefined) {
      const n = Math.floor(Number(input.minRides ?? 0));
      if (!Number.isFinite(n) || n < 0 || n > 1000) {
        throw new BadRequestException('Safarlar soni 0 dan 1000 gacha bo‘lsin');
      }
      row.minRides = n;
    }
    if (input.startsAt !== undefined) row.startsAt = parseDate(input.startsAt);
    if (input.endsAt !== undefined) row.endsAt = parseDate(input.endsAt);
    if (!row.discountAmount) {
      throw new BadRequestException('Chegirma summasi kerak');
    }
    if (row.startsAt && row.endsAt && row.startsAt >= row.endsAt) {
      throw new BadRequestException('Tugash vaqti boshlanishdan keyin bo‘lsin');
    }
  }

  // --- client (bot) --------------------------------------------------------

  /** The client's open discount (claimed, not fully spent), if any. */
  pendingFor(clientId: string) {
    return this.redemptions.findOne({
      where: { clientId, remaining: MoreThan('0') },
      relations: { promo: true },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Claim a promo code for the client's next ride. The slot is taken with a
   * single conditional UPDATE so that, when a cap is set, exactly the first
   * `maxUses` clients win even under concurrent claims.
   */
  async claim(clientId: string, rawCode: string): Promise<PromoRedemption> {
    const code = normalizeCode(rawCode);
    const promo = await this.codes.findOne({ where: { code } });
    if (!promo || !promo.isActive) {
      throw new BadRequestException('Bunday promo kod topilmadi');
    }
    const now = new Date();
    if (promo.startsAt && now < promo.startsAt) {
      throw new BadRequestException('Bu aksiya hali boshlanmagan');
    }
    if (promo.endsAt && now > promo.endsAt) {
      throw new BadRequestException('Bu aksiya muddati tugagan');
    }
    if (await this.redemptions.findOne({ where: { promoId: promo.id, clientId } })) {
      throw new BadRequestException('Siz bu promo koddan allaqachon foydalangansiz');
    }
    return this.ds.transaction(async (em) => {
      const res = await em
        .createQueryBuilder()
        .update(PromoCode)
        .set({ usedCount: () => 'used_count + 1' })
        .where('id = :id', { id: promo.id })
        .andWhere('is_active = true')
        .andWhere('(max_uses IS NULL OR used_count < max_uses)')
        .andWhere('(starts_at IS NULL OR starts_at <= now())')
        .andWhere('(ends_at IS NULL OR ends_at >= now())')
        .execute();
      if (!res.affected) {
        throw new BadRequestException(
          'Afsuski, bu aksiya o‘rinlari tugadi',
        );
      }
      const repo = em.getRepository(PromoRedemption);
      return repo.save(
        repo.create({
          promoId: promo.id,
          clientId,
          amount: promo.discountAmount,
          // Credited to the bonus balance right away (below); `remaining`
          // tracks how much of it is still unspent so per-ride caps apply.
          remaining: promo.discountAmount,
          usedAt: null,
        }),
      );
    }).then(async (saved) => {
      // The code is worth so'm on the client's bonus balance; they spend it
      // on any ride through the "pay from bonus" flow (driver confirms).
      await this.balance.adjustClient({
        clientId,
        amount: Number(promo.discountAmount),
        note: `Promo kod ${promo.code}`,
      });
      saved.promo = promo;
      return saved;
    });
  }

  /** Open redemptions (promo money not yet spent), oldest first. */
  openFor(clientId: string) {
    return this.redemptions.find({
      where: { clientId, remaining: MoreThan('0') },
      relations: { promo: true },
      order: { createdAt: 'ASC' },
    });
  }

  /** Completed rides of the client — a promo may require a minimum. */
  async completedRides(clientId: string): Promise<number> {
    const rows = (await this.ds.query(
      `SELECT COUNT(*)::int AS c FROM orders WHERE client_id = $1 AND status = 'COMPLETED'`,
      [clientId],
    )) as { c: number }[];
    return Number(rows?.[0]?.c ?? 0);
  }

  /** Has the client done enough rides for this redemption's promo? */
  private unlocked(r: PromoRedemption, done: number): boolean {
    return Number(r.promo?.minRides ?? 0) <= done;
  }

  /** Short bot/app note when a promo is still locked, else null. */
  lockNote(promo: Pick<PromoCode, 'minRides'> | null | undefined, done: number): string | null {
    const need = Number(promo?.minRides ?? 0);
    if (need <= 0 || need <= done) return null;
    return `🔒 ${need} ta safardan keyin ochiladi (hozir ${done} ta)`;
  }

  /** How much of one redemption may go towards a ride of this price. */
  private perRideCap(r: PromoRedemption, price: number, done: number): number {
    if (!this.unlocked(r, done)) return 0;
    const pct = Number(r.promo?.maxPercentPerRide ?? 0);
    const amt = Number(r.promo?.maxAmountPerRide ?? 0);
    let cap = Number(r.remaining);
    if (pct > 0) cap = Math.min(cap, Math.floor((price * pct) / 100));
    if (amt > 0) cap = Math.min(cap, amt);
    return Math.max(0, Math.floor(cap));
  }

  /**
   * Promo money on the client's bonus balance and how much of it this ride
   * may use. `locked` = total unspent promo money (the rest of the balance
   * is unrestricted), `allowed` = sum of per-promo caps for this price.
   */
  async allowanceFor(clientId: string, price: number) {
    const open = await this.openFor(clientId);
    const done = open.length ? await this.completedRides(clientId) : 0;
    const locked = open.reduce((a, r) => a + Number(r.remaining), 0);
    const allowed = open.reduce((a, r) => a + this.perRideCap(r, price, done), 0);
    const rules = open
      .filter(
        (r) =>
          Number(r.promo?.maxPercentPerRide ?? 0) > 0 ||
          Number(r.promo?.maxAmountPerRide ?? 0) > 0 ||
          Number(r.promo?.minRides ?? 0) > 0,
      )
      .map((r) => ({
        code: r.promo.code,
        remaining: Number(r.remaining),
        pct: Number(r.promo.maxPercentPerRide ?? 0),
        amount: Number(r.promo.maxAmountPerRide ?? 0),
        minRides: Number(r.promo.minRides ?? 0),
        ridesDone: done,
        unlocked: this.unlocked(r, done),
        cap: this.perRideCap(r, price, done),
      }));
    return { locked, allowed, rules, ridesDone: done };
  }

  /**
   * Record that `amount` of bonus was spent on a ride: promo money goes
   * first (within each promo's per-ride cap), anything beyond that came from
   * unrestricted bonus and needs no bookkeeping.
   */
  async spend(clientId: string, orderId: string, amount: number, price: number) {
    let left = Math.max(0, Math.floor(amount));
    const open = await this.openFor(clientId);
    const done = open.length ? await this.completedRides(clientId) : 0;
    for (const r of open) {
      if (left <= 0) break;
      const take = Math.min(this.perRideCap(r, price, done), left);
      if (take <= 0) continue;
      const res = await this.redemptions
        .createQueryBuilder()
        .update(PromoRedemption)
        .set({ remaining: () => `remaining - ${take}`, orderId, usedAt: () => 'now()' })
        .where('id = :id AND remaining >= :t', { id: r.id, t: take })
        .execute();
      if (res.affected) left -= take;
    }
    return amount - left;
  }
}
