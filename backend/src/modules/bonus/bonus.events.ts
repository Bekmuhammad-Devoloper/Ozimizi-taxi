/**
 * Bus for bonus-payment decisions. The client bot subscribes to tell the
 * passenger whether the driver accepted the bonus; the bot module is
 * optional (needs a real BOT_TOKEN) so the service must not import it.
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { BonusPayment } from './bonus-payment.entity';
import { Order } from '../order/order.entity';

export interface BonusDecidedPayload {
  payment: BonusPayment;
  order: Order;
  approved: boolean;
}

@Injectable()
export class BonusEvents {
  private readonly bus = new EventEmitter();

  emitDecided(payload: BonusDecidedPayload) {
    this.bus.emit('decided', payload);
  }

  onDecided(listener: (payload: BonusDecidedPayload) => void) {
    this.bus.on('decided', listener);
  }
}
