import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { join } from 'path';
import { Context, Telegraf } from 'telegraf';

const log = new Logger('TelegramAvatar');

export interface AvatarSink {
  setAvatar(clientId: string, url: string | null): Promise<void>;
}

/**
 * Download the user's current Telegram profile photo and store it under
 * /uploads/clients/<clientId>.jpg. Idempotent: callers should gate on the
 * sink's TTL check before calling. Failures are swallowed (logged) so the
 * /start flow never breaks because of a transient Telegram outage or a
 * user with privacy-locked photos.
 */
export async function cacheTelegramAvatar(
  bot: Telegraf<Context> | Telegraf,
  telegramUserId: number | string,
  clientId: string,
  sink: AvatarSink,
): Promise<string | null> {
  try {
    const uid = Number(telegramUserId);
    if (!Number.isFinite(uid)) return null;

    const photos = await bot.telegram.getUserProfilePhotos(uid, 0, 1);
    if (!photos.total_count || !photos.photos[0]?.length) {
      // User has no photo or has privacy locked.
      return null;
    }
    // Each photo comes in multiple sizes — the last entry is the largest.
    const sizes = photos.photos[0];
    const best = sizes[sizes.length - 1];

    const link = await bot.telegram.getFileLink(best.file_id);
    const url = typeof link === 'string' ? link : link.toString();

    const res = await fetch(url);
    if (!res.ok) {
      log.warn(`getFileLink fetch ${res.status} for client ${clientId}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    const dir = join(process.cwd(), 'uploads', 'clients');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${clientId}.jpg`;
    fs.writeFileSync(join(dir, filename), buf);

    const publicUrl = `/uploads/clients/${filename}`;
    await sink.setAvatar(clientId, publicUrl);
    return publicUrl;
  } catch (e: any) {
    log.warn(`cacheTelegramAvatar failed for ${clientId}: ${e?.message ?? e}`);
    return null;
  }
}
