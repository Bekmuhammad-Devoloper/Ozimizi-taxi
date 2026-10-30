import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ReferralLink, ReferralSignup } from './referral.entity';

export interface ReferralLinkInput {
  code?: string;
  ownerName?: string;
  ownerPhone?: string | null;
  rewardAmount?: number;
  isActive?: boolean;
  note?: string | null;
}

// Telegram /start payloads allow [A-Za-z0-9_-]{1,64}.
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectRepository(ReferralLink)
    private readonly links: Repository<ReferralLink>,
    @InjectRepository(ReferralSignup)
    private readonly signups: Repository<ReferralSignup>,
  ) {}

  // --- admin ---------------------------------------------------------------

  async list() {
    const rows = await this.links.find({ order: { createdAt: 'DESC' } });
    const stats = await this.signups
      .createQueryBuilder('s')
      .select('s.link_id', 'linkId')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE s.paid_at IS NULL)', 'unpaid')
      .addSelect(
        'COALESCE(SUM(s.reward_amount) FILTER (WHERE s.paid_at IS NULL), 0)',
        'unpaidSum',
      )
      .addSelect(
        'COALESCE(SUM(s.reward_amount) FILTER (WHERE s.paid_at IS NOT NULL), 0)',
        'paidSum',
      )
      .groupBy('s.link_id')
      .getRawMany<{
        linkId: string;
        total: string;
        unpaid: string;
        unpaidSum: string;
        paidSum: string;
      }>();
    const byId = new Map(stats.map((s) => [s.linkId, s]));
    return rows.map((l) => {
      const s = byId.get(l.id);
      return {
        ...l,
        signupsCount: Number(s?.total ?? 0),
        unpaidCount: Number(s?.unpaid ?? 0),
        unpaidSum: Number(s?.unpaidSum ?? 0),
        paidSum: Number(s?.paidSum ?? 0),
      };
    });
  }

  async create(input: ReferralLinkInput) {
    const ownerName = (input.ownerName ?? '').trim();
    if (ownerName.length < 2) {
      throw new BadRequestException('Link egasining ismini kiriting');
    }
    const code = input.code?.trim()
      ? await this.assertFreeCode(input.code.trim())
      : await this.generateCode();
    const row = this.links.create({
      code,
      ownerName,
      ownerPhone: input.ownerPhone?.trim() || null,
      rewardAmount: this.parseReward(input.rewardAmount ?? 0),
      note: input.note?.trim() || null,
      isActive: input.isActive ?? true,
    });
    return this.links.save(row);
  }

  async update(id: string, input: ReferralLinkInput) {
    const row = await this.links.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Link topilmadi');
    if (input.code !== undefined && input.code.trim() !== row.code) {
      row.code = await this.assertFreeCode(input.code.trim(), id);
    }
    if (input.ownerName !== undefined) {
      const name = input.ownerName.trim();
      if (name.length < 2) {
        throw new BadRequestException('Link egasining ismini kiriting');
      }
      row.ownerName = name;
    }
    if (input.ownerPhone !== undefined) {
      row.ownerPhone = input.ownerPhone?.trim() || null;
    }
    if (input.rewardAmount !== undefined) {
      row.rewardAmount = this.parseReward(input.rewardAmount);
    }
    if (input.note !== undefined) row.note = input.note?.trim() || null;
    if (input.isActive !== undefined) row.isActive = !!input.isActive;
    return this.links.save(row);
  }

  async remove(id: string) {
    const row = await this.links.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Link topilmadi');
    const unpaid = await this.signups.count({
      where: { linkId: id, paidAt: IsNull() },
    });
    if (unpaid > 0) {
      throw new BadRequestException(
        `Bu link bo‘yicha ${unpaid} ta to‘lanmagan mukofot bor. Avval to‘lang yoki linkni o‘chirib qo‘ying (nofaol qiling).`,
      );
    }
    await this.links.remove(row);
    return { ok: true };
  }

  /** Signups for one link; `client.completedRides` = completed ride count. */
  async signupsFor(linkId: string) {
    const rows = await this.signups
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.client', 'c')
      .loadRelationCountAndMap(
        'c.completedRides',
        'c.orders',
        'o',
        (qb) => qb.andWhere("o.status = 'COMPLETED'"),
      )
      .where('s.link_id = :linkId', { linkId })
      .orderBy('s.createdAt', 'DESC')
      .take(1000)
      .getMany();
    return rows;
  }

  async markPaid(signupIds: string[]) {
    if (!signupIds.length) return { updated: 0 };
    const res = await this.signups.update(
      { id: In(signupIds), paidAt: IsNull() },
      { paidAt: new Date() },
    );
    return { updated: res.affected ?? 0 };
  }

  async markAllPaid(linkId: string) {
    const res = await this.signups.update(
      { linkId, paidAt: IsNull() },
      { paidAt: new Date() },
    );
    return { updated: res.affected ?? 0 };
  }

  async unmarkPaid(signupId: string) {
    await this.signups.update({ id: signupId }, { paidAt: null });
    return { ok: true };
  }

  // --- bot -----------------------------------------------------------------

  /**
   * Called once when a brand-new client registers with a /start payload.
   * Returns the link if the payload was an active admin-issued referral code.
   */
  async recordSignup(
    code: string | null | undefined,
    clientId: string,
  ): Promise<ReferralLink | null> {
    if (!code) return null;
    const link = await this.links.findOne({ where: { code } });
    if (!link || !link.isActive) return null;
    try {
      await this.signups.save(
        this.signups.create({
          linkId: link.id,
          clientId,
          rewardAmount: link.rewardAmount,
        }),
      );
    } catch (e) {
      // Unique client_id — the client was already counted for some link.
      this.logger.warn(`recordSignup skipped: ${(e as Error).message}`);
      return null;
    }
    return link;
  }

  private parseReward(v: number): string {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('Mukofot summasi 0 yoki musbat bo‘lsin');
    }
    return n.toFixed(2);
  }

  private async assertFreeCode(code: string, selfId?: string) {
    if (!CODE_RE.test(code)) {
      throw new BadRequestException(
        'Kod 3–32 belgi: lotin harflari, raqam, - yoki _',
      );
    }
    const clash = await this.links.findOne({ where: { code } });
    if (clash && clash.id !== selfId) {
      throw new BadRequestException('Bu kod band');
    }
    return code;
  }

  private async generateCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      let code = 'R';
      for (let j = 0; j < 7; j++) {
        code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
      if (!(await this.links.findOne({ where: { code } }))) return code;
    }
    throw new BadRequestException('Kod yaratib bo‘lmadi, qayta urinib ko‘ring');
  }
}
