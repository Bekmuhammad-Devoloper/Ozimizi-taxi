import {
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
  UseGuards,
} from '@nestjs/common';
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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from './admin.entity';
import * as bcrypt from 'bcrypt';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';

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
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
  ) {}

  @Get('stats')
  async stats(@Query('period') period: 'day' | 'week' | 'month' = 'day') {
    const base = await this.orders.statsFor(period);
    const treasury = await this.balance.treasuryBalance();
    return { ...base, treasuryBalance: treasury };
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
  listDrivers() {
    return this.drivers.listForAdmin();
  }

  @Get('drivers/:id')
  driverDetail(@Param('id') id: string) {
    return this.drivers.detail(id);
  }

  @Post('drivers')
  createDriver(@Body() dto: CreateDriverDto) {
    return this.drivers.createDriver(dto);
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

  @Get('clients/:id/orders')
  clientOrders(@Param('id') id: string) {
    return this.clients.ordersFor(id);
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
      createdAt: a.createdAt,
    }));
  }

  @Post('coordinators')
  async createCoordinator(
    @Body() body: { username: string; password: string },
  ) {
    const username = (body.username ?? '').trim().toLowerCase();
    if (!username) {
      throw new BadRequestException('username kerak');
    }
    if (!body.password || body.password.length < 6) {
      throw new BadRequestException('parol kamida 6 belgi bo‘lsin');
    }
    const existing = await this.admins.findOne({ where: { username } });
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
    await this.admins.remove(row);
    return { ok: true };
  }
}
