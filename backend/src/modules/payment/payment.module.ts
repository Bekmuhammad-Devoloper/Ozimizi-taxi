import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentRequest } from './payment-request.entity';
import { Driver } from '../driver/driver.entity';
import { Admin } from '../admin/admin.entity';
import { PaymentService } from './payment.service';
import { CoordinatorController } from './coordinator.controller';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentRequest, Driver, Admin]),
    BalanceModule,
  ],
  providers: [PaymentService],
  controllers: [CoordinatorController],
  exports: [PaymentService],
})
export class PaymentModule {}
