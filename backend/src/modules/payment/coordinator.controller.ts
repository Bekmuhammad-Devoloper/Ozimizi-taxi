import {
  Body,
  Controller,
  Get,
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

/**
 * Coordinator-only API. Coordinators are a super-admin-lite role: they can
 *   - list drivers (id + name + phone — no balances, no order history)
 *   - submit top-up / withdraw requests
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
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    const a = await this.admins.findOne({ where: { id: user.sub } });
    return a ? { id: a.id, username: a.username, role: a.role } : null;
  }

  @Get('drivers')
  drivers() {
    return this.payment.listDriversForCoordinator();
  }

  @Post('requests')
  submit(
    @CurrentUser() user: JwtPayload,
    @Body() body: { driverId: string; amount: number; note?: string },
  ) {
    return this.payment.submit({
      coordinatorId: user.sub,
      driverId: body.driverId,
      amount: Number(body.amount),
      note: body.note ?? null,
    });
  }

  @Get('requests')
  myRequests(@CurrentUser() user: JwtPayload) {
    return this.payment.listOwn(user.sub);
  }
}
