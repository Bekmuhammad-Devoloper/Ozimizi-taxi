import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { FoodOrder } from './food.entities';

export interface FoodStatusPayload {
  order: FoodOrder;
  kitchenName: string;
  courier?: { fullName: string; phone: string; carModel?: string | null; carPlate?: string | null } | null;
}

/**
 * Food order status changes for the Telegram bot (the bot module is optional,
 * so the food service only emits here and the bot subscribes when present).
 */
@Injectable()
export class FoodEvents {
  private readonly bus = new EventEmitter();

  emitStatus(payload: FoodStatusPayload) {
    this.bus.emit('status', payload);
  }

  onStatus(listener: (payload: FoodStatusPayload) => void) {
    this.bus.on('status', listener);
  }
}
