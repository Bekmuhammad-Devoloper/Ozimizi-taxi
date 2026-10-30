import { Injectable } from '@nestjs/common';

export interface FeedbackReplyPayload {
  telegramUserId: string;
  text: string;
}

export type ReplySender = (payload: FeedbackReplyPayload) => Promise<void>;

/**
 * Admin replies to inbox messages are delivered through the client bot. The
 * bot module is optional (needs BOT_TOKEN), so the admin API only calls the
 * sender the bot registered here; without a bot, replies fail loudly.
 */
@Injectable()
export class FeedbackEvents {
  private sender: ReplySender | null = null;

  setSender(fn: ReplySender) {
    this.sender = fn;
  }

  get canDeliver(): boolean {
    return this.sender != null;
  }

  async deliverReply(payload: FeedbackReplyPayload): Promise<void> {
    if (!this.sender) throw new Error('Telegram bot ulanmagan');
    await this.sender(payload);
  }
}
