/**
 * Lightweight event bus for payment-request lifecycle.
 * The wallet bot subscribes here to DM the driver when admin approves/rejects,
 * without depending on PaymentService circularly.
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { PaymentRequest } from './payment-request.entity';

export type PaymentEventName =
  | 'payment.submitted'
  | 'payment.approved'
  | 'payment.rejected';

export interface PaymentEventPayload {
  request: PaymentRequest;
  /** Resolved driver balance AFTER the decision was applied (approved only). */
  driverBalance?: number;
}

@Injectable()
export class PaymentEvents {
  private readonly bus = new EventEmitter();

  emit(name: PaymentEventName, payload: PaymentEventPayload) {
    this.bus.emit(name, payload);
  }

  on(
    name: PaymentEventName,
    listener: (payload: PaymentEventPayload) => void,
  ) {
    this.bus.on(name, listener);
  }
}
