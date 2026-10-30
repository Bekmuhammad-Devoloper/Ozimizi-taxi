/**
 * Bus between the admin panel and the client bot for driver applications.
 * The bot is an optional module (only loaded with a real BOT_TOKEN), so the
 * service emits here instead of depending on Telegraf directly.
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface ApplicantMessagePayload {
  telegramId: string;
  applicationId: string;
  /** Telegram HTML; user-supplied parts are already escaped. */
  html: string;
  /** Show the "✍️ Javob yozish" button under the message. */
  allowReply: boolean;
  /** Also send the latest APK of this app right after the message. */
  attachApp?: 'driver' | 'client';
}

@Injectable()
export class DriverApplicationEvents {
  private readonly bus = new EventEmitter();

  emitToApplicant(payload: ApplicantMessagePayload) {
    this.bus.emit('to_applicant', payload);
  }

  onToApplicant(listener: (payload: ApplicantMessagePayload) => void) {
    this.bus.on('to_applicant', listener);
  }
}
