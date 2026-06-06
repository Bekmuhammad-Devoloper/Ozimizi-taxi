import { Global, Injectable, Module } from '@nestjs/common';
import * as crypto from 'crypto';

interface PendingLink {
  adminId: string;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Short-lived deep-link tokens used by the wallet bot to authenticate a
 * coordinator's Telegram chat against an admin row. Tokens are stored in
 * memory only — they expire after 10 minutes and can be redeemed exactly
 * once. Not persisted to the DB on purpose: the link is meant to be a
 * disposable, single-session credential.
 */
@Injectable()
export class WalletBotLinkService {
  private readonly tokens = new Map<string, PendingLink>();

  issue(adminId: string): string {
    this.gc();
    const token = 'co' + crypto.randomBytes(6).toString('hex');
    this.tokens.set(token, {
      adminId,
      expiresAt: Date.now() + TTL_MS,
    });
    return token;
  }

  redeem(token: string): string | null {
    this.gc();
    const row = this.tokens.get(token);
    if (!row) return null;
    if (row.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    this.tokens.delete(token);
    return row.adminId;
  }

  private gc() {
    const now = Date.now();
    for (const [k, v] of this.tokens.entries()) {
      if (v.expiresAt < now) this.tokens.delete(k);
    }
  }
}

@Global()
@Module({
  providers: [WalletBotLinkService],
  exports: [WalletBotLinkService],
})
export class WalletBotLinkModule {}
