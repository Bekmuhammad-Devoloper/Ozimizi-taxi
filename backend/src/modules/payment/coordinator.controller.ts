import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { PaymentService } from './payment.service';
import { Admin } from '../admin/admin.entity';
import { BalanceService } from '../balance/balance.service';
import { BalanceTxType } from '../balance/balance-transaction.entity';

/**
 * Coordinator-only API. Coordinators are a super-admin-lite role: they can
 *   - list drivers and clients (id + name + phone — no balances, no order history)
 *   - submit top-up / withdraw requests for either drivers or clients
 *   - see their own submitted requests and the admin verdict
 * They cannot see treasury balance, the 100M pool, aggregate stats, or
 * other coordinators' requests.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordinator')
@Controller('coordinator')
export class CoordinatorController {
  constructor(
    private readonly payment: PaymentService,
    private readonly balance: BalanceService,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    const a = await this.admins.findOne({ where: { id: user.sub } });
    return a
      ? {
          id: a.id,
          username: a.username,
          role: a.role,
          balance: a.balance,
        }
      : null;
  }

  /**
   * Direct transfer from the coordinator's own purse to a driver or
   * client. No admin approval — coord's purse is debited atomically,
   * target balance credited. Insufficient purse → 400.
   */
  @Post('transfer')
  async transfer(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      driverId?: string;
      clientId?: string;
      amount: number;
      note?: string;
    },
  ) {
    const amount = Number(body.amount);
    const type =
      amount > 0
        ? BalanceTxType.TOPUP
        : amount < 0
          ? BalanceTxType.WITHDRAW
          : BalanceTxType.ADJUSTMENT;
    const res = await this.balance.adjustFromCoordinator({
      coordId: user.sub,
      driverId: body.driverId,
      clientId: body.clientId,
      amount,
      type,
      note: body.note ?? null,
    });
    // Best-effort audit log so the coordinator can see their own
    // history. If this fails the money still moved — log and ignore.
    void this.payment
      .recordCoordTransfer({
        coordId: user.sub,
        driverId: body.driverId ?? null,
        clientId: body.clientId ?? null,
        amount,
        note: body.note ?? null,
      })
      .catch(() => {});
    return res;
  }

  @Get('drivers')
  drivers() {
    return this.payment.listDriversForCoordinator();
  }

  @Get('clients')
  clients() {
    return this.payment.listClientsForCoordinator();
  }

  @Post('requests')
  submit(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      driverId?: string;
      clientId?: string;
      amount: number;
      note?: string;
    },
  ) {
    if (!body.driverId && !body.clientId) {
      throw new BadRequestException('Haydovchi yoki klient tanlang');
    }
    if (body.driverId && body.clientId) {
      throw new BadRequestException(
        'Bir vaqtning o‘zida haydovchi va klient tanlanmasin',
      );
    }
    return this.payment.submit({
      coordinatorId: user.sub,
      target: body.driverId
        ? { driverId: body.driverId }
        : { clientId: body.clientId! },
      amount: Number(body.amount),
      note: body.note ?? null,
    });
  }

  @Get('requests')
  myRequests(@CurrentUser() user: JwtPayload) {
    return this.payment.listOwn(user.sub);
  }

  // Bot-initiated (driver or client self-submitted) requests that need
  // a verdict. Coordinator can act on these just like admin.
  @Get('pending')
  pending() {
    return this.payment.listPendingForCoordinator();
  }

  @Post('pending/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.payment.approve(id, user.sub);
  }

  @Post('pending/:id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.payment.reject(id, user.sub);
  }
}
