import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import {
  ApplicationMessageSender,
  DriverApplication,
  DriverApplicationMessage,
  DriverApplicationStatus,
} from './driver-application.entity';
import { DriverApplicationEvents } from './driver-application.events';
import { Driver } from '../driver/driver.entity';
import { DriverService } from '../driver/driver.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface SubmitApplicationInput {
  clientId: string | null;
  telegramId: number;
  telegramUsername: string | null;
  fullName: string;
  phone: string;
  carModel: string;
  carColor: string;
  carPlate: string;
  carYear: string | null;
  selfEmployed: boolean | null;
  contractAccepted?: boolean;
  licensePhotoUrl: string | null;
  techPassportPhotoUrl: string | null;
  carPhotoUrl: string | null;
  selfiePhotoUrl: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const OPEN_STATUSES = [
  DriverApplicationStatus.NEW,
  DriverApplicationStatus.IN_REVIEW,
];

@Injectable()
export class DriverApplicationService {
  constructor(
    @InjectRepository(DriverApplication)
    private readonly apps: Repository<DriverApplication>,
    @InjectRepository(DriverApplicationMessage)
    private readonly messages: Repository<DriverApplicationMessage>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    private readonly driverService: DriverService,
    private readonly events: DriverApplicationEvents,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  // --- bot side ------------------------------------------------------------

  /** The approved application that created this driver account, if any. */
  latestForDriver(driverId: string) {
    return this.apps.findOne({
      where: { driverId },
      order: { createdAt: 'DESC' },
    });
  }

  latestForTelegram(telegramId: number) {
    return this.apps.findOne({
      where: { telegramId: String(telegramId) },
      order: { createdAt: 'DESC' },
    });
  }

  openForTelegram(telegramId: number) {
    return this.apps.findOne({
      where: { telegramId: String(telegramId), status: In(OPEN_STATUSES) },
      order: { createdAt: 'DESC' },
    });
  }

  async submit(input: SubmitApplicationInput): Promise<DriverApplication> {
    if (await this.openForTelegram(input.telegramId)) {
      throw new BadRequestException('Sizda ko‘rib chiqilayotgan ariza bor');
    }
    const app = await this.apps.save(
      this.apps.create({
        ...input,
        telegramId: String(input.telegramId),
        status: DriverApplicationStatus.NEW,
        unreadCount: 1,
        lastMessageAt: new Date(),
      }),
    );
    await this.messages.save(
      this.messages.create({
        applicationId: app.id,
        sender: 'system',
        text: 'Yangi ariza yuborildi',
      }),
    );
    this.realtime.emitToAdmin('driver_application', { id: app.id });
    return app;
  }

  /** A message the applicant typed (or a photo they sent) in the bot. */
  async addApplicantMessage(
    applicationId: string,
    text: string | null,
    photoUrl: string | null = null,
  ) {
    const msg = await this.addMessage(applicationId, 'applicant', text, photoUrl);
    await this.apps.increment({ id: applicationId }, 'unreadCount', 1);
    this.realtime.emitToAdmin('driver_application', { id: applicationId });
    return msg;
  }

  // --- admin side ----------------------------------------------------------

  list(status?: DriverApplicationStatus) {
    return this.apps.find({
      where: status ? { status } : {},
      order: { lastMessageAt: 'DESC' },
      take: 300,
    });
  }

  async unreadTotal() {
    const row = await this.apps
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.unread_count), 0)', 'sum')
      .getRawOne<{ sum: string }>();
    return Number(row?.sum ?? 0);
  }

  async detail(id: string) {
    const app = await this.getOrFail(id);
    const messages = await this.messages.find({
      where: { applicationId: id },
      order: { createdAt: 'ASC' },
      take: 1000,
    });
    // The driver created on approval may have been deleted since — the
    // panel then offers to restore it instead of linking to a dead profile.
    let driverDeleted = false;
    if (app.driverId) {
      const d = await this.drivers.findOne({
        where: { id: app.driverId },
        withDeleted: true,
        select: { id: true, deletedAt: true },
      });
      driverDeleted = !d || !!d.deletedAt;
    }
    return { application: app, messages, driverDeleted };
  }

  /** Admin opened the thread: clear unread and move NEW → IN_REVIEW. */
  async markRead(id: string) {
    const app = await this.getOrFail(id);
    app.unreadCount = 0;
    if (app.status === DriverApplicationStatus.NEW) {
      app.status = DriverApplicationStatus.IN_REVIEW;
    }
    return this.apps.save(app);
  }

  async reply(id: string, text: string) {
    const clean = (text ?? '').trim();
    if (!clean) throw new BadRequestException('Xabar bo‘sh');
    const app = await this.getOrFail(id);
    const msg = await this.addMessage(id, 'admin', clean, null);
    this.events.emitToApplicant({
      telegramId: app.telegramId,
      applicationId: app.id,
      html: `👨‍💼 <b>Admin:</b>\n${escapeHtml(clean)}`,
      allowReply: true,
    });
    return msg;
  }

  /**
   * Approve: create the driver account (already approved), copy the car
   * details and photos over, and send the login credentials to the applicant.
   */
  async approve(id: string, kind: 'taxi' | 'courier' | 'both' = 'both') {
    const app = await this.getOrFail(id);
    if (app.status === DriverApplicationStatus.APPROVED) {
      throw new BadRequestException('Ariza allaqachon qabul qilingan');
    }
    const password = String(randomInt(100000, 1000000));
    const { driver } = await this.driverService.createDriver({
      fullName: app.fullName,
      phone: app.phone,
      password,
    });
    await this.drivers.update(
      { id: driver.id },
      {
        carModel: app.carModel,
        carColor: app.carColor,
        carPlate: app.carPlate,
        carPhotoUrl: app.carPhotoUrl,
        avatarUrl: app.selfiePhotoUrl,
        licensePhotoUrl: app.licensePhotoUrl,
        techPassportPhotoUrl: app.techPassportPhotoUrl,
        // Admin decides: taxi only, courier only, or taxi that also delivers.
        kind: kind === 'courier' ? 'courier' : 'taxi',
        acceptDelivery: kind !== 'taxi',
      },
    );
    app.status = DriverApplicationStatus.APPROVED;
    app.driverId = driver.id;
    app.unreadCount = 0;
    await this.apps.save(app);
    await this.addMessage(
      id,
      'system',
      `Ariza qabul qilindi. Haydovchi hisobi yaratildi (login: ${driver.phone}).`,
      null,
    );

    const appUrl =
      this.config.get<string>('DRIVER_APP_URL') ?? 'http://localhost:3002';
    this.events.emitToApplicant({
      telegramId: app.telegramId,
      applicationId: app.id,
      html:
        '🎉 <b>Tabriklaymiz! Arizangiz qabul qilindi.</b>\n\n' +
        'Haydovchi ilovasiga kirish uchun:\n' +
        `📲 Android ilova: ${escapeHtml(appUrl)}/app\n` +
        `🌐 Sayt: ${escapeHtml(appUrl)}\n` +
        `📱 Login: <code>${escapeHtml(driver.phone)}</code>\n` +
        `🔑 Parol: <code>${password}</code>\n\n` +
        'Kirgandan keyin parolni o‘zgartirishingizni tavsiya qilamiz.',
      allowReply: false,
      attachApp: 'driver',
    });
    return { application: app, driverId: driver.id };
  }

  async reject(id: string, reason?: string) {
    const app = await this.getOrFail(id);
    if (app.status === DriverApplicationStatus.APPROVED) {
      throw new BadRequestException('Qabul qilingan arizani rad etib bo‘lmaydi');
    }
    const why = (reason ?? '').trim();
    app.status = DriverApplicationStatus.REJECTED;
    app.unreadCount = 0;
    await this.apps.save(app);
    await this.addMessage(
      id,
      'system',
      why ? `Ariza rad etildi: ${why}` : 'Ariza rad etildi',
      null,
    );
    this.events.emitToApplicant({
      telegramId: app.telegramId,
      applicationId: app.id,
      html:
        '❌ <b>Afsuski, arizangiz rad etildi.</b>' +
        (why ? `\n\nSabab: ${escapeHtml(why)}` : '') +
        '\n\nKamchiliklarni to‘g‘irlab, qaytadan ariza topshirishingiz mumkin.',
      allowReply: false,
    });
    return app;
  }

  private async addMessage(
    applicationId: string,
    sender: ApplicationMessageSender,
    text: string | null,
    photoUrl: string | null,
  ) {
    const msg = await this.messages.save(
      this.messages.create({ applicationId, sender, text, photoUrl }),
    );
    await this.apps.update(
      { id: applicationId },
      { lastMessageAt: msg.createdAt },
    );
    return msg;
  }

  private async getOrFail(id: string) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) throw new NotFoundException('Ariza topilmadi');
    return app;
  }
}
