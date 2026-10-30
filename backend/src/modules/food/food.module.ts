import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FoodOrder, FoodOrderEvent, Kitchen, KitchenCourier, MenuCategory, MenuItem } from './food.entities';
import { FoodService } from './food.service';
import { FoodEvents } from './food.events';
import {
  ClientFoodController,
  DeliveryDriverController,
  FoodAdminController,
  KitchenController,
} from './food.controllers';
import { Driver } from '../driver/driver.entity';
import { Client } from '../client/client.entity';
import { BalanceModule } from '../balance/balance.module';
import { TariffModule } from '../tariff/tariff.module';
import { PromoModule } from '../promo/promo.module';

/** Food delivery (kitchens, menu, orders, couriers). Global: auth/bot/driver use it. */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Kitchen, KitchenCourier, MenuCategory, MenuItem, FoodOrder, FoodOrderEvent, Driver, Client]),
    BalanceModule,
    TariffModule,
    PromoModule,
  ],
  providers: [FoodService, FoodEvents],
  controllers: [FoodAdminController, KitchenController, ClientFoodController, DeliveryDriverController],
  exports: [FoodService, FoodEvents],
})
export class FoodModule {}
