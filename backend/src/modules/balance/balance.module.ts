import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceTransaction } from './balance-transaction.entity';
import { Driver } from '../driver/driver.entity';
import { Admin } from '../admin/admin.entity';
import { Client } from '../client/client.entity';
import { BalanceService } from './balance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BalanceTransaction, Driver, Admin, Client]),
  ],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
