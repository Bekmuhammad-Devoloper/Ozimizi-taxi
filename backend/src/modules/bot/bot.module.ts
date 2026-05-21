import { Module } from '@nestjs/common';
import { BotUpdate } from './bot.update';
import { ClientModule } from '../client/client.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [ClientModule, OrderModule],
  providers: [BotUpdate],
})
export class BotModule {}
