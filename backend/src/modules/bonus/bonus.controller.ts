import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { BonusService } from './bonus.service';

/** Driver side of client bonus payments: see pending requests, confirm. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
@Controller('driver/bonus')
export class BonusController {
  constructor(private readonly bonus: BonusService) {}

  @Get('pending')
  pending(@CurrentUser() user: JwtPayload) {
    return this.bonus.pendingForDriver(user.sub);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.bonus.decide(user.sub, id, true);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.bonus.decide(user.sub, id, false);
  }
}
