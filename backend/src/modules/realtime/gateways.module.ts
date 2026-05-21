import { Module } from '@nestjs/common';
import { DriversGateway } from './drivers.gateway';
import { AdminGateway } from './admin.gateway';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../driver/driver.entity';

@Module({
  imports: [AuthModule, OrderModule, TypeOrmModule.forFeature([Driver])],
  providers: [DriversGateway, AdminGateway],
})
export class GatewaysModule {}
