import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DriverApplicationService } from './driver-application.service';
import { DriverApplicationStatus } from './driver-application.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/driver-applications')
export class DriverApplicationController {
  constructor(private readonly apps: DriverApplicationService) {}

  @Get()
  list(@Query('status') status?: string) {
    const filter = Object.values(DriverApplicationStatus).includes(
      status as DriverApplicationStatus,
    )
      ? (status as DriverApplicationStatus)
      : undefined;
    return this.apps.list(filter);
  }

  @Get('unread-count')
  async unread() {
    return { count: await this.apps.unreadTotal() };
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.apps.detail(id);
  }

  @Post(':id/read')
  read(@Param('id') id: string) {
    return this.apps.markRead(id);
  }

  @Post(':id/messages')
  reply(@Param('id') id: string, @Body() body: { text: string }) {
    return this.apps.reply(id, body?.text ?? '');
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: { kind?: 'taxi' | 'courier' | 'both' }) {
    const k = body?.kind;
    return this.apps.approve(id, k === 'taxi' || k === 'courier' ? k : 'both');
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.apps.reject(id, body?.reason);
  }
}
