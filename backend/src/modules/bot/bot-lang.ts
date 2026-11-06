/**
 * Cyrillic for bot users who picked it. Every text the bot sends is written in
 * Latin; here outgoing messages and keyboards are converted per chat, and a
 * pressed Cyrillic button is turned back into its Latin label, so the handlers
 * keep working with one set of texts.
 */
import { AsyncLocalStorage } from 'async_hooks';
import { Telegraf, Telegram } from 'telegraf';
import { toCyrillic } from '../../common/utils/cyrillic';

const cyrillicUsers = new Set<string>();
const labels = new Map<string, string>(); // Cyrillic button → Latin button
const current = new AsyncLocalStorage<{ userId?: string }>();

export function setBotLang(telegramId: string | number, lang: 'latn' | 'cyrl') {
  if (lang === 'cyrl') cyrillicUsers.add(String(telegramId));
  else cyrillicUsers.delete(String(telegramId));
}

/** Buttons that must work right after a restart (an old keyboard is still on the phone). */
export function rememberLabels(list: string[]) {
  for (const l of list) labels.set(toCyrillic(l), l);
}

function localizeMarkup(markup: any) {
  if (!markup || typeof markup !== 'object') return markup;
  const row = (r: any[]) =>
    r.map((b) => {
      if (typeof b === 'string') {
        const t = toCyrillic(b);
        labels.set(t, b);
        return t;
      }
      if (!b?.text) return b;
      const t = toCyrillic(b.text);
      labels.set(t, b.text);
      return { ...b, text: t };
    });
  const out = { ...markup };
  if (Array.isArray(out.keyboard)) out.keyboard = out.keyboard.map(row);
  if (Array.isArray(out.inline_keyboard)) out.inline_keyboard = out.inline_keyboard.map(row);
  return out;
}

function localize(payload: any) {
  if (!payload || typeof payload !== 'object') return payload;
  const id = payload.chat_id != null ? String(payload.chat_id) : current.getStore()?.userId;
  if (!id || !cyrillicUsers.has(id)) return payload;
  const out = { ...payload };
  const html = out.parse_mode === 'HTML';
  if (typeof out.text === 'string') out.text = toCyrillic(out.text, { html });
  if (typeof out.caption === 'string') out.caption = toCyrillic(out.caption, { html });
  if (out.reply_markup) out.reply_markup = localizeMarkup(out.reply_markup);
  return out;
}

let patched = false;

export function installBotLang(bot: Telegraf<any>) {
  if (!patched) {
    patched = true;
    // ctx.telegram is a new Telegram per update, so patch the class.
    const proto = Telegram.prototype as any;
    const callApi = proto.callApi;
    proto.callApi = function (method: string, payload: any, opts: any) {
      return callApi.call(this, method, localize(payload), opts);
    };
  }
  const handle = bot.handleUpdate.bind(bot);
  bot.handleUpdate = ((update: any, res: any) => {
    const from = update?.message?.from ?? update?.callback_query?.from;
    const text = update?.message?.text;
    if (typeof text === 'string' && labels.has(text)) update.message.text = labels.get(text);
    return current.run({ userId: from?.id != null ? String(from.id) : undefined }, () => handle(update, res));
  }) as any;
}
