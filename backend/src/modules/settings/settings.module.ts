import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteSetting } from './site-setting.entity';
import { Order } from '../order/order.entity';
import { Driver } from '../driver/driver.entity';
import { Client } from '../client/client.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { PublicSettingsController } from './public.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SiteSetting, Order, Driver, Client])],
  providers: [SettingsService],
  controllers: [SettingsController, PublicSettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
