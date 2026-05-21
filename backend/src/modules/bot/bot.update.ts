import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { join } from 'path';
import {
  Action,
  Command,
  Ctx,
  InjectBot,
  On,
  Start,
  Update,
} from 'nestjs-telegraf';
import { Context, Markup, Telegraf, Input } from 'telegraf';
import { ClientService } from '../client/client.service';
import { OrderService } from '../order/order.service';
import { SessionStore } from './bot.scenes';
import { OrderEvents, DriverSummary } from '../order/order.events';

const PHONE_REGEX = /^\+?\d{9,15}$/;

/** Telegram Markdown (v1) escaping — minimal: backticks, underscore, asterisk. */
function escapeMd(s: string): string {
  return (s ?? '').replace(/([_*`[\]])/g, '\\$1');
}

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return '-';
  return Number(v).toLocaleString('uz');
}

const mainMenu = () =>
  Markup.keyboard([
    ['🚖 Taxi chaqirish'],
    ['📋 Buyurtmalarim', '⚙️ Sozlamalar'],
  ])
    .resize()
    .persistent();

const phoneRequestKb = () =>
  Markup.keyboard([
    [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
  ])
    .oneTime()
    .resize();

const skipKb = () =>
  Markup.keyboard([['O‘tkazib yuborish']]).oneTime().resize();

const locationRequestKb = () =>
  Markup.keyboard([
    [Markup.button.locationRequest('📍 Lokatsiyani yuborish')],
    ['❌ Bekor qilish'],
  ])
    .oneTime()
    .resize();

@Update()
@Injectable()
export class BotUpdate implements OnModuleInit {
  private readonly logger = new Logger(BotUpdate.name);
  private readonly session = new SessionStore();

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly clients: ClientService,
    private readonly orders: OrderService,
    private readonly orderEvents: OrderEvents,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.orderEvents.on(
      'order.accepted',
      ({ order, driver, etaMinutes }) => {
        if (!driver) return;
        this.notifyClient(order.clientId, async (chatId) => {
          await this.sendDriverInfoMessage(chatId, order.id, driver, {
            header: '🚖 *Haydovchi topildi!*',
            etaMinutes,
            showCancel: true,
          });
        });
      },
    );
    this.orderEvents.on('order.on_the_way', ({ order, driver, etaMinutes }) => {
      if (!driver) return;
      this.notifyClient(order.clientId, async (chatId) => {
        await this.sendDriverInfoMessage(chatId, order.id, driver, {
          header: '🚗 *Taxi yo‘lda*',
          etaMinutes,
          showCancel: true,
        });
      });
    });

    this.orderEvents.on('order.arrived', ({ order, driver }) => {
      if (!driver) return;
      this.notifyClient(order.clientId, async (chatId) => {
        await this.sendDriverInfoMessage(chatId, order.id, driver, {
          header: '🟢 *Taxi yetib keldi!*\nHaydovchi sizni kutmoqda.',
          showCancel: false,
        });
      });
    });

    this.orderEvents.on('order.in_progress', ({ order }) => {
      this.notifyClient(order.clientId, async (chatId) => {
        await this.bot.telegram.sendMessage(
          chatId,
          '▶️ *Safar boshlandi*\nYaxshi yo‘l tilaymiz!',
          { parse_mode: 'Markdown' },
        );
      });
    });

    this.orderEvents.on('order.completed', ({ order }) => {
      this.notifyClient(order.clientId, async (chatId) => {
        const duration = order.acceptedAt && order.completedAt
          ? Math.max(
              1,
              Math.round(
                (new Date(order.completedAt).getTime() -
                  new Date(order.acceptedAt).getTime()) /
                  60_000,
              ),
            )
          : null;
        const lines = [
          '🏁 *Safar yakunlandi*',
          '',
          `📍 Masofa: *${order.distanceKm ?? '-'}* km`,
          `💰 Narx: *${fmtMoney(order.price)}* so‘m`,
        ];
        if (duration != null)
          lines.push(`⏱ Davomiyligi: *${duration}* daqiqa`);
        lines.push('', 'Bizdan foydalanganingiz uchun rahmat! 🙏');
        await this.bot.telegram.sendMessage(chatId, lines.join('\n'), {
          parse_mode: 'Markdown',
        });
      });
    });

    this.orderEvents.on('order.cancelled', ({ order }) => {
      this.notifyClient(order.clientId, async (chatId) => {
        await this.bot.telegram.sendMessage(
          chatId,
          '❌ *Buyurtma bekor qilindi*',
          { parse_mode: 'Markdown' },
        );
      });
    });
  }

  /**
   * Unified "driver info" message used for ACCEPTED / ON_THE_WAY / ARRIVED.
   * Sends car photo + caption (driver name, car, plate, phone, ETA)
   * with Tell qilish + (optional) Bekor qilish buttons.
   */
  private async sendDriverInfoMessage(
    chatId: number,
    orderId: string,
    driver: DriverSummary,
    opts: {
      header: string;
      etaMinutes?: number;
      showCancel: boolean;
    },
  ) {
    const lines: string[] = [opts.header, ''];
    lines.push(`👤 ${escapeMd(driver.fullName)}`);
    if (driver.carModel || driver.carColor) {
      const parts = [driver.carModel, driver.carColor].filter(Boolean);
      lines.push(`🚙 ${escapeMd(parts.join(' · '))}`);
    }
    if (driver.carPlate) {
      lines.push(`🔢 \`${escapeMd(driver.carPlate)}\``);
    }
    lines.push(`📞 ${escapeMd(driver.phone)}`);
    if (opts.etaMinutes != null) {
      lines.push(`⏱ Taxminan *${opts.etaMinutes} daqiqada* yetib keladi`);
    }
    const caption = lines.join('\n');

    // Telegram doesn't allow `tel:` in URL buttons, so we use sendContact
    // separately — gives a tappable contact card the user can call from.
    const keyboard = opts.showCancel
      ? Markup.inlineKeyboard([
          [Markup.button.callback('❌ Bekor qilish', `cancel:${orderId}`)],
        ])
      : undefined;

    // 1. Send car photo (or text) with full caption
    const photoSource = this.resolveLocalPhoto(driver.carPhotoUrl);
    let sent = false;
    if (photoSource) {
      try {
        await this.bot.telegram.sendPhoto(
          chatId,
          Input.fromLocalFile(photoSource),
          {
            caption,
            parse_mode: 'Markdown',
            ...(keyboard ?? {}),
          },
        );
        sent = true;
      } catch (e) {
        this.logger.warn(`sendPhoto failed: ${(e as Error).message}`);
      }
    }
    if (!sent) {
      await this.bot.telegram.sendMessage(chatId, caption, {
        parse_mode: 'Markdown',
        ...(keyboard ?? {}),
      });
    }

    // 2. Send a tappable contact card for one-tap calling
    try {
      const [firstName, ...rest] = driver.fullName.trim().split(/\s+/);
      await this.bot.telegram.sendContact(
        chatId,
        driver.phone,
        firstName || driver.fullName,
        { last_name: rest.join(' ') || undefined },
      );
    } catch (e) {
      this.logger.warn(`sendContact failed: ${(e as Error).message}`);
    }
  }

  /** Map /uploads/abc.jpg -> absolute local path. Returns null if missing. */
  private resolveLocalPhoto(url?: string | null): string | null {
    if (!url || !url.startsWith('/uploads/')) return null;
    const rel = url.replace(/^\/+/, '');
    const abs = join(process.cwd(), rel);
    return fs.existsSync(abs) ? abs : null;
  }

  private async notifyClient(
    clientId: string,
    cb: (chatId: number) => Promise<void>,
  ) {
    try {
      const client = await this.clients.findById(clientId);
      if (!client) return;
      await cb(Number(client.telegramId));
    } catch (e) {
      this.logger.warn(`notifyClient failed: ${(e as Error).message}`);
    }
  }

  @Start()
  async onStart(@Ctx() ctx: Context) {
    const from = ctx.from!;
    const existing = await this.clients.findByTelegramId(from.id);
    if (existing) {
      this.session.set(from.id, { step: 'registered' });
      await ctx.reply(`Xush kelibsiz, ${existing.firstName}!`, mainMenu());
      return;
    }
    this.session.set(from.id, {
      step: 'awaiting_primary_phone',
      firstName: from.first_name,
    });
    await ctx.reply(
      `Salom, ${from.first_name}! Iltimos, telefon raqamingizni yuboring.`,
      phoneRequestKb(),
    );
  }

  @On('contact')
  async onContact(@Ctx() ctx: Context) {
    const from = ctx.from!;
    const session = this.session.get(from.id);
    const contact = (ctx.message as any)?.contact;
    if (!contact || contact.user_id !== from.id) {
      await ctx.reply('Iltimos, o‘zingizning kontaktingizni yuboring.');
      return;
    }
    const phone = contact.phone_number.startsWith('+')
      ? contact.phone_number
      : '+' + contact.phone_number;

    if (session.step === 'awaiting_primary_phone') {
      this.session.set(from.id, {
        step: 'awaiting_secondary_phone',
        phonePrimary: phone,
      });
      await ctx.reply(
        'Qo‘shimcha telefon raqam (ixtiyoriy). Matn ko‘rinishida yuboring yoki "O‘tkazib yuborish" tugmasini bosing.',
        skipKb(),
      );
    }
  }

  @On('location')
  async onLocation(@Ctx() ctx: Context) {
    const from = ctx.from!;
    const loc = (ctx.message as any)?.location;
    this.logger.log(`Location from ${from.id}: ${JSON.stringify(loc)}`);
    if (!loc || typeof loc.latitude !== 'number') {
      await ctx.reply('Lokatsiya o‘qib bo‘lmadi. Qaytadan urinib ko‘ring.');
      return;
    }
    const client = await this.clients.findByTelegramId(from.id);
    if (!client) {
      await ctx.reply('Avval /start orqali ro‘yxatdan o‘ting.');
      return;
    }
    // Be forgiving: any location from a registered client = pickup intent.
    try {
      await this.orders.create({
        clientId: client.id,
        pickupLat: loc.latitude,
        pickupLng: loc.longitude,
      });
      this.session.set(from.id, { step: 'registered' });
      await ctx.reply(
        '🔎 Haydovchi qidirilmoqda...\nIltimos, kuting — yaqin atrofdagi haydovchilarga buyurtma yuborildi.',
        mainMenu(),
      );
    } catch (e) {
      this.logger.error(`order.create failed: ${(e as Error).message}`);
      await ctx.reply(
        'Buyurtma yaratib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.',
        mainMenu(),
      );
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const from = ctx.from!;
    const text = ((ctx.message as any)?.text ?? '') as string;
    const session = this.session.get(from.id);

    if (session.step === 'awaiting_secondary_phone') {
      let secondary: string | null = null;
      if (text !== 'O‘tkazib yuborish' && text !== "O'tkazib yuborish") {
        const normalized = text.replace(/\s/g, '');
        if (!PHONE_REGEX.test(normalized)) {
          await ctx.reply(
            'Telefon raqam noto‘g‘ri. Qaytadan kiriting yoki "O‘tkazib yuborish"ni tanlang.',
          );
          return;
        }
        secondary = normalized.startsWith('+') ? normalized : '+' + normalized;
      }
      await this.clients.upsert({
        telegramId: from.id,
        firstName: from.first_name ?? session.firstName ?? 'User',
        phonePrimary: session.phonePrimary!,
        phoneSecondary: secondary,
      });
      this.session.set(from.id, { step: 'registered' });
      await ctx.reply('✅ Ro‘yxatdan o‘tdingiz!', mainMenu());
      return;
    }

    if (text === '🚖 Taxi chaqirish') {
      const client = await this.clients.findByTelegramId(from.id);
      if (!client) {
        await ctx.reply('Avval /start orqali ro‘yxatdan o‘ting.');
        return;
      }
      this.session.set(from.id, { step: 'awaiting_pickup_location' });
      await ctx.reply(
        '📍 *Qayerdan olib ketishni belgilang*\n\n' +
          '📱 *Mobil Telegram:* pastdagi "Lokatsiyani yuborish" tugmasini bosing.\n' +
          '💻 *Desktop Telegram:* yuqori chap *📎 (qisqich)* belgisini bosing → *Location* → *Send my current location*.',
        { parse_mode: 'Markdown', ...locationRequestKb() },
      );
      return;
    }

    if (text === '❌ Bekor qilish') {
      this.session.set(from.id, { step: 'registered' });
      await ctx.reply('Bekor qilindi.', mainMenu());
      return;
    }

    if (text === '📋 Buyurtmalarim') {
      const client = await this.clients.findByTelegramId(from.id);
      if (!client) return;
      const orders = await this.clients.ordersFor(client.id);
      if (!orders.length) {
        await ctx.reply('Sizda buyurtmalar yo‘q.');
        return;
      }
      const lines = orders.slice(0, 10).map((o) => {
        return `• ${o.createdAt
          .toISOString()
          .slice(0, 16)
          .replace('T', ' ')} — ${o.status}${
          o.price ? ' — ' + o.price + ' so‘m' : ''
        }`;
      });
      await ctx.reply(lines.join('\n'));
      return;
    }

    if (text === '⚙️ Sozlamalar') {
      const client = await this.clients.findByTelegramId(from.id);
      if (!client) return;
      await ctx.reply(
        `Sozlamalar:\nIsm: ${client.firstName}\nTelefon: ${client.phonePrimary}${
          client.phoneSecondary ? '\nQo‘shimcha: ' + client.phoneSecondary : ''
        }`,
      );
      return;
    }
  }

  @Action(/cancel:(.+)/)
  async onCancel(@Ctx() ctx: Context) {
    const match = (ctx as any).match as RegExpExecArray;
    const orderId = match[1];
    try {
      await this.orders.cancel(orderId, 'client');
      await ctx.answerCbQuery('Bekor qilindi');
      try {
        await ctx.editMessageText('❌ Buyurtma bekor qilindi');
      } catch {
        /* edit may fail if msg is gone */
      }
    } catch (e) {
      await ctx.answerCbQuery((e as Error).message, { show_alert: true });
    }
  }

  @Command('help')
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(
      'Buyruqlar:\n/start — boshlash\n"🚖 Taxi chaqirish" — yangi buyurtma\n"📋 Buyurtmalarim" — tarix',
    );
  }
}
