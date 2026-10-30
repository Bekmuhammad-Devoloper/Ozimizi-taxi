import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderMessage } from './order-message.entity';
import { ChatService } from './chat.service';
import { ChatEvents } from './chat.events';
import { ChatController } from './chat.controller';
import { Order } from '../order/order.entity';
import { Driver } from '../driver/driver.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderMessage, Order, Driver])],
  providers: [ChatService, ChatEvents],
  controllers: [ChatController],
  exports: [ChatService, ChatEvents],
})
export class ChatModule {}
