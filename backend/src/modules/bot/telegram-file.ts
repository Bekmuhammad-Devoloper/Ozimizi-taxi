import * as fs from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Context, Telegraf } from 'telegraf';

/**
 * Download a Telegram file (e.g. the largest size of a sent photo) into
 * /uploads/<subdir>/ and return its public URL.
 */
export async function saveTelegramFile(
  bot: Telegraf<Context>,
  fileId: string,
  subdir: string,
): Promise<string> {
  const link = await bot.telegram.getFileLink(fileId);
  const res = await fetch(link.toString());
  if (!res.ok) throw new Error(`Telegram file download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const dir = join(process.cwd(), 'uploads', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  fs.writeFileSync(join(dir, filename), buf);
  return `/uploads/${subdir}/${filename}`;
}
