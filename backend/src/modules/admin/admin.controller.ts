import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { DriverApplicationService } from '../driver-application/driver-application.service';
import { DriverApplicationEvents } from '../driver-application/driver-application.events';
import { RealtimeService } from '../realtime/realtime.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DriverService } from '../driver/driver.service';
import { ClientService } from '../client/client.service';
import { OrderService } from '../order/order.service';
import { TariffService } from '../tariff/tariff.service';
import { CreateDriverDto } from '../driver/dto/create-driver.dto';
import { AdjustBalanceDto } from '../driver/dto/adjust-balance.dto';
import { UpdateTariffDto } from '../tariff/dto/update-tariff.dto';
import { OrderStatus } from '../order/order.entity';
import { SettingsService } from '../settings/settings.service';
import { BalanceService } from '../balance/balance.service';
import { SETTING_KEYS, SettingKey } from '../settings/site-setting.entity';
import { PaymentService } from '../payment/payment.service';
import { PaymentRequestStatus } from '../payment/payment-request.entity';
import { FeedbackService } from '../feedback/feedback.service';
import { FeedbackEvents } from '../feedback/feedback.events';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from './admin.entity';
import * as bcrypt from 'bcrypt';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';

/** 8 characters, no look-alikes (0/O, 1/l/I) — easy to dictate over the phone. */
function genPassword(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly drivers: DriverService,
    private readonly clients: ClientService,
    private readonly orders: OrderService,
    private readonly tariff: TariffService,
    private readonly settings: SettingsService,
    private readonly balance: BalanceService,
    private readonly payment: PaymentService,
    private readonly feedback: FeedbackService,
    private readonly feedbackEvents: FeedbackEvents,
    private readonly applications: DriverApplicationService,
    private readonly applicationEvents: DriverApplicationEvents,
    private readonly realtime: RealtimeService,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
  ) {}

  @Get('stats')
  async stats(@Query('period') period: 'day' | 'week' | 'month' = 'day') {
    const base = await this.orders.statsFor(period);
    const treasury = await this.balance.treasuryBalance();
    return { ...base, treasuryBalance: treasury };
  }

  /** 100M closed-loop check + treasury journal. */
  @Get('ledger')
  async ledger(@Query('limit') limit?: string) {
    return {
      integrity: await this.balance.integrity(),
      events: await this.balance.events(limit ? Number(limit) : 60),
    };
  }

  @Post('ledger/reconcile')
  reconcile(@Body() body: { amount: number; note?: string }) {
    return this.balance.reconcile(Number(body.amount), body.note?.trim() || 'Qo‘lda tuzatish');
  }

  @Get('treasury')
  async treasury() {
    return { balance: await this.balance.treasuryBalance() };
  }

  @Get('orders')
  listOrders(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
    @Query('clientId') clientId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const statuses = status
      ? (status.split(',') as OrderStatus[])
      : undefined;
    return this.orders.listForAdmin({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status: statuses,
      driverId,
      clientId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('drivers')
  listDrivers(@Query('deleted') deleted?: string) {
    return deleted === '1' || deleted === 'true'
      ? this.drivers.listDeleted()
      : this.drivers.listForAdmin();
  }

  /** Bring back a driver removed with DELETE /drivers/:id. */
  @Post('drivers/:id/restore')
  restoreDriver(@Param('id') id: string) {
    return this.drivers.restore(id);
  }

  @Get('drivers/:id')
  driverDetail(@Param('id') id: string) {
    return this.drivers.detail(id);
  }

  @Post('drivers')
  createDriver(@Body() dto: CreateDriverDto) {
    return this.drivers.createDriver(dto);
  }

  /**
   * Reset a driver's password. Passwords are stored hashed, so the admin
   * cannot read the current one — this issues a new one (given or random),
   * returns it once and sends it to the driver's Telegram when known.
   */
  @Post('drivers/:id/password')
  async setDriverPassword(
    @Param('id') id: string,
    @Body() body: { password?: string },
  ) {
    const res = await this.drivers.adminSetPassword(id, body?.password);
    let notified = false;
    const app = await this.applications.latestForDriver(id).catch(() => null);
    if (app?.telegramId) {
      this.applicationEvents.emitToApplicant({
        telegramId: app.telegramId,
        applicationId: app.id,
        html:
          '🔑 <b>Parolingiz yangilandi</b>\n' +
          `📱 Login: <code>${esc(res.phone)}</code>\n` +
          `🔑 Yangi parol: <code>${esc(res.password)}</code>\n\n` +
          'Haydovchi ilovasiga shu ma’lumotlar bilan kiring.',
        allowReply: false,
      });
      notified = true;
    }
    return { ...res, notified };
  }

  /** Latest published driver APK version (from /opt/moviytaxi/apk/version.json). */
  private latestDriverVersion(): string | null {
    try {
      const dir = process.env.APK_DIR || '/opt/moviytaxi/apk';
      const j = JSON.parse(require('fs').readFileSync(require('path').join(dir, 'version.json'), 'utf8'));
      return String(j.version ?? '') || null;
    } catch {
      return null;
    }
  }

  /** Version overview: latest APK + each driver's app version and last start. */
  @Get('drivers-versions')
  async driversVersions() {
    const rows = (await this.admins.manager.query(
      `SELECT id, full_name AS "fullName", phone, kind, is_online AS "isOnline",
              app_version AS "appVersion", app_platform AS "appPlatform", app_seen_at AS "appSeenAt"
         FROM drivers WHERE deleted_at IS NULL ORDER BY app_seen_at DESC NULLS LAST`,
    )) as any[];
    return { latest: this.latestDriverVersion(), drivers: rows };
  }

  /**
   * Ask drivers to update the app: an in-app + background-service
   * notification and (when known) a Telegram message with the download link.
   * `driverIds` empty → every driver whose app is older than the latest.
   */
  @Post('drivers/request-update')
  async requestDriverUpdate(@Body() body: { driverIds?: string[]; note?: string }) {
    const latest = this.latestDriverVersion();
    const base = (process.env.DRIVER_APP_URL || 'https://moviytaxi.uz').replace(/\/$/, '');
    const older = (v: string | null) => {
      if (!latest) return true;
      if (!v || !/^\d+(\.\d+)*$/.test(v)) return true; // web / unknown / very old
      const a = v.split('.').map(Number);
      const b = latest.split('.').map(Number);
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
      }
      return false;
    };
    const all = (await this.admins.manager.query(
      `SELECT id, app_version AS v FROM drivers WHERE deleted_at IS NULL AND is_active`,
    )) as { id: string; v: string | null }[];
    const targets = body?.driverIds?.length
      ? all.filter((d) => body.driverIds!.includes(d.id))
      : all.filter((d) => older(d.v));
    const title = '📲 Ilovani yangilang';
    const text =
      (body?.note?.trim() ? body.note.trim() + ' ' : '') +
      `Yangi versiya${latest ? ` ${latest}` : ''} chiqdi — buyurtmalar va signal to‘g‘ri ishlashi uchun yangilang: ${base}/app`;
    for (const d of targets) {
      this.realtime.emitToDriver(d.id, 'announcement', { title, text, url: `${base}/app`, kind: 'update' });
      const app = await this.applications.latestForDriver(d.id).catch(() => null);
      if (app?.telegramId) {
        this.applicationEvents.emitToApplicant({
          telegramId: app.telegramId,
          applicationId: app.id,
          html: `<b>${esc(title)}</b>
${esc(text)}`,
          allowReply: false,
          attachApp: 'driver',
        });
      }
    }
    return { sent: targets.length, latest };
  }

  /** Taxi ↔ courier; whether a taxi driver also receives food deliveries. */
  @Patch('drivers/:id/kind')
  setDriverKind(@Param('id') id: string, @Body() body: { kind?: string; acceptDelivery?: boolean }) {
    return this.drivers.setKind(id, body ?? {});
  }

  /** License number / expiry and photo URLs (admin-managed documents). */
  @Patch('drivers/:id/documents')
  updateDriverDocuments(
    @Param('id') id: string,
    @Body()
    body: {
      licenseNumber?: string | null;
      licenseExpiresAt?: string | null;
      licensePhotoUrl?: string | null;
      techPassportPhotoUrl?: string | null;
      carPhotoUrl?: string | null;
      avatarUrl?: string | null;
    },
  ) {
    return this.drivers.updateDocuments(id, body ?? {});
  }

  /** Upload a document photo for a driver: kind = license | techPassport | car | avatar. */
  @Post('drivers/:id/documents/:kind')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          return cb(new BadRequestException('Faqat JPG, PNG, WEBP'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadDriverDocument(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Fayl yuborilmadi');
    const url = `/uploads/${file.filename}`;
    const field = (
      {
        license: 'licensePhotoUrl',
        techPassport: 'techPassportPhotoUrl',
        car: 'carPhotoUrl',
        avatar: 'avatarUrl',
      } as const
    )[kind as 'license' | 'techPassport' | 'car' | 'avatar'];
    if (!field) throw new BadRequestException('Noma’lum hujjat turi');
    await this.drivers.updateDocuments(id, { [field]: url });
    return { url, field };
  }

  @Delete('drivers/:id')
  removeDriver(@Param('id') id: string) {
    return this.drivers.softDelete(id);
  }

  @Post('drivers/:id/approve')
  approveDriver(@Param('id') id: string) {
    return this.drivers.approve(id);
  }

  @Post('drivers/:id/reject')
  rejectDriver(@Param('id') id: string) {
    return this.drivers.reject(id);
  }

  @Post('drivers/:id/block')
  blockDriver(@Param('id') id: string) {
    return this.drivers.setActive(id, false);
  }

  @Post('drivers/:id/unblock')
  unblockDriver(@Param('id') id: string) {
    return this.drivers.setActive(id, true);
  }

  @Post('drivers/:id/branded')
  setDriverBranded(
    @Param('id') id: string,
    @Body() body: { branded: boolean },
  ) {
    return this.drivers.setBranded(id, !!body?.branded);
  }

  @Post('drivers/:id/balance')
  adjustBalance(@Param('id') id: string, @Body() dto: AdjustBalanceDto) {
    return this.drivers.adjustBalance(id, dto.amount, dto.note);
  }

  // --- admin-driven order overrides ---------------------------------------
  // The driver app intentionally keeps few escape hatches. Admins need to
  // resolve stuck orders (broken phones, no-shows, etc) — these endpoints
  // unwind any state, including IN_PROGRESS.

  @Post('orders/:id/cancel')
  forceCancelOrder(@Param('id') id: string) {
    return this.orders.cancel(id, 'admin');
  }

  /** Full timeline of one order: offers, rings, declines, broadcast, states. */
  @Get('orders/:id/events')
  orderEvents(@Param('id') id: string) {
    return this.orders.eventsFor(id);
  }

  /** Latest order events across all orders (admin live feed backfill). */
  @Get('order-events')
  recentOrderEvents(@Query('limit') limit?: string) {
    return this.orders.recentEvents(Number(limit) || 50);
  }

  @Post('orders/:id/complete')
  forceCompleteOrder(
    @Param('id') id: string,
    @Body() body: { distanceKm?: number },
  ) {
    return this.orders.forceCompleteByAdmin(id, body?.distanceKm);
  }

  // --- site settings (insta, admin contact, payment-bot link) -------------
  @Get('settings')
  getSettings() {
    return this.settings.getAll();
  }

  @Patch('settings')
  updateSettings(@Body() body: Partial<Record<SettingKey, string>>) {
    const clean: Partial<Record<SettingKey, string>> = {};
    for (const k of SETTING_KEYS) {
      if (k in body) clean[k] = String(body[k] ?? '');
    }
    return this.settings.setMany(clean);
  }

  @Get('clients')
  listClients() {
    return this.clients.listForAdmin();
  }

  @Post('clients/:id/block')
  blockClient(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.clients.setBlocked(id, true, body?.reason);
  }

  @Post('clients/:id/unblock')
  unblockClient(@Param('id') id: string) {
    return this.clients.setBlocked(id, false);
  }

  @Get('clients/:id/orders')
  clientOrders(@Param('id') id: string) {
    return this.clients.ordersFor(id);
  }

  @Get('clients/:id')
  clientDetail(@Param('id') id: string) {
    return this.clients.detailForAdmin(id);
  }

  @Get('tariff')
  getTariff() {
    return this.tariff.getCurrent();
  }

  @Patch('tariff')
  updateTariff(@Body() dto: UpdateTariffDto) {
    return this.tariff.update(dto);
  }

  // --- payment requests (coordinator → admin queue) -----------------------

  @Get('payment-requests')
  listPaymentRequests(@Query('status') status?: string) {
    const filter = (
      status && Object.values(PaymentRequestStatus).includes(status as any)
        ? status
        : undefined
    ) as PaymentRequestStatus | undefined;
    return this.payment.listAll(filter);
  }

  @Post('payment-requests/:id/approve')
  approvePaymentRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payment.approve(id, user.sub);
  }

  @Post('payment-requests/:id/reject')
  rejectPaymentRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payment.reject(id, user.sub);
  }

  // --- coordinator accounts -----------------------------------------------

  @Get('coordinators')
  async listCoordinators() {
    const rows = await this.admins.find({
      where: { role: 'coordinator' as any },
      order: { createdAt: 'DESC' },
    });
    return rows.map((a) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      balance: a.balance,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Move funds between treasury and a coordinator's purse.
   * Positive amount = give the coordinator money to spend.
   * Negative amount = pull funds back into treasury.
   */
  @Post('coordinators/:id/allocate')
  async allocateToCoordinator(
    @Param('id') id: string,
    @Body() body: { amount: number; note?: string },
  ) {
    return this.balance.allocateToCoordinator({
      coordId: id,
      amount: Number(body.amount),
      note: body.note ?? null,
    });
  }

  /**
   * Create many coordinators at once: prefix + number (kassir1, kassir2, …)
   * with random 8-character passwords. Returns the credentials once.
   */
  @Post('coordinators/bulk')
  async createCoordinatorsBulk(
    @Body() body: { prefix?: string; count?: number; start?: number },
  ) {
    const prefix = (body.prefix ?? '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_.-]{1,20}$/.test(prefix)) {
      throw new BadRequestException(
        'Prefiks 2–21 belgi: lotin harfi bilan boshlansin (harf, raqam, _ . -)',
      );
    }
    const count = Math.floor(Number(body.count ?? 0));
    if (!Number.isFinite(count) || count < 1 || count > 300) {
      throw new BadRequestException('Soni 1 dan 300 gacha bo‘lsin');
    }
    let n = Math.max(1, Math.floor(Number(body.start ?? 1)) || 1);
    const taken = new Set(
      (
        await this.admins
          .createQueryBuilder('a')
          .select('LOWER(a.username)', 'u')
          .where('LOWER(a.username) LIKE :p', { p: `${prefix}%` })
          .getRawMany<{ u: string }>()
      ).map((r) => r.u),
    );
    const created: { id: string; username: string; password: string }[] = [];
    while (created.length < count) {
      const username = `${prefix}${n++}`;
      if (taken.has(username)) continue;
      const password = genPassword();
      const saved = await this.admins.save(
        this.admins.create({
          username,
          passwordHash: await bcrypt.hash(password, 10),
          role: 'coordinator' as any,
          balance: '0',
        }),
      );
      created.push({ id: saved.id, username, password });
    }
    return { created };
  }

  /** New password for a coordinator (lost password / handing over the seat). */
  @Post('coordinators/:id/password')
  async resetCoordinatorPassword(
    @Param('id') id: string,
    @Body() body: { password?: string },
  ) {
    const row = await this.admins.findOne({ where: { id } });
    if (!row || row.role !== 'coordinator') {
      throw new NotFoundException('Koordinator topilmadi');
    }
    const password = (body?.password ?? '').trim() || genPassword();
    if (password.length < 6) {
      throw new BadRequestException('Parol kamida 6 belgi bo‘lsin');
    }
    row.passwordHash = await bcrypt.hash(password, 10);
    await this.admins.save(row);
    return { id: row.id, username: row.username, password };
  }

  @Post('coordinators')
  async createCoordinator(
    @Body() body: { username: string; password: string },
  ) {
    const username = (body.username ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
      throw new BadRequestException(
        'Username 3–32 belgi: lotin harfi yoki raqam (harf, raqam, _ . -), bo‘sh joysiz',
      );
    }
    if (!body.password || body.password.length < 6) {
      throw new BadRequestException('parol kamida 6 belgi bo‘lsin');
    }
    const existing = await this.admins
      .createQueryBuilder('a')
      .where('LOWER(TRIM(a.username)) = :username', { username })
      .getOne();
    if (existing) {
      throw new BadRequestException('username band');
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const saved = await this.admins.save(
      this.admins.create({
        username,
        passwordHash,
        role: 'coordinator' as any,
        balance: '0',
      }),
    );
    return {
      id: saved.id,
      username: saved.username,
      role: saved.role,
    };
  }

  @Delete('coordinators/:id')
  async removeCoordinator(@Param('id') id: string) {
    const row = await this.admins.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Topilmadi');
    }
    if (row.role !== 'coordinator') {
      throw new BadRequestException('Faqat koordinatorlarni o‘chirish mumkin');
    }
    // Closed-loop money: whatever is left in the purse goes back to the
    // treasury instead of vanishing with the account.
    const left = Number(row.balance);
    if (left > 0) {
      await this.balance.allocateToCoordinator({
        coordId: row.id,
        amount: -left,
        note: 'Koordinator o‘chirildi — hamyon qoldig‘i qaytarildi',
      });
    }
    await this.admins.remove(row);
    return { ok: true };
  }

  // --- feedback inbox (Telegram complaints/suggestions bot) ----------------

  @Get('feedback')
  listFeedback(@Query('unreadOnly') unreadOnly?: string) {
    return this.feedback.list({ unreadOnly: unreadOnly === 'true' });
  }

  @Get('feedback/unread-count')
  async feedbackUnread() {
    return { count: await this.feedback.unreadCount() };
  }

  @Post('feedback/:id/read')
  markFeedbackRead(@Param('id') id: string) {
    return this.feedback.markRead(id);
  }

  @Post('feedback/read-all')
  markAllFeedbackRead() {
    return this.feedback.markAllRead();
  }

  /** Answer an inbox message: the bot relays it to the user's Telegram chat. */
  @Post('feedback/:id/reply')
  async replyFeedback(@Param('id') id: string, @Body() body: { text?: string }) {
    const text = (body?.text ?? '').trim();
    if (!text) throw new BadRequestException('Javob matni bo‘sh');
    const row = await this.feedback.findOne(id);
    try {
      await this.feedbackEvents.deliverReply({ telegramUserId: row.telegramUserId, text });
    } catch (e) {
      throw new BadGatewayException(
        `Telegram’ga yuborib bo‘lmadi: ${(e as Error).message}`,
      );
    }
    return this.feedback.reply(id, text);
  }
}
