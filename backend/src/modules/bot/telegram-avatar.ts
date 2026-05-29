import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { Telegram } from 'telegraf';

const logger = new Logger('TelegramAvatar');

/**
 * Fetch the user's current Telegram profile photo and persist it under
 * `<cwd>/uploads/clients/<userId>.jpg`. Returns the public URL path
 * (`/uploads/clients/...`) suitable for storing on the Client row, or
 * null if the user has no photo / the download fails.
 *
 * Designed for fire-and-forget use after /start: callers should `void`
 * the promise and never block the bot reply on it.
 */
export async function fetchAndStoreTelegramAvatar(
  telegram: Telegram,
  userId: number,
): Promise<string | null> {
  try {
    const photos = await telegram.getUserProfilePhotos(userId, 0, 1);
    if (!photos.total_count) return null;
    const sizes = photos.photos[0];
    if (!sizes?.length) return null;
    // PhotoSize array is ascending by resolution; the last item is usually
    // 640x640 — plenty for an avatar without wasting disk.
    const photo = sizes[sizes.length - 1];

    const link = await telegram.getFileLink(photo.file_id);
    const res = await fetch(link.toString());
    if (!res.ok) {
      logger.warn(`avatar download HTTP ${res.status} for ${userId}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    const dir = path.join(process.cwd(), 'uploads', 'clients');
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = `${userId}.jpg`;
    await fs.promises.writeFile(path.join(dir, filename), buf);
    return `/uploads/clients/${filename}`;
  } catch (e) {
    logger.warn(
      `avatar fetch failed for ${userId}: ${(e as Error).message}`,
    );
    return null;
  }
}
