import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../client/client.entity';
import { Order } from '../order/order.entity';
import { Driver } from '../driver/driver.entity';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { ChatModule } from '../chat/chat.module';
import { BonusModule } from '../bonus/bonus.module';
import { PromoModule } from '../promo/promo.module';
import { TariffModule } from '../tariff/tariff.module';
import { ReceiptModule } from '../receipt/receipt.module';
import { ClientAuthEvents } from './client-auth.events';
import { ClientAuthService } from './client-auth.service';
import { ClientAuthController } from './client-auth.controller';
import { ClientApiController } from './client-api.controller';
import { ClientsGateway } from './clients.gateway';

/** REST + socket API for the client (passenger) app. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Order, Driver]),
    AuthModule,
    OrderModule,
    ChatModule,
    BonusModule,
    PromoModule,
    TariffModule,
    ReceiptModule,
  ],
  providers: [ClientAuthEvents, ClientAuthService, ClientsGateway],
  controllers: [ClientAuthController, ClientApiController],
  exports: [ClientAuthEvents, ClientAuthService],
})
export class ClientApiModule {}
