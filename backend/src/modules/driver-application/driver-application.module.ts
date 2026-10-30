import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DriverApplication,
  DriverApplicationMessage,
} from './driver-application.entity';
import { DriverApplicationService } from './driver-application.service';
import { DriverApplicationController } from './driver-application.controller';
import { DriverApplicationEvents } from './driver-application.events';
import { Driver } from '../driver/driver.entity';
import { DriverModule } from '../driver/driver.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverApplication,
      DriverApplicationMessage,
      Driver,
    ]),
    DriverModule,
  ],
  providers: [DriverApplicationService, DriverApplicationEvents],
  controllers: [DriverApplicationController],
  exports: [DriverApplicationService, DriverApplicationEvents],
})
export class DriverApplicationModule {}
