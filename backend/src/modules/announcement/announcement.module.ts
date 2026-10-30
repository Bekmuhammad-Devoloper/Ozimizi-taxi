import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Announcement } from './announcement.entity';
import { AnnouncementService } from './announcement.service';
import { AnnouncementEvents } from './announcement.events';
import {
  AnnouncementAdminController,
  AnnouncementDriverController,
} from './announcement.controller';
import { Driver } from '../driver/driver.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Announcement, Driver])],
  providers: [AnnouncementService, AnnouncementEvents],
  controllers: [AnnouncementAdminController, AnnouncementDriverController],
  exports: [AnnouncementService, AnnouncementEvents],
})
export class AnnouncementModule {}
