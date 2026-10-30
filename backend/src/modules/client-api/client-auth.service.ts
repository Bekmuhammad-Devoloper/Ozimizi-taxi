import * as crypto from 'crypto';
import {
  UnauthorizedException,
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Client } from '../client/client.entity';
import { ClientAuthEvents } from './client-auth.events';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

interface PendingCode {
  code: string;
  expiresAt: number;
  attempts: number;
}

const CODE_TTL_MS = 5 * 60_000;
const RESEND_GAP_MS = 30_000;

export function normalizePhone(raw: string): string {
  let d = (raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  // Local Uzbek number typed without the country code: 90 123 45 67.
  if (d.length === 9) d = '998' + d;
  return '+' + d;
}

/**
 * Passwordless login for the client app: the phone must already be
 * registered in the Telegram bot; a one-time code is sent to that chat.
 */
@Injectable()
export class ClientAuthService {
  private readonly pending = new Map<string, PendingCode & { sentAt: number }>();
  private readonly logger = new Logger(ClientAuthService.name);

  constructor(
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly jwt: JwtService,
    private readonly events: ClientAuthEvents,
    private readonly config: ConfigService,
  ) {}

  /**
   * Telegram Mini App login: initData signed with the client bot's token →
   * the client registered in the bot with that Telegram id.
   */
  async telegramWebApp(initData: string) {
    const token = this.config.get<string>('BOT_TOKEN') ?? '';
    if (!token || !initData) throw new UnauthorizedException('Telegram ma’lumoti yo‘q');
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('initData hash yo‘q');
    params.delete('hash');
    const check = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(String.fromCharCode(10));
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
    if (calc !== hash) throw new UnauthorizedException('initData imzosi noto‘g‘ri');
    const authDate = Number(params.get('auth_date'));
    if (Number.isFinite(authDate) && Date.now() / 1000 - authDate > 24 * 3600) {
      throw new UnauthorizedException('initData eskirgan');
    }
    let tgId = NaN;
    try {
      tgId = Number(JSON.parse(params.get('user') ?? '{}')?.id);
    } catch {
      /* invalid json */
    }
    if (!Number.isFinite(tgId)) throw new UnauthorizedException('Telegram foydalanuvchisi aniqlanmadi');
    const client = await this.clients.findOne({ where: { telegramId: String(tgId) } });
    if (!client) throw new UnauthorizedException('Avval botda /start bosib ro‘yxatdan o‘ting');
    if (client.isBlocked) throw new UnauthorizedException('Hisobingiz bloklangan');
    const payload = { sub: client.id, role: 'client' as const, phone: client.phonePrimary };
    return {
      access_token: await this.jwt.signAsync(payload, { expiresIn: '90d' }),
      client: this.publicClient(client),
    };
  }

  private botUsername(): string {
    return this.config.get<string>('BOT_USERNAME') ?? 'Moviytaxibot';
  }

  /** Bot stores "+998…"; accept the same number typed without "+" too. */
  private findByPhone(phone: string) {
    return this.clients.findOne({
      where: [{ phonePrimary: phone }, { phonePrimary: phone.slice(1) }],
    });
  }

  async requestCode(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (!/^\+\d{9,15}$/.test(phone)) {
      throw new BadRequestException('Telefon raqam noto‘g‘ri');
    }
    const client = await this.findByPhone(phone);
    if (!client) {
      throw new NotFoundException(
        `Bu raqam ro‘yxatda yo‘q. Avval @${this.botUsername()} botida ro‘yxatdan o‘ting.`,
      );
    }
    if (client.isBlocked) throw new ForbiddenException('Hisobingiz bloklangan');
    const prev = this.pending.get(phone);
    if (prev && Date.now() - prev.sentAt < RESEND_GAP_MS) {
      return { ok: true, resendIn: Math.ceil((RESEND_GAP_MS - (Date.now() - prev.sentAt)) / 1000) };
    }
    const code = String(Math.floor(10000 + Math.random() * 90000));
    this.pending.set(phone, { code, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0, sentAt: Date.now() });
    try {
      await this.events.deliver({ telegramId: client.telegramId, code, firstName: client.firstName });
    } catch (e) {
      // Bot blocked / chat deleted: the code can't reach them — say so.
      this.pending.delete(phone);
      this.logger.warn(`login code delivery failed for ${phone}: ${(e as Error).message}`);
      throw new BadGatewayException(
        `Kodni Telegram’ga yuborib bo‘lmadi. @${this.botUsername()} botini oching, /start bosing va qayta urinib ko‘ring.`,
      );
    }
    return { ok: true, resendIn: RESEND_GAP_MS / 1000, bot: this.botUsername() };
  }

  async verify(rawPhone: string, rawCode: string) {
    const phone = normalizePhone(rawPhone);
    const code = (rawCode ?? '').replace(/\D/g, '');
    const p = this.pending.get(phone);
    if (!p || p.expiresAt < Date.now()) {
      this.pending.delete(phone);
      throw new BadRequestException('Kod muddati tugagan, qaytadan so‘rang');
    }
    if (p.attempts >= 5) {
      this.pending.delete(phone);
      throw new BadRequestException('Urinishlar ko‘payib ketdi, qaytadan kod so‘rang');
    }
    if (p.code !== code) {
      p.attempts += 1;
      throw new BadRequestException('Kod noto‘g‘ri');
    }
    this.pending.delete(phone);
    const client = await this.findByPhone(phone);
    if (!client) throw new NotFoundException('Klient topilmadi');
    if (client.isBlocked) throw new ForbiddenException('Hisobingiz bloklangan');
    const payload: JwtPayload = { sub: client.id, role: 'client', phone: client.phonePrimary };
    return {
      access_token: await this.jwt.signAsync(payload, { expiresIn: '90d' }),
      client: this.publicClient(client),
    };
  }

  publicClient(c: Client) {
    return {
      id: c.id,
      firstName: c.firstName,
      phonePrimary: c.phonePrimary,
      phoneSecondary: c.phoneSecondary,
      balance: c.balance,
      refCode: c.refCode,
      inviteUrl: c.refCode ? `https://t.me/${this.botUsername()}?start=${c.refCode}` : null,
      botUrl: `https://t.me/${this.botUsername()}`,
      isBlocked: c.isBlocked,
    };
  }

  /** Test hook: the code waiting for this phone (never exposed over HTTP). */
  peekCode(rawPhone: string): string | null {
    return this.pending.get(normalizePhone(rawPhone))?.code ?? null;
  }
}
