import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { AnnouncementService } from './announcement.service';
import { AnnouncementAudience } from './announcement.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/announcements')
export class AnnouncementAdminController {
  constructor(private readonly announcements: AnnouncementService) {}

  @Get()
  list() {
    return this.announcements.list();
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { title: string; text: string; audience: AnnouncementAudience },
  ) {
    return this.announcements.create(user.sub, body ?? ({} as any));
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
@Controller('driver/announcements')
export class AnnouncementDriverController {
  constructor(private readonly announcements: AnnouncementService) {}

  @Get()
  latest() {
    return this.announcements.latestForDrivers(5);
  }
}
