/**
 * Lightweight event bus for order lifecycle events.
 * The Telegram bot subscribes here to notify clients without depending on
 * the Order service circularly.
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Order } from './order.entity';

export type OrderEventName =
  | 'order.created'
  | 'order.accepted'
  | 'order.on_the_way'
  | 'order.arrived'
  | 'order.in_progress'
  | 'order.completed'
  | 'order.cancelled';

export interface DriverSummary {
  fullName: string;
  phone: string;
  avatarUrl?: string | null;
  carModel?: string | null;
  carColor?: string | null;
  carPlate?: string | null;
  carPhotoUrl?: string | null;
}

export interface OrderEventPayload {
  order: Order;
  driver?: DriverSummary;
  /** approximate minutes to pickup, computed from driver's current location */
  etaMinutes?: number;
}

@Injectable()
export class OrderEvents {
  private readonly bus = new EventEmitter();

  emit(name: OrderEventName, payload: OrderEventPayload) {
    this.bus.emit(name, payload);
  }

  on(name: OrderEventName, listener: (payload: OrderEventPayload) => void) {
    this.bus.on(name, listener);
  }
}
