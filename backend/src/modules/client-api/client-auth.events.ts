import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface LoginCodePayload {
  telegramId: string;
  code: string;
  firstName: string;
}

/**
 * Login codes for the client app are delivered through the Telegram bot;
 * the bot module is optional (needs BOT_TOKEN), so the auth service just
 * emits here and the bot subscribes when present.
 */
export type CodeSender = (payload: LoginCodePayload) => Promise<void>;

@Injectable()
export class ClientAuthEvents {
  private readonly bus = new EventEmitter();
  private sender: CodeSender | null = null;

  /** The bot registers itself here so delivery failures reach the caller. */
  setSender(fn: CodeSender) {
    this.sender = fn;
  }

  /** Deliver the code: listeners first (tests/logs), then the bot, awaited. */
  async deliver(payload: LoginCodePayload): Promise<void> {
    this.bus.emit('code', payload);
    if (this.sender) await this.sender(payload);
  }

  onCode(listener: (payload: LoginCodePayload) => void) {
    this.bus.on('code', listener);
  }
}
