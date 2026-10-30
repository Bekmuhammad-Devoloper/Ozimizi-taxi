import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BonusPayment } from './bonus-payment.entity';
import { BonusService } from './bonus.service';
import { BonusEvents } from './bonus.events';
import { BonusController } from './bonus.controller';
import { Order } from '../order/order.entity';
import { Client } from '../client/client.entity';
import { BalanceModule } from '../balance/balance.module';
import { PromoModule } from '../promo/promo.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BonusPayment, Order, Client]),
    BalanceModule,
    PromoModule,
  ],
  providers: [BonusService, BonusEvents],
  controllers: [BonusController],
  exports: [BonusService, BonusEvents],
})
export class BonusModule {}
