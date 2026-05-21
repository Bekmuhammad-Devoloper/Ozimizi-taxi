import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './admin.entity';
import { AdminController } from './admin.controller';
import { DriverModule } from '../driver/driver.module';
import { ClientModule } from '../client/client.module';
import { OrderModule } from '../order/order.module';
import { TariffModule } from '../tariff/tariff.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    DriverModule,
    ClientModule,
    OrderModule,
    TariffModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
