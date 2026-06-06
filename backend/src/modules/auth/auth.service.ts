import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Driver } from '../driver/driver.entity';
import { Admin } from '../admin/admin.entity';
import { DriverLoginDto } from './dto/driver-login.dto';
import { DriverRegisterDto } from './dto/driver-register.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PasswordResetToken } from './password-reset-token.entity';
import { MailerService } from '../mailer/mailer.service';

const CODE_TTL_MIN = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return '+' + digits;
  }

  private async findDriverByPhone(rawPhone: string): Promise<Driver | null> {
    const normalized = this.normalizePhone(rawPhone);
    return this.drivers.findOne({
      where: [{ phone: normalized }, { phone: rawPhone }],
    });
  }

  async driverRegister(dto: DriverRegisterDto) {
    const phone = this.normalizePhone(dto.phone);
    const existing = await this.drivers.findOne({ where: { phone } });
    if (existing) {
      throw new BadRequestException('Bu telefon allaqachon ro‘yxatda');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const driver = this.drivers.create({
      fullName: dto.fullName.trim(),
      phone,
      passwordHash,
      isActive: true,
    });
    const saved = await this.drivers.save(driver);

    const payload: JwtPayload = {
      sub: saved.id,
      role: 'driver',
      phone: saved.phone,
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      driver: this.publicDriver(saved),
    };
  }

  async driverLogin(dto: DriverLoginDto) {
    const driver = await this.findDriverByPhone(dto.phone);
    if (!driver || !driver.isActive) {
      throw new UnauthorizedException('Telefon yoki parol noto‘g‘ri');
    }
    const ok = await bcrypt.compare(dto.password, driver.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Telefon yoki parol noto‘g‘ri');
    }

    const payload: JwtPayload = {
      sub: driver.id,
      role: 'driver',
      phone: driver.phone,
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      driver: this.publicDriver(driver),
    };
  }

  async adminLogin(dto: AdminLoginDto) {
    const admin = await this.admins.findOne({
      where: { username: dto.username },
    });
    if (!admin) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const role = (admin.role ?? 'admin') as 'admin' | 'coordinator';
    const payload: JwtPayload = {
      sub: admin.id,
      role,
      username: admin.username,
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      admin: { id: admin.id, username: admin.username, role },
    };
  }

  async verifyJwt(token: string): Promise<JwtPayload> {
    return this.jwt.verifyAsync<JwtPayload>(token);
  }

  /**
   * Validate Telegram WebApp initData and issue a JWT for the linked
   * admin/coordinator. The bot's chat (walletTelegramId on Admin) must
   * already be linked — this endpoint does NOT auto-create accounts.
   *
   * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
   */
  async telegramWebAppLogin(initData: string) {
    const tgId = await this.verifyInitDataAndGetUserId(initData);
    const admin = await this.admins.findOne({
      where: { walletTelegramId: String(tgId) as any },
    });
    if (!admin) {
      throw new UnauthorizedException(
        'Akkaunt bog‘lanmagan. Username/parolingiz bilan kiring — chat avtomatik ulanadi.',
      );
    }
    const role = (admin.role ?? 'admin') as 'admin' | 'coordinator';
    const payload: JwtPayload = {
      sub: admin.id,
      role,
      username: admin.username,
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      admin: { id: admin.id, username: admin.username, role },
    };
  }

  /**
   * First-time Telegram Mini App link: HMAC-check initData, then verify
   * the admin/coordinator credentials, then bind the wallet bot chat to
   * that admin and issue a JWT. After this call subsequent visits use
   * telegramWebAppLogin (no creds required).
   */
  async telegramWebAppLink(input: {
    initData: string;
    username: string;
    password: string;
  }) {
    const tgId = await this.verifyInitDataAndGetUserId(input.initData);
    const admin = await this.admins.findOne({
      where: { username: input.username },
    });
    if (!admin) throw new UnauthorizedException('Username yoki parol noto‘g‘ri');
    const ok = await bcrypt.compare(input.password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Username yoki parol noto‘g‘ri');

    // Detach any other admin row that previously had this chat — keeps
    // the unique partial index happy.
    await this.admins
      .createQueryBuilder()
      .update()
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(tgId) })
      .execute();
    await this.admins.update(admin.id, {
      walletTelegramId: String(tgId) as any,
    });

    const role = (admin.role ?? 'admin') as 'admin' | 'coordinator';
    const payload: JwtPayload = {
      sub: admin.id,
      role,
      username: admin.username,
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      admin: { id: admin.id, username: admin.username, role },
    };
  }

  /** Pulled out for reuse between login and link. */
  private async verifyInitDataAndGetUserId(initData: string): Promise<number> {
    const botToken = this.config.get<string>('WALLET_BOT_TOKEN') ?? '';
    if (!botToken) {
      throw new UnauthorizedException('Wallet bot is not configured');
    }
    if (!initData) throw new UnauthorizedException('initData missing');
    const params = new URLSearchParams(initData);
    const givenHash = params.get('hash');
    if (!givenHash) throw new UnauthorizedException('initData hash missing');
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    if (computedHash !== givenHash) {
      throw new UnauthorizedException('initData signature invalid');
    }
    const authDate = Number(params.get('auth_date'));
    if (
      Number.isFinite(authDate) &&
      Date.now() / 1000 - authDate > 24 * 60 * 60
    ) {
      throw new UnauthorizedException('initData expired');
    }
    let user: any = {};
    try {
      user = JSON.parse(params.get('user') ?? '{}');
    } catch {
      throw new UnauthorizedException('initData user payload invalid');
    }
    const tgId = Number(user?.id);
    if (!Number.isFinite(tgId)) {
      throw new UnauthorizedException('initData has no user id');
    }
    return tgId;
  }

  /**
   * Forgot password: generate 6-digit code, send via email if driver has one,
   * also log to backend console (dev fallback for SMS gateway).
   * Returns { ok: true } regardless to avoid leaking phone enumeration.
   */
  async forgotDriverPassword(phone: string): Promise<{ ok: true }> {
    const driver = await this.findDriverByPhone(phone);
    if (!driver || !driver.isActive) return { ok: true };

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

    await this.resetTokens.save(
      this.resetTokens.create({
        driverId: driver.id,
        tokenHash: codeHash,
        expiresAt,
      }),
    );

    // Log to console — works as SMS fallback in dev.
    this.logger.warn(
      `[RESET CODE] phone=${driver.phone} code=${code} (valid ${CODE_TTL_MIN}m)`,
    );

    if (driver.email) {
      await this.mailer.send({
        to: driver.email,
        subject: 'OZIMIZNI TAXI — Parolni tiklash kodi',
        text:
          `Salom, ${driver.fullName}!\n\n` +
          `Parolingizni tiklash kodi: ${code}\n` +
          `Kod ${CODE_TTL_MIN} daqiqa amal qiladi.\n\n` +
          `Agar bu so'rovni siz yubormagan bo'lsangiz — bu xabarni e'tiborsiz qoldiring.`,
      });
    }
    return { ok: true };
  }

  async resetDriverPassword(
    phone: string,
    code: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const driver = await this.findDriverByPhone(phone);
    if (!driver) throw new BadRequestException('Kod noto‘g‘ri');

    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const row = await this.resetTokens.findOne({
      where: { driverId: driver.id, tokenHash: codeHash },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.usedAt) {
      throw new BadRequestException('Kod noto‘g‘ri yoki ishlatilgan');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Kod muddati o‘tgan');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.drivers.update(driver.id, { passwordHash });
    row.usedAt = new Date();
    await this.resetTokens.save(row);
    return { ok: true };
  }

  private publicDriver(driver: Driver) {
    return {
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      email: driver.email,
      balance: driver.balance,
      isOnline: driver.isOnline,
      isApproved: driver.isApproved,
      avatarUrl: driver.avatarUrl,
      carModel: driver.carModel,
      carColor: driver.carColor,
      carPlate: driver.carPlate,
      carPhotoUrl: driver.carPhotoUrl,
    };
  }
}
