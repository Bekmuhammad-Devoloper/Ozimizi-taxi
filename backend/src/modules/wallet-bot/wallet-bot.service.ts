import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Context, Telegraf, Markup } from 'telegraf';
import { Driver } from '../driver/driver.entity';
import { PaymentService } from '../payment/payment.service';
import {
  PaymentEvents,
  PaymentEventPayload,
} from '../payment/payment.events';
import { PaymentRequestStatus } from '../payment/payment-request.entity';

type FsmStep = 'awaiting_amount' | 'awaiting_note';
interface FsmState {
  mode: 'withdraw' | 'topup';
  step: FsmStep;
  amount?: number;
}

@Injectable()
export class WalletBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletBotService.name);
  private bot: Telegraf | null = null;
  private readonly fsm = new Map<number, FsmState>();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    private readonly payment: PaymentService,
    private readonly events: PaymentEvents,
  ) {}

  async onModuleInit() {
    const token = this.config.get<string>('WALLET_BOT_TOKEN') ?? '';
    if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
      this.logger.warn(
        'WALLET_BOT_TOKEN missing or invalid — wallet bot disabled',
      );
      return;
    }
    this.bot = new Telegraf(token);
    this.registerHandlers(this.bot);
    this.subscribeToPaymentEvents();
    this.bot
      .launch()
      .then(() => this.logger.log('Wallet bot launched'))
      .catch((e) => this.logger.error('Wallet bot launch failed', e));
  }

  async onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('SIGTERM');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Phone helpers (kept in sync with AuthService normalization)
  // ──────────────────────────────────────────────────────────────────────────
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return '+' + digits;
  }

  private async findDriverByChatId(chatId: number): Promise<Driver | null> {
    return this.drivers.findOne({
      where: { walletTelegramId: String(chatId) as any },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Telegraf wiring
  // ──────────────────────────────────────────────────────────────────────────
  private registerHandlers(bot: Telegraf) {
    bot.start(async (ctx) => this.handleStart(ctx));
    bot.command('balans', async (ctx) => this.handleBalance(ctx));
    bot.command('menu', async (ctx) => this.showMenu(ctx));
    bot.command('cancel', async (ctx) => this.cancelFlow(ctx));

    bot.on('contact', async (ctx) => this.handleContact(ctx));

    bot.hears('💰 Balans', async (ctx) => this.handleBalance(ctx));
    bot.hears('📤 Pul yechish', async (ctx) =>
      this.beginFlow(ctx, 'withdraw'),
    );
    bot.hears('📥 Pul tashlash', async (ctx) =>
      this.beginFlow(ctx, 'topup'),
    );
    bot.hears('📋 So‘rovlar tarixi', async (ctx) => this.handleHistory(ctx));
    bot.hears('❌ Bekor qilish', async (ctx) => this.cancelFlow(ctx));

    bot.on('text', async (ctx) => this.handleText(ctx));

    bot.catch((err) => {
      this.logger.error('Wallet bot error', err as any);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Handlers
  // ──────────────────────────────────────────────────────────────────────────
  private async handleStart(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const driver = await this.findDriverByChatId(chatId);
    if (driver) {
      await ctx.reply(
        `Salom, ${driver.fullName}! 👋\nWallet botga xush kelibsiz.`,
        this.mainKeyboard(),
      );
      return;
    }
    await ctx.reply(
      'Salom! 👋\nWallet hisobingizga kirish uchun ro‘yxatdan o‘tgan telefon raqamingizni yuboring.',
      Markup.keyboard([
        Markup.button.contactRequest('📞 Telefon raqamni yuborish'),
      ])
        .oneTime()
        .resize(),
    );
  }

  private async handleContact(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const contact = (ctx.message as any)?.contact;
    if (!contact?.phone_number) {
      await ctx.reply('Telefon raqam topilmadi. /start ni qayta bosing.');
      return;
    }
    // Telegram requires that the user share *their own* contact, not someone
    // else's — but we double-check by comparing user_id with from.id.
    if (contact.user_id && contact.user_id !== ctx.from?.id) {
      await ctx.reply(
        'Iltimos, faqat o‘zingizning kontaktingizni yuboring.',
      );
      return;
    }
    const phone = this.normalizePhone(contact.phone_number);
    const driver = await this.drivers.findOne({
      where: [{ phone }, { phone: contact.phone_number }],
    });
    if (!driver) {
      await ctx.reply(
        '❌ Bu raqam haydovchi ro‘yxatida yo‘q.\n\n' +
          'Avval admin sizni tizimga qo‘shishi kerak. Admin bilan bog‘laning.',
        Markup.removeKeyboard(),
      );
      return;
    }
    if (!driver.isActive) {
      await ctx.reply(
        '❌ Akkauntingiz faol emas. Admin bilan bog‘laning.',
        Markup.removeKeyboard(),
      );
      return;
    }
    // If another driver had this chat linked, unlink it first.
    if (driver.walletTelegramId !== String(chatId)) {
      await this.drivers
        .createQueryBuilder()
        .update(Driver)
        .set({ walletTelegramId: null as any })
        .where('wallet_telegram_id = :cid', { cid: String(chatId) })
        .execute();
      await this.drivers.update(driver.id, {
        walletTelegramId: String(chatId) as any,
      });
    }
    await ctx.reply(
      `✅ Salom, ${driver.fullName}!\n` +
        `Hisobingiz muvaffaqiyatli ulandi.\n\n` +
        `💰 Joriy balans: <b>${this.fmt(driver.balance)} so‘m</b>`,
      { parse_mode: 'HTML', ...this.mainKeyboard() },
    );
  }

  private async handleBalance(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const driver = await this.findDriverByChatId(chatId);
    if (!driver) return this.askLogin(ctx);
    // Re-fetch latest balance.
    const fresh = await this.drivers.findOne({ where: { id: driver.id } });
    await ctx.reply(
      `💰 <b>Balans:</b> ${this.fmt(fresh?.balance ?? '0')} so‘m`,
      { parse_mode: 'HTML', ...this.mainKeyboard() },
    );
  }

  private async showMenu(ctx: Context) {
    const driver = await this.findDriverByChatId(ctx.chat?.id ?? 0);
    if (!driver) return this.askLogin(ctx);
    await ctx.reply('Menyu:', this.mainKeyboard());
  }

  private async handleHistory(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const driver = await this.findDriverByChatId(chatId);
    if (!driver) return this.askLogin(ctx);
    const rows = await this.payment.listByDriver(driver.id, 10);
    if (!rows.length) {
      await ctx.reply('📋 So‘rovlar tarixi bo‘sh.', this.mainKeyboard());
      return;
    }
    const lines = rows.map((r) => {
      const sign = Number(r.amount) >= 0 ? '+' : '';
      const date = new Date(r.createdAt).toLocaleDateString('uz', {
        day: '2-digit',
        month: 'short',
      });
      const icon =
        r.status === PaymentRequestStatus.APPROVED
          ? '✅'
          : r.status === PaymentRequestStatus.REJECTED
            ? '❌'
            : '⏳';
      return `${icon} ${date} · ${sign}${this.fmt(r.amount)} so‘m${
        r.note ? ` · ${r.note}` : ''
      }`;
    });
    await ctx.reply(
      `📋 <b>Oxirgi so‘rovlar:</b>\n\n${lines.join('\n')}`,
      { parse_mode: 'HTML', ...this.mainKeyboard() },
    );
  }

  private async beginFlow(ctx: Context, mode: 'withdraw' | 'topup') {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const driver = await this.findDriverByChatId(chatId);
    if (!driver) return this.askLogin(ctx);
    this.fsm.set(chatId, { mode, step: 'awaiting_amount' });
    const label = mode === 'withdraw' ? 'yechmoqchi' : 'tashlamoqchi';
    await ctx.reply(
      `Qancha so‘mni ${label}siz?\n\nMasalan: <code>50000</code>`,
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([['❌ Bekor qilish']]).resize(),
      },
    );
  }

  private async cancelFlow(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    if (this.fsm.delete(chatId)) {
      await ctx.reply('🚫 Bekor qilindi.', this.mainKeyboard());
    } else {
      await ctx.reply('Faol so‘rov yo‘q.', this.mainKeyboard());
    }
  }

  private async handleText(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const state = this.fsm.get(chatId);
    if (!state) return; // not in a flow — ignore so menu buttons still match
    const text = ((ctx.message as any)?.text ?? '').trim();
    if (!text || text.startsWith('/')) return;
    // Skip menu button labels that fell through the hears() handlers.
    if (
      text === '💰 Balans' ||
      text === '📤 Pul yechish' ||
      text === '📥 Pul tashlash' ||
      text === '📋 So‘rovlar tarixi' ||
      text === '❌ Bekor qilish'
    ) {
      return;
    }

    if (state.step === 'awaiting_amount') {
      const num = Number(text.replace(/\s+/g, '').replace(/,/g, '.'));
      if (!Number.isFinite(num) || num <= 0) {
        await ctx.reply(
          'Summa noto‘g‘ri. Faqat son kiriting. Masalan: 50000',
        );
        return;
      }
      if (num > 50_000_000) {
        await ctx.reply('Summa juda katta. 50 000 000 dan kam bo‘lsin.');
        return;
      }
      state.amount = num;
      state.step = 'awaiting_note';
      this.fsm.set(chatId, state);
      await ctx.reply(
        'Izoh yozing (ixtiyoriy). Izoh yozmasangiz "-" yuboring.',
        Markup.keyboard([['-'], ['❌ Bekor qilish']]).resize(),
      );
      return;
    }

    if (state.step === 'awaiting_note') {
      const note = text === '-' ? null : text.slice(0, 300);
      const driver = await this.findDriverByChatId(chatId);
      if (!driver || !state.amount) {
        this.fsm.delete(chatId);
        await ctx.reply(
          'Xato yuz berdi, qaytadan urinib ko‘ring.',
          this.mainKeyboard(),
        );
        return;
      }
      const signed = state.mode === 'withdraw' ? -state.amount : state.amount;
      try {
        await this.payment.submitByDriver({
          driverId: driver.id,
          amount: signed,
          note,
        });
        this.fsm.delete(chatId);
        await ctx.reply(
          `✅ <b>So‘rov yuborildi</b>\n\n` +
            `Summa: ${signed >= 0 ? '+' : ''}${this.fmt(signed)} so‘m\n` +
            (note ? `Izoh: ${note}\n` : '') +
            `\n⏳ Admin tasdiqlashi kutilmoqda. Javob shu yerga keladi.`,
          { parse_mode: 'HTML', ...this.mainKeyboard() },
        );
      } catch (e: any) {
        this.fsm.delete(chatId);
        const msg = e?.response?.message ?? e?.message ?? 'Xato yuz berdi';
        await ctx.reply(`❌ ${msg}`, this.mainKeyboard());
      }
    }
  }

  private async askLogin(ctx: Context) {
    await ctx.reply(
      'Avval telefon raqamingizni yuborib hisobingizga kiring.',
      Markup.keyboard([
        Markup.button.contactRequest('📞 Telefon raqamni yuborish'),
      ])
        .oneTime()
        .resize(),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Driver notifications on admin decision
  // ──────────────────────────────────────────────────────────────────────────
  private subscribeToPaymentEvents() {
    this.events.on('payment.approved', (p) => this.notifyDecision(p, true));
    this.events.on('payment.rejected', (p) => this.notifyDecision(p, false));
  }

  private async notifyDecision(
    payload: PaymentEventPayload,
    approved: boolean,
  ) {
    try {
      const driver = await this.drivers.findOne({
        where: { id: payload.request.driverId },
      });
      if (!driver?.walletTelegramId || !this.bot) return;
      const chatId = Number(driver.walletTelegramId);
      if (!Number.isFinite(chatId)) return;

      const amount = Number(payload.request.amount);
      const sign = amount >= 0 ? '+' : '';
      const verdict = approved ? '✅ Tasdiqlandi' : '❌ Rad etildi';
      const balanceLine =
        approved && payload.driverBalance !== undefined
          ? `\n💰 Yangi balans: <b>${this.fmt(payload.driverBalance)} so‘m</b>`
          : '';

      await this.bot.telegram.sendMessage(
        chatId,
        `${verdict}\n\n` +
          `Summa: ${sign}${this.fmt(amount)} so‘m` +
          (payload.request.note ? `\nIzoh: ${payload.request.note}` : '') +
          balanceLine,
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      this.logger.error('notifyDecision failed', e as any);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  UI helpers
  // ──────────────────────────────────────────────────────────────────────────
  private mainKeyboard() {
    return Markup.keyboard([
      ['💰 Balans'],
      ['📤 Pul yechish', '📥 Pul tashlash'],
      ['📋 So‘rovlar tarixi'],
    ]).resize();
  }

  private fmt(v: number | string): string {
    return Number(v ?? 0).toLocaleString('uz');
  }
}
