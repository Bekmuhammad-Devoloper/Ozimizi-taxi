import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from './driver.entity';
import { DriverService } from './driver.service';
import { DriverController } from './driver.controller';
import { OrderModule } from '../order/order.module';
import { BalanceModule } from '../balance/balance.module';
import { TariffModule } from '../tariff/tariff.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver]),
    OrderModule,
    BalanceModule,
    TariffModule,
  ],
  providers: [DriverService],
  controllers: [DriverController],
  exports: [DriverService],
})
export class DriverModule {}
