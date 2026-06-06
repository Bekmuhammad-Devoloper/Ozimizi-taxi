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
import { Admin } from '../admin/admin.entity';
import { PaymentService } from '../payment/payment.service';
import {
  PaymentEvents,
  PaymentEventPayload,
} from '../payment/payment.events';
import { WalletBotLinkService } from './wallet-bot-link.service';

/**
 * Wallet bot is the coordinator-only Telegram entry point. The full
 * workspace (purse, transfers, pending queue, history) lives inside a
 * Mini App. The chat itself is a thin shim:
 *   - /start <deep-link token>  → bind chat to admin row
 *   - 🌐 Koordinator paneli      → opens the Mini App
 *   - 🚪 Chiqish                 → unlinks the chat
 *
 * Drivers and clients have no interaction with this bot — phone share
 * and the older topup/withdraw FSM were removed when this became
 * coordinator-only.
 */
@Injectable()
export class WalletBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletBotService.name);
  private bot: Telegraf | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    private readonly payment: PaymentService,
    private readonly events: PaymentEvents,
    private readonly links: WalletBotLinkService,
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
    this.bot.launch({ dropPendingUpdates: true }).catch((e: any) => {
      this.logger.error(
        `Wallet bot launch failed: ${e?.message ?? e}`,
        e?.stack,
      );
    });
    this.logger.log('Wallet bot launching (long-poll)…');
  }

  async onModuleDestroy() {
    if (this.bot) this.bot.stop('SIGTERM');
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Handlers
  // ──────────────────────────────────────────────────────────────────────────
  private registerHandlers(bot: Telegraf) {
    bot.start(async (ctx) => this.handleStart(ctx));
    bot.command('menu', async (ctx) => this.showMenu(ctx));
    bot.command('chiqish', async (ctx) => this.handleLogout(ctx));
    bot.hears('🚪 Chiqish', async (ctx) => this.handleLogout(ctx));

    // Inline approve/reject callbacks remain wired up so the in-chat
    // notifications sent by notifyCoordsOfNew stay actionable even
    // outside the Mini App.
    bot.action(/^pr:(approve|reject):([0-9a-f-]+)$/i, async (ctx) =>
      this.handleDecisionCallback(ctx),
    );

    bot.catch((err) => this.logger.error('Wallet bot error', err as any));
  }

  private async handleStart(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // /start co<hex>  — coordinator deep link (issued from admin panel).
    const startText = ((ctx.message as any)?.text ?? '') as string;
    const payload = startText.split(/\s+/)[1]?.trim();
    if (payload && payload.startsWith('co')) {
      const adminId = this.links.redeem(payload);
      if (!adminId) {
        await ctx.reply(
          '❌ Bog‘lash havolasi muddati o‘tgan yoki noto‘g‘ri.\n' +
            'Koordinator panelidan yangi havola oling.',
          Markup.removeKeyboard(),
        );
        return;
      }
      const admin = await this.admins.findOne({ where: { id: adminId } });
      if (!admin) {
        await ctx.reply('Koordinator topilmadi.', Markup.removeKeyboard());
        return;
      }
      await this.linkCoordinator(adminId, chatId);
      await ctx.reply(
        `✅ Salom, <b>${admin.username}</b>!\n` +
          `Koordinator hisobingiz ulandi.\n\n` +
          `Quyidagi tugma orqali koordinator panelini oching.`,
        { parse_mode: 'HTML', ...this.mainKeyboard() },
      );
      return;
    }

    const linked = await this.findLinkedAdmin(chatId);
    if (linked) {
      await ctx.reply(
        `Salom, ${linked.username}! 👋\n` +
          `Koordinator panelini ochish uchun pastdagi tugmadan foydalaning.`,
        this.mainKeyboard(),
      );
      return;
    }
    // Not linked yet — still surface the Mini App button. The Mini App
    // handles the username/password login itself and binds the chat on
    // success.
    await ctx.reply(
      'Salom! 👋\nBu bot koordinatorlar uchun.\n\n' +
        'Quyidagi tugma orqali panelni oching va akkountingizga kiring — chat avtomatik ulanadi.',
      this.mainKeyboard(),
    );
  }

  private async showMenu(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const linked = await this.findLinkedAdmin(chatId);
    if (!linked) {
      await ctx.reply(
        'Bot faqat koordinatorlar uchun. Avval /start orqali ulaning.',
        Markup.removeKeyboard(),
      );
      return;
    }
    await ctx.reply('Menyu:', this.mainKeyboard());
  }

  private async handleLogout(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await this.admins
      .createQueryBuilder()
      .update(Admin)
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
    // Also clear any legacy driver/client links so old rows don't get
    // surprise notifications in this chat.
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
    await ctx.reply(
      'Hisob ajratildi. Qayta ulanish uchun panelidan havola oling.',
      Markup.removeKeyboard(),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Linking helpers
  // ──────────────────────────────────────────────────────────────────────────
  private async findLinkedAdmin(chatId: number) {
    return this.admins.findOne({
      where: { walletTelegramId: String(chatId) as any },
    });
  }

  private async linkCoordinator(adminId: string, chatId: number) {
    // Detach this chat from any prior admin / driver / client link.
    await this.admins
      .createQueryBuilder()
      .update(Admin)
      .set({ walletTelegramId: null as any })
      .where('wallet_telegram_id = :cid', { cid: String(chatId) })
      .execute();
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
    await this.admins.update(adminId, {
      walletTelegramId: String(chatId) as any,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Inline approve / reject of pending requests (coord-only)
  // ──────────────────────────────────────────────────────────────────────────
  private async handleDecisionCallback(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const admin = await this.findLinkedAdmin(chatId);
    if (!admin || admin.role !== 'coordinator') {
      await (ctx as any).answerCbQuery?.('Faqat koordinator amal qila oladi');
      return;
    }
    const match = (ctx as any).match as RegExpExecArray;
    const action = match[1];
    const id = match[2];
    try {
      if (action === 'approve') {
        await this.payment.approve(id, admin.id);
      } else {
        await this.payment.reject(id, admin.id);
      }
      await (ctx as any).answerCbQuery?.(
        action === 'approve' ? '✅ Tasdiqlandi' : '❌ Rad etildi',
      );
      const original = (ctx.callbackQuery as any)?.message?.text ?? '';
      const verdict = action === 'approve' ? '✅ TASDIQLANDI' : '❌ RAD ETILDI';
      try {
        await (ctx as any).editMessageText(
          `${original}\n\n<b>${verdict}</b>`,
          { parse_mode: 'HTML' },
        );
      } catch {
        /* ignore — message may no longer be editable */
      }
    } catch (e: any) {
      const msg = e?.response?.message ?? e?.message ?? 'Xato';
      await (ctx as any).answerCbQuery?.(`❌ ${msg}`, { show_alert: true });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Payment-event subscriptions
  // ──────────────────────────────────────────────────────────────────────────
  private subscribeToPaymentEvents() {
    this.events.on('payment.submitted', (p) => this.notifyCoordsOfNew(p));
    this.events.on('payment.approved', (p) => this.notifyDecision(p, true));
    this.events.on('payment.rejected', (p) => this.notifyDecision(p, false));
  }

  /**
   * Fan-out a fresh inline-button card to every linked coordinator when
   * a new bot-initiated pending request arrives. With wallet bot now
   * coordinator-only no driver/client submissions reach here in normal
   * use; the hook is kept so future bot flows can re-enable it without
   * touching the wallet bot.
   */
  private async notifyCoordsOfNew(payload: PaymentEventPayload) {
    try {
      if (!this.bot) return;
      if (
        !payload.request.requestedByDriver &&
        !payload.request.requestedByClient
      ) {
        return;
      }
      const coords = await this.admins
        .createQueryBuilder('a')
        .where("a.role = 'coordinator'")
        .andWhere('a.wallet_telegram_id IS NOT NULL')
        .getMany();
      if (!coords.length) return;
      const enriched = {
        ...payload.request,
        driver: payload.request.driverId
          ? await this.drivers.findOne({
              where: { id: payload.request.driverId },
            })
          : null,
        client: payload.request.clientId
          ? await this.clients.findOne({
              where: { id: payload.request.clientId },
            })
          : null,
      } as any;
      for (const c of coords) {
        const chatId = Number(c.walletTelegramId);
        if (!Number.isFinite(chatId)) continue;
        try {
          await this.bot.telegram.sendMessage(
            chatId,
            this.pendingCardText(enriched),
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    '✅ Tasdiqlash',
                    `pr:approve:${payload.request.id}`,
                  ),
                  Markup.button.callback(
                    '❌ Rad etish',
                    `pr:reject:${payload.request.id}`,
                  ),
                ],
              ]),
            },
          );
        } catch (e) {
          this.logger.warn(
            `notifyCoords failed for ${c.id}: ${(e as any)?.message ?? e}`,
          );
        }
      }
    } catch (e) {
      this.logger.error('notifyCoordsOfNew failed', e as any);
    }
  }

  /**
   * Legacy driver/client decision DMs. Kept in case the chat is still
   * linked to a driver row from a previous wallet-bot version — silently
   * no-ops otherwise. Coordinators don't need these (they already saw
   * the request via notifyCoordsOfNew or the panel).
   */
  private async notifyDecision(
    payload: PaymentEventPayload,
    approved: boolean,
  ) {
    try {
      if (!this.bot) return;
      let chatId: number | null = null;
      let balanceLine = '';

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
      const amount = Number(payload.request.amount);
      const sign = amount >= 0 ? '+' : '';
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
  private pendingCardText(r: any): string {
    const amt = Number(r.amount);
    const sign = amt >= 0 ? '+' : '';
    const who = r.driverId
      ? `🚗 ${r.driver?.fullName ?? 'Haydovchi'} (${r.driver?.phone ?? ''})`
      : `👤 ${r.client?.firstName ?? 'Klient'} (${r.client?.phonePrimary ?? ''})`;
    const date = new Date(r.createdAt).toLocaleString('uz', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      `<b>Yangi so‘rov</b>\n\n` +
      `${who}\n` +
      `Summa: <b>${sign}${this.fmt(amt)} so‘m</b>\n` +
      (r.note ? `Izoh: ${r.note}\n` : '') +
      `Vaqt: ${date}`
    );
  }

  private mainKeyboard() {
    const webAppUrl =
      this.config.get<string>('COORDINATOR_WEBAPP_URL') ??
      'https://ozimizi-taxi.yuksalish.dev/admin/tg';
    return Markup.keyboard([
      [Markup.button.webApp('🌐 Koordinator paneli', webAppUrl)],
      ['🚪 Chiqish'],
    ]).resize();
  }

  private fmt(v: number | string): string {
    return Number(v ?? 0).toLocaleString('uz');
  }
}
