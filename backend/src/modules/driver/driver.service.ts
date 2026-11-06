import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Driver } from './driver.entity';
import { OrderService } from '../order/order.service';
import { OrderStatus } from '../order/order.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CompleteOrderDto } from '../order/dto/complete-order.dto';
import { BalanceService } from '../balance/balance.service';
import { BalanceTxType } from '../balance/balance-transaction.entity';
import { MailerService } from '../mailer/mailer.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TariffService } from '../tariff/tariff.service';
import { FARE_ROUND_TO } from '../../common/utils/fare';

@Injectable()
export class DriverService {
  constructor(
    @InjectRepository(Driver) private readonly repo: Repository<Driver>,
    private readonly orderService: OrderService,
    private readonly realtime: RealtimeService,
    private readonly balance: BalanceService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly tariffs: TariffService,
  ) {}

  async getTariff() {
    const t = await this.tariffs.getCurrent();
    return {
      pricePerKm: Number(t.pricePerKm),
      minimumFare: Number(t.minimumFare),
      commissionPerOrder: Number(t.commissionPerOrder),
      commissionPercent: Number(t.commissionPercent ?? 0),
      tiers: t.tiers ?? [],
      waitingFreeMinutes: Number(t.waitingFreeMinutes ?? 0),
      waitingPricePerMinute: Number(t.waitingPricePerMinute ?? 0),
      roundTo: FARE_ROUND_TO,
      zonePolygon: t.zonePolygon ?? [],
      outsidePricePerKm: Number(t.outsidePricePerKm ?? 0),
    };
  }

  async me(driverId: string): Promise<Driver> {
    const d = await this.repo.findOne({ where: { id: driverId } });
    if (!d) throw new NotFoundException('Driver not found');
    return d;
  }

  async toggleOnline(driverId: string): Promise<{ isOnline: boolean }> {
    const driver = await this.repo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');

    if (!driver.isActive) {
      throw new BadRequestException('Hisobingiz faol emas');
    }
    if (!driver.isOnline && !driver.isApproved) {
      throw new BadRequestException(
        'Hisobingiz hali admin tomonidan tasdiqlanmagan.',
      );
    }

    // Profile must be complete before going online
    if (!driver.isOnline && !this.isProfileComplete(driver)) {
      throw new BadRequestException(
        'Profil to‘liq emas. Avatar, mashina modeli, rangi va davlat raqamini kiriting.',
      );
    }

    const requirePositive =
      String(this.config.get('REQUIRE_POSITIVE_BALANCE_TO_ONLINE')) === 'true';
    if (!driver.isOnline && requirePositive && Number(driver.balance) <= 0) {
      throw new BadRequestException(
        'Balance must be positive to go online. Please top up.',
      );
    }
    driver.isOnline = !driver.isOnline;
    await this.repo.save(driver);
    this.realtime.emitToAdmin(
      driver.isOnline ? 'driver_online' : 'driver_offline',
      { id: driver.id, fullName: driver.fullName },
    );
    return { isOnline: driver.isOnline };
  }

  async updateLocation(driverId: string, lat: number, lng: number) {
    await this.orderService.handleLocationPing(driverId, lat, lng);
    return { ok: true };
  }

  acceptOrder(driverId: string, orderId: string) {
    return this.orderService.accept(driverId, orderId);
  }

  activeOrder(driverId: string) {
    return this.orderService.activeForDriver(driverId);
  }

  declineOrder(driverId: string, orderId: string) {
    return this.orderService.declineOffer(driverId, orderId);
  }

  startStreetRide(driverId: string, lat: number, lng: number) {
    return this.orderService.startStreetRide(driverId, lat, lng);
  }

  /** The app reports its version on start (admin sees outdated phones). */
  async reportVersion(driverId: string, version?: string, platform?: string) {
    const v = String(version ?? '').trim().slice(0, 32) || 'unknown';
    const p = String(platform ?? '').trim().slice(0, 16) || null;
    await this.repo.update(driverId, { appVersion: v, appPlatform: p, appSeenAt: new Date() });
    return { ok: true };
  }

  ringOrder(driverId: string, orderId: string, via: string) {
    return this.orderService.markRinging(driverId, orderId, via);
  }

  currentOffer(driverId: string) {
    return this.orderService.currentOffer(driverId);
  }

  /** Background service long-poll: new orders etc. while the app is closed. */
  async inbox(driverId: string, after: number | null) {
    const d = await this.repo.findOne({ where: { id: driverId }, select: { id: true, isOnline: true, isActive: true } });
    if (!d || !d.isActive || !d.isOnline) {
      // Went offline (maybe from another device) — the phone stops its service.
      return { offline: true, last: 0, events: [] };
    }
    const res = await this.realtime.waitInbox(driverId, after, 25_000);
    return { offline: false, ...res };
  }

  onTheWay(driverId: string, orderId: string) {
    return this.orderService.transition(driverId, orderId, OrderStatus.ON_THE_WAY);
  }

  arrived(driverId: string, orderId: string) {
    return this.orderService.transition(driverId, orderId, OrderStatus.ARRIVED);
  }

  start(driverId: string, orderId: string) {
    return this.orderService.transition(driverId, orderId, OrderStatus.IN_PROGRESS);
  }

  setWaiting(driverId: string, orderId: string, on: boolean) {
    return this.orderService.setWaiting(driverId, orderId, on);
  }

  complete(driverId: string, orderId: string, dto: CompleteOrderDto) {
    return this.orderService.complete(driverId, orderId, dto.distanceKm, { outsideKm: dto.outsideKm });
  }

  cancel(driverId: string, orderId: string) {
    return this.orderService.cancelByDriver(driverId, orderId);
  }

  history(driverId: string) {
    return this.orderService.history(driverId);
  }

  available(driverId: string) {
    return this.orderService.available(driverId);
  }

  orderDetail(driverId: string, orderId: string) {
    return this.orderService.findOneForDriver(driverId, orderId);
  }

  async balanceFor(driverId: string) {
    const driver = await this.me(driverId);
    const txs = await this.balance.list(driverId);
    return { balance: driver.balance, transactions: txs };
  }

  // Admin operations
  async createDriver(dto: CreateDriverDto): Promise<{
    driver: Driver;
    password: string;
  }> {
    const phone = dto.phone.startsWith('+') ? dto.phone : '+' + dto.phone;
    const email = dto.email?.trim().toLowerCase() || null;

    // Soft-deleted rows keep their (unique) phone, so a removed driver
    // coming back would hit the DB constraint — revive that row instead.
    const phoneExists = await this.repo.findOne({
      where: { phone },
      withDeleted: true,
    });
    if (phoneExists && !phoneExists.deletedAt) {
      throw new BadRequestException('Telefon allaqachon ro‘yxatda');
    }
    if (email) {
      const emailExists = await this.repo.findOne({
        where: { email },
        withDeleted: true,
      });
      if (emailExists && emailExists.id !== phoneExists?.id) {
        throw new BadRequestException('Email allaqachon ro‘yxatda');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    let saved: Driver;
    if (phoneExists) {
      // Revived account: fresh credentials/profile, balance stays as is
      // (it was drained to the treasury on deletion).
      await this.repo.restore(phoneExists.id);
      await this.repo.update(phoneExists.id, {
        fullName: dto.fullName,
        email,
        passwordHash,
        isActive: true,
        isApproved: true,
        approvedAt: new Date(),
        isOnline: false,
      });
      saved = await this.repo.findOneOrFail({ where: { id: phoneExists.id } });
    } else {
      const driver = this.repo.create({
        fullName: dto.fullName,
        phone,
        email,
        passwordHash,
        // Admin-created drivers are trusted by definition — they skip the
        // approval queue. Telegram self-registrations stay pending.
        isApproved: true,
        approvedAt: new Date(),
        kind: dto.kind === 'courier' ? 'courier' : 'taxi',
      });
      saved = await this.repo.save(driver);
    }

    if (email) {
      const appUrl =
        this.config.get<string>('DRIVER_APP_URL') ?? 'http://localhost:3002';
      // Fire-and-forget — an SMTP outage must NOT block driver creation
      // (otherwise admin retries, hits the unique-phone error, gives up).
      // The driver still gets the password back in the API response, so
      // admin can deliver it manually.
      void this.mailer
        .send({
          to: email,
          subject: 'Moviy Taxi — Haydovchi hisobi yaratildi',
          text:
            `Salom, ${saved.fullName}!\n\n` +
            `Sizning haydovchi hisobingiz yaratildi.\n\n` +
            `Telefon: ${phone}\n` +
            `Parol: ${dto.password}\n\n` +
            `Ilovaga kirish: ${appUrl}/login\n\n` +
            `Xavfsizlik uchun birinchi kirishdan keyin parolingizni o‘zgartirishni tavsiya etamiz.`,
        })
        .catch(() => {
          // MailerService already logs the failure; swallow here so the
          // caller's request completes successfully.
        });
    }
    return { driver: saved, password: dto.password };
  }

  async listForAdmin() {
    // Includes ordersCount (completed orders only) so the admin dashboard
    // can render the "top drivers" chart without a separate round-trip.
    const rows = await this.repo
      .createQueryBuilder('d')
      .leftJoin(
        'orders',
        'o',
        "o.driver_id = d.id AND o.status = 'COMPLETED'",
      )
      .addSelect('COUNT(o.id)', 'orders_count')
      .groupBy('d.id')
      .orderBy('d.created_at', 'DESC')
      .getRawAndEntities();

    return rows.entities.map((d, i) => ({
      ...d,
      ordersCount: Number(rows.raw[i]?.orders_count ?? 0),
    }));
  }

  /** Soft-deleted drivers, newest deletion first. */
  listDeleted() {
    return this.repo
      .createQueryBuilder('d')
      .withDeleted()
      .where('d.deleted_at IS NOT NULL')
      .orderBy('d.deleted_at', 'DESC')
      .getMany();
  }

  /** Undo softDelete: the account comes back blocked-off → active, offline. */
  async restore(id: string): Promise<Driver> {
    const driver = await this.repo.findOne({ where: { id }, withDeleted: true });
    if (!driver) throw new NotFoundException('Driver not found');
    if (!driver.deletedAt) return driver;
    await this.repo.restore(id);
    await this.repo.update(id, { isActive: true, isOnline: false });
    return this.repo.findOneOrFail({ where: { id } });
  }

  async softDelete(id: string) {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    // Closed-loop: whatever the driver was holding goes back to the treasury
    // before we deactivate them.
    await this.balance.drainDriverToTreasury(id, 'Driver removed by admin');
    // update(), not save(driver): the entity loaded above still carries the
    // pre-drain balance and would write it back over the zeroed one.
    await this.repo.update(id, { isActive: false, isOnline: false });
    await this.repo.softDelete(id);
    return { ok: true };
  }

  async approve(id: string): Promise<Driver> {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.isApproved) return driver;
    driver.isApproved = true;
    driver.approvedAt = new Date();
    return this.repo.save(driver);
  }

  async reject(id: string): Promise<Driver> {
    // "Rejecting" is non-destructive: it just clears the approval and forces
    // the driver offline. Use softDelete() for permanent removal.
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    driver.isApproved = false;
    driver.isOnline = false;
    return this.repo.save(driver);
  }

  /**
   * Reversible account block. Blocked drivers can't log in (AuthService
   * checks isActive) and are forced offline immediately. Use softDelete()
   * for permanent removal.
   */
  async setActive(id: string, active: boolean): Promise<Driver> {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.isActive === active) return driver;
    driver.isActive = active;
    if (!active) driver.isOnline = false;
    return this.repo.save(driver);
  }

  async setBranded(id: string, branded: boolean): Promise<Driver> {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    driver.isBranded = branded;
    return this.repo.save(driver);
  }

  /** Driver ticked "I agree" to the contract in the app. */
  async acceptContract(driverId: string) {
    const now = new Date();
    await this.repo.update({ id: driverId }, { contractAcceptedAt: now });
    return { contractAcceptedAt: now.toISOString() };
  }

  async adjustBalance(id: string, amount: number, note?: string) {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    const type =
      amount > 0
        ? BalanceTxType.TOPUP
        : amount < 0
          ? BalanceTxType.WITHDRAW
          : BalanceTxType.ADJUSTMENT;
    return this.balance.adjust({
      driverId: id,
      amount,
      type,
      note: note ?? 'Admin adjustment',
    });
  }

  /**
   * Admin resets a driver's password (we never keep passwords in clear text,
   * so this is the only way the admin can hand a driver known credentials).
   * Returns the new password once; the caller shows/sends it.
   */
  async adminSetPassword(id: string, password?: string | null) {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    const clean = (password ?? '').trim();
    if (clean && clean.length < 6) {
      throw new BadRequestException('Parol kamida 6 belgi bo‘lsin');
    }
    const next = clean || String(Math.floor(100000 + Math.random() * 900000));
    driver.passwordHash = await bcrypt.hash(next, 10);
    driver.passwordChangedAt = new Date();
    await this.repo.save(driver);
    return { password: next, phone: driver.phone, changedAt: driver.passwordChangedAt };
  }

  /** Admin edits the driver's documents (license number/expiry, photos). */
  async updateDocuments(
    id: string,
    patch: {
      licenseNumber?: string | null;
      licenseExpiresAt?: string | null;
      licensePhotoUrl?: string | null;
      techPassportPhotoUrl?: string | null;
      carPhotoUrl?: string | null;
      avatarUrl?: string | null;
    },
  ) {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (patch.licenseNumber !== undefined) {
      driver.licenseNumber = (patch.licenseNumber ?? '').trim().slice(0, 64) || null;
    }
    if (patch.licenseExpiresAt !== undefined) {
      const v = (patch.licenseExpiresAt ?? '').trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        throw new BadRequestException('Sana YYYY-MM-DD ko‘rinishida bo‘lsin');
      }
      driver.licenseExpiresAt = v || null;
    }
    for (const k of ['licensePhotoUrl', 'techPassportPhotoUrl', 'carPhotoUrl', 'avatarUrl'] as const) {
      if (patch[k] !== undefined) driver[k] = patch[k] || null;
    }
    return this.repo.save(driver);
  }

  /** Admin: taxi ↔ courier, and whether a taxi driver also takes deliveries. */
  async setKind(id: string, input: { kind?: string; acceptDelivery?: boolean }) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Driver not found');
    if (input.kind !== undefined) {
      if (!['taxi', 'courier'].includes(input.kind)) throw new BadRequestException('Turi: taxi yoki courier');
      d.kind = input.kind as 'taxi' | 'courier';
    }
    if (input.acceptDelivery !== undefined) d.acceptDelivery = !!input.acceptDelivery;
    return this.repo.save(d);
  }

  async detail(id: string) {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    const transactions = await this.balance.list(id, 100);
    const [{ n }] = await this.repo.query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE driver_id = $1 AND status = 'COMPLETED'`,
      [id],
    );
    return { driver, transactions, ordersCompleted: Number(n ?? 0) };
  }

  isProfileComplete(driver: Driver): boolean {
    // Couriers (foot/bike/moto) only need a photo.
    if (driver.kind === 'courier') return !!driver.avatarUrl;
    return !!(
      driver.avatarUrl &&
      driver.carModel &&
      driver.carColor &&
      driver.carPlate
    );
  }

  async updateProfile(
    driverId: string,
    dto: UpdateProfileDto,
  ): Promise<Driver> {
    const driver = await this.repo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');

    if (dto.fullName !== undefined) driver.fullName = dto.fullName.trim();
    if (dto.carModel !== undefined) driver.carModel = dto.carModel.trim();
    if (dto.carColor !== undefined) driver.carColor = dto.carColor.trim();
    if (dto.carPlate !== undefined)
      driver.carPlate = dto.carPlate.trim().toUpperCase();
    if (dto.avatarUrl !== undefined) driver.avatarUrl = dto.avatarUrl;
    if (dto.carPhotoUrl !== undefined) driver.carPhotoUrl = dto.carPhotoUrl;

    return this.repo.save(driver);
  }
}
