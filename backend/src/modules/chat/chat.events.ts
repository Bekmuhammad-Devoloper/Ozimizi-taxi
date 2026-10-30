/**
 * Driver → passenger chat lines go out through the Telegram bot, which is an
 * optional module; the chat service emits here instead of importing it.
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Order } from '../order/order.entity';
import { OrderMessage } from './order-message.entity';

export interface DriverMessagePayload {
  order: Order;
  message: OrderMessage;
  driverName: string;
}

@Injectable()
export class ChatEvents {
  private readonly bus = new EventEmitter();

  emitDriverMessage(payload: DriverMessagePayload) {
    this.bus.emit('driver_message', payload);
  }

  onDriverMessage(listener: (payload: DriverMessagePayload) => void) {
    this.bus.on('driver_message', listener);
  }
}
