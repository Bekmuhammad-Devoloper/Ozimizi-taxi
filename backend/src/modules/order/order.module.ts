import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderEvent } from './order-event.entity';
import { Driver } from '../driver/driver.entity';
import { Client } from '../client/client.entity';
import { OrderService } from './order.service';
import { TariffModule } from '../tariff/tariff.module';
import { BalanceModule } from '../balance/balance.module';
import { OrderEvents } from './order.events';
import { PromoModule } from '../promo/promo.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderEvent, Driver, Client]),
    TariffModule,
    BalanceModule,
    PromoModule,
  ],
  providers: [OrderService, OrderEvents],
  exports: [OrderService, OrderEvents],
})
export class OrderModule {}
