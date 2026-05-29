import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './admin.entity';
import { AdminController } from './admin.controller';
import { DriverModule } from '../driver/driver.module';
import { ClientModule } from '../client/client.module';
import { OrderModule } from '../order/order.module';
import { TariffModule } from '../tariff/tariff.module';
import { BalanceModule } from '../balance/balance.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    DriverModule,
    ClientModule,
    OrderModule,
    TariffModule,
    BalanceModule,
    PaymentModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
