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
import { Client } from '../client/client.entity';
import { PaymentService } from '../payment/payment.service';
import {
  PaymentEvents,
  PaymentEventPayload,
} from '../payment/payment.events';
import { PaymentRequestStatus } from '../payment/payment-request.entity';

type Role = 'driver' | 'client';
type FsmStep = 'awaiting_amount' | 'awaiting_note';
interface FsmState {
  mode: 'withdraw' | 'topup';
  step: FsmStep;
  amount?: number;
}
interface Linked {
  role: Role;
  id: string;
}

@Injectable()
export class WalletBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletBotService.name);
  private bot: Telegraf | null = null;
  private readonly fsm = new Map<number, FsmState>();
  // chatId → ambiguous-resolution context: when a phone matches both a
  // driver and a client, remember the candidates while the user picks.
  private readonly pendingRoleChoice = new Map<
    number,
    { driverId: string; clientId: string }
  >();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
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
    // dropPendingUpdates clears the queue on startup so a long downtime
    // (e.g. previous polling instance holding the offset) doesn't replay
    // hundreds of /start messages. launch() returns a long-running promise
    // that only resolves on bot.stop(); attach a real error logger.
    this.bot.launch({ dropPendingUpdates: true }).catch((e: any) => {
      this.logger.error(
        `Wallet bot launch failed: ${e?.message ?? e}`,
        e?.stack,
      );
    });
    this.logger.log('Wallet bot launching (long-poll)…');
  }

  async onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('SIGTERM');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Phone + link helpers
  // ──────────────────────────────────────────────────────────────────────────
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return '+' + digits;
  }

  /** Resolve the role this chat is currently linked to. */
  private async findLinked(chatId: number): Promise<Linked | null> {
    const driver = await this.drivers.findOne({
      where: { walletTelegramId: String(chatId) as any },
    });
    if (driver) return { role: 'driver', id: driver.id };
    const client = await this.clients.findOne({
      where: { walletTelegramId: String(chatId) as any },
    });
    if (client) return { role: 'client', id: client.id };
    return null;
  }

  private async linkDriver(driverId: string, chatId: number) {
    // Unlink anyone else (driver OR client) currently holding this chat.
    await this.drivers
      .createQueryBuilder()
      .update(Driver)
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
    await this.clients
      .createQueryBuilder()
      .update(Client)
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
    await this.drivers.update(driverId, {
      walletTelegramId: String(chatId) as any,
    });
  }

  private async linkClient(clientId: string, chatId: number) {
    await this.drivers
      .createQueryBuilder()
      .update(Driver)
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
    await this.clients
      .createQueryBuilder()
      .update(Client)
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
    await this.clients.update(clientId, {
      walletTelegramId: String(chatId) as any,
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
    bot.command('chiqish', async (ctx) => this.handleLogout(ctx));

    bot.on('contact', async (ctx) => this.handleContact(ctx));

    bot.hears('🚗 Haydovchi', async (ctx) =>
      this.resolveRoleChoice(ctx, 'driver'),
    );
    bot.hears('👤 Klient', async (ctx) =>
      this.resolveRoleChoice(ctx, 'client'),
    );

    bot.hears('💰 Balans', async (ctx) => this.handleBalance(ctx));
    bot.hears('📤 Pul yechish', async (ctx) =>
      this.beginFlow(ctx, 'withdraw'),
    );
    bot.hears('📥 Pul tashlash', async (ctx) =>
      this.beginFlow(ctx, 'topup'),
    );
    bot.hears('📥 Hisobni to‘ldirish', async (ctx) =>
      this.beginFlow(ctx, 'topup'),
    );
    bot.hears('📋 So‘rovlar tarixi', async (ctx) => this.handleHistory(ctx));
    bot.hears('❌ Bekor qilish', async (ctx) => this.cancelFlow(ctx));
    bot.hears('🚪 Chiqish', async (ctx) => this.handleLogout(ctx));

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
    const linked = await this.findLinked(chatId);
    if (linked) {
      const name = await this.displayName(linked);
      await ctx.reply(
        `Salom, ${name}! 👋\nWallet botga xush kelibsiz.`,
        this.mainKeyboard(linked.role),
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
    if (contact.user_id && contact.user_id !== ctx.from?.id) {
      await ctx.reply('Iltimos, faqat o‘zingizning kontaktingizni yuboring.');
      return;
    }
    const phone = this.normalizePhone(contact.phone_number);

    const driver = await this.drivers.findOne({
      where: [{ phone }, { phone: contact.phone_number }],
    });
    const client = await this.clients.findOne({
      where: [
        { phonePrimary: phone },
        { phonePrimary: contact.phone_number },
      ],
    });

    if (!driver && !client) {
      await ctx.reply(
        '❌ Bu raqam tizimda topilmadi.\n\n' +
          'Klient sifatida ro‘yxatdan o‘tish: @ozimizitaxi_bot orqali /start qiling.\n' +
          'Haydovchi bo‘lish uchun admin bilan bog‘laning.',
        Markup.removeKeyboard(),
      );
      return;
    }

    if (driver && client) {
      // Both — let the user pick. Cache the candidates briefly.
      this.pendingRoleChoice.set(chatId, {
        driverId: driver.id,
        clientId: client.id,
      });
      await ctx.reply(
        'Bu raqam ham haydovchi, ham klient sifatida ro‘yxatdan o‘tgan.\n' +
          'Qaysi hisob bilan kirasiz?',
        Markup.keyboard([['🚗 Haydovchi', '👤 Klient']])
          .oneTime()
          .resize(),
      );
      return;
    }

    if (driver) {
      if (!driver.isActive) {
        await ctx.reply(
          '❌ Haydovchi akkauntingiz faol emas. Admin bilan bog‘laning.',
          Markup.removeKeyboard(),
        );
        return;
      }
      await this.linkDriver(driver.id, chatId);
      await ctx.reply(
        `✅ Salom, ${driver.fullName}!\n` +
          `Haydovchi hisobi ulandi.\n\n` +
          `💰 Joriy balans: <b>${this.fmt(driver.balance)} so‘m</b>`,
        { parse_mode: 'HTML', ...this.mainKeyboard('driver') },
      );
      return;
    }

    // Client only
    await this.linkClient(client!.id, chatId);
    await ctx.reply(
      `✅ Salom, ${client!.firstName}!\n` +
        `Klient hisobi ulandi.\n\n` +
        `💰 Joriy balans: <b>${this.fmt(client!.balance)} so‘m</b>`,
      { parse_mode: 'HTML', ...this.mainKeyboard('client') },
    );
  }

  private async resolveRoleChoice(ctx: Context, picked: Role) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const pending = this.pendingRoleChoice.get(chatId);
    if (!pending) return; // not in role-choice flow — let menu hears handlers run

    this.pendingRoleChoice.delete(chatId);
    if (picked === 'driver') {
      const driver = await this.drivers.findOne({
        where: { id: pending.driverId },
      });
      if (!driver || !driver.isActive) {
        await ctx.reply(
          '❌ Haydovchi hisobi faol emas. Admin bilan bog‘laning.',
          Markup.removeKeyboard(),
        );
        return;
      }
      await this.linkDriver(driver.id, chatId);
      await ctx.reply(
        `✅ Haydovchi hisobi (${driver.fullName}) ulandi.\n` +
          `💰 Balans: <b>${this.fmt(driver.balance)} so‘m</b>`,
        { parse_mode: 'HTML', ...this.mainKeyboard('driver') },
      );
      return;
    }
    const client = await this.clients.findOne({
      where: { id: pending.clientId },
    });
    if (!client) {
      await ctx.reply('Klient topilmadi.', Markup.removeKeyboard());
      return;
    }
    await this.linkClient(client.id, chatId);
    await ctx.reply(
      `✅ Klient hisobi (${client.firstName}) ulandi.\n` +
        `💰 Balans: <b>${this.fmt(client.balance)} so‘m</b>`,
      { parse_mode: 'HTML', ...this.mainKeyboard('client') },
    );
  }

  private async handleBalance(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const linked = await this.findLinked(chatId);
    if (!linked) return this.askLogin(ctx);
    const balance = await this.balanceOf(linked);
    await ctx.reply(
      `💰 <b>Balans:</b> ${this.fmt(balance)} so‘m`,
      { parse_mode: 'HTML', ...this.mainKeyboard(linked.role) },
    );
  }

  private async showMenu(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const linked = await this.findLinked(chatId);
    if (!linked) return this.askLogin(ctx);
    await ctx.reply('Menyu:', this.mainKeyboard(linked.role));
  }

  private async handleHistory(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const linked = await this.findLinked(chatId);
    if (!linked) return this.askLogin(ctx);
    const rows =
      linked.role === 'driver'
        ? await this.payment.listByDriver(linked.id, 10)
        : await this.payment.listByClient(linked.id, 10);
    if (!rows.length) {
      await ctx.reply(
        '📋 So‘rovlar tarixi bo‘sh.',
        this.mainKeyboard(linked.role),
      );
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
      { parse_mode: 'HTML', ...this.mainKeyboard(linked.role) },
    );
  }

  private async beginFlow(ctx: Context, mode: 'withdraw' | 'topup') {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const linked = await this.findLinked(chatId);
    if (!linked) return this.askLogin(ctx);
    // Clients can only top up — never withdraw from the system here.
    if (linked.role === 'client' && mode === 'withdraw') {
      await ctx.reply(
        'Klient hisobi faqat to‘ldiriladi. Pul yechish admin bilan bog‘lanib amalga oshiriladi.',
        this.mainKeyboard('client'),
      );
      return;
    }
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
    const linked = await this.findLinked(chatId);
    if (this.fsm.delete(chatId)) {
      await ctx.reply(
        '🚫 Bekor qilindi.',
        linked
          ? this.mainKeyboard(linked.role)
          : Markup.removeKeyboard(),
      );
    } else {
      await ctx.reply(
        'Faol so‘rov yo‘q.',
        linked
          ? this.mainKeyboard(linked.role)
          : Markup.removeKeyboard(),
      );
    }
  }

  private async handleLogout(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await this.drivers
      .createQueryBuilder()
      .update(Driver)
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
    await this.clients
      .createQueryBuilder()
      .update(Client)
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
    this.fsm.delete(chatId);
    this.pendingRoleChoice.delete(chatId);
    await ctx.reply(
      'Hisob ajratildi. Qayta kirish uchun /start ni bosing.',
      Markup.removeKeyboard(),
    );
  }

  private async handleText(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const state = this.fsm.get(chatId);
    if (!state) return;
    const text = ((ctx.message as any)?.text ?? '').trim();
    if (!text || text.startsWith('/')) return;
    // Skip menu button labels that fell through the hears() handlers.
    if (
      text === '💰 Balans' ||
      text === '📤 Pul yechish' ||
      text === '📥 Pul tashlash' ||
      text === '📥 Hisobni to‘ldirish' ||
      text === '📋 So‘rovlar tarixi' ||
      text === '❌ Bekor qilish' ||
      text === '🚪 Chiqish' ||
      text === '🚗 Haydovchi' ||
      text === '👤 Klient'
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
      const linked = await this.findLinked(chatId);
      if (!linked || !state.amount) {
        this.fsm.delete(chatId);
        await ctx.reply(
          'Xato yuz berdi, qaytadan urinib ko‘ring.',
          linked
            ? this.mainKeyboard(linked.role)
            : Markup.removeKeyboard(),
        );
        return;
      }
      const signed = state.mode === 'withdraw' ? -state.amount : state.amount;
      try {
        if (linked.role === 'driver') {
          await this.payment.submitByDriver({
            driverId: linked.id,
            amount: signed,
            note,
          });
        } else {
          // Clients: always positive (beginFlow blocks withdraw earlier).
          await this.payment.submitByClient({
            clientId: linked.id,
            amount: Math.abs(state.amount),
            note,
          });
        }
        this.fsm.delete(chatId);
        await ctx.reply(
          `✅ <b>So‘rov yuborildi</b>\n\n` +
            `Summa: ${signed >= 0 ? '+' : ''}${this.fmt(signed)} so‘m\n` +
            (note ? `Izoh: ${note}\n` : '') +
            `\n⏳ Tasdiqlash kutilmoqda. Javob shu yerga keladi.`,
          { parse_mode: 'HTML', ...this.mainKeyboard(linked.role) },
        );
      } catch (e: any) {
        this.fsm.delete(chatId);
        const msg = e?.response?.message ?? e?.message ?? 'Xato yuz berdi';
        await ctx.reply(`❌ ${msg}`, this.mainKeyboard(linked.role));
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
  //  DM on admin/coordinator decision
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
      if (!this.bot) return;
      let chatId: number | null = null;
      let balanceLine = '';
      const amount = Number(payload.request.amount);
      const sign = amount >= 0 ? '+' : '';

      if (payload.request.driverId) {
        const driver = await this.drivers.findOne({
          where: { id: payload.request.driverId },
        });
        if (driver?.walletTelegramId) {
          const cid = Number(driver.walletTelegramId);
          if (Number.isFinite(cid)) chatId = cid;
        }
        if (approved && payload.driverBalance !== undefined) {
          balanceLine = `\n💰 Yangi balans: <b>${this.fmt(
            payload.driverBalance,
          )} so‘m</b>`;
        }
      } else if (payload.request.clientId) {
        const client = await this.clients.findOne({
          where: { id: payload.request.clientId },
        });
        if (client?.walletTelegramId) {
          const cid = Number(client.walletTelegramId);
          if (Number.isFinite(cid)) chatId = cid;
        }
        if (approved && client) {
          balanceLine = `\n💰 Yangi balans: <b>${this.fmt(client.balance)} so‘m</b>`;
        }
      }

      if (chatId == null) return;
      const verdict = approved ? '✅ Tasdiqlandi' : '❌ Rad etildi';
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
  private mainKeyboard(role: Role) {
    if (role === 'driver') {
      return Markup.keyboard([
        ['💰 Balans'],
        ['📤 Pul yechish', '📥 Pul tashlash'],
        ['📋 So‘rovlar tarixi'],
        ['🚪 Chiqish'],
      ]).resize();
    }
    return Markup.keyboard([
      ['💰 Balans', '📥 Hisobni to‘ldirish'],
      ['📋 So‘rovlar tarixi'],
      ['🚪 Chiqish'],
    ]).resize();
  }

  private async displayName(linked: Linked): Promise<string> {
    if (linked.role === 'driver') {
      const d = await this.drivers.findOne({ where: { id: linked.id } });
      return d?.fullName ?? 'Haydovchi';
    }
    const c = await this.clients.findOne({ where: { id: linked.id } });
    return c?.firstName ?? 'Klient';
  }

  private async balanceOf(linked: Linked): Promise<string> {
    if (linked.role === 'driver') {
      const d = await this.drivers.findOne({ where: { id: linked.id } });
      return d?.balance ?? '0';
    }
    const c = await this.clients.findOne({ where: { id: linked.id } });
    return c?.balance ?? '0';
  }

  private fmt(v: number | string): string {
    return Number(v ?? 0).toLocaleString('uz');
  }
}
