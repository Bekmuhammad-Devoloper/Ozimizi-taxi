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
    await this.repo.update(driverId, { currentLat: lat, currentLng: lng });
  }

  acceptOrder(driverId: string, orderId: string) {
    return this.orderService.accept(driverId, orderId);
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

  complete(driverId: string, orderId: string, dto: CompleteOrderDto) {
    return this.orderService.complete(driverId, orderId, dto.distanceKm);
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

    const phoneExists = await this.repo.findOne({ where: { phone } });
    if (phoneExists) {
      throw new BadRequestException('Telefon allaqachon ro‘yxatda');
    }
    if (email) {
      const emailExists = await this.repo.findOne({ where: { email } });
      if (emailExists) {
        throw new BadRequestException('Email allaqachon ro‘yxatda');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const driver = this.repo.create({
      fullName: dto.fullName,
      phone,
      email,
      passwordHash,
      // Admin-created drivers are trusted by definition — they skip the
      // approval queue. Telegram self-registrations stay pending.
      isApproved: true,
    });
    const saved = await this.repo.save(driver);

    if (email) {
      const appUrl =
        this.config.get<string>('DRIVER_APP_URL') ?? 'http://localhost:3002';
      await this.mailer.send({
        to: email,
        subject: 'OZIMIZNI TAXI — Haydovchi hisobi yaratildi',
        text:
          `Salom, ${saved.fullName}!\n\n` +
          `Sizning haydovchi hisobingiz yaratildi.\n\n` +
          `Telefon: ${phone}\n` +
          `Parol: ${dto.password}\n\n` +
          `Ilovaga kirish: ${appUrl}/login\n\n` +
          `Xavfsizlik uchun birinchi kirishdan keyin parolingizni o‘zgartirishni tavsiya etamiz.`,
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

  async softDelete(id: string) {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    // Closed-loop: whatever the driver was holding goes back to the treasury
    // before we deactivate them.
    await this.balance.drainDriverToTreasury(id, 'Driver removed by admin');
    driver.isActive = false;
    driver.isOnline = false;
    await this.repo.save(driver);
    await this.repo.softDelete(id);
    return { ok: true };
  }

  async approve(id: string): Promise<Driver> {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.isApproved) return driver;
    driver.isApproved = true;
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

  async detail(id: string) {
    const driver = await this.repo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    const transactions = await this.balance.list(id, 100);
    return { driver, transactions };
  }

  isProfileComplete(driver: Driver): boolean {
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
