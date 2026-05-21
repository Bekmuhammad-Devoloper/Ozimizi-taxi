import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { Driver } from '../driver/driver.entity';
import { OrderService } from './order.service';
import { TariffModule } from '../tariff/tariff.module';
import { BalanceModule } from '../balance/balance.module';
import { OrderEvents } from './order.events';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Driver]), TariffModule, BalanceModule],
  providers: [OrderService, OrderEvents],
  exports: [OrderService, OrderEvents],
})
export class OrderModule {}
