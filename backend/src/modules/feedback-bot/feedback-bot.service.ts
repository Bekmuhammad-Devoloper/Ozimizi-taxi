import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Markup, Telegraf } from 'telegraf';
import { FeedbackService } from '../feedback/feedback.service';

interface ChatState {
  awaiting: 'message';
}

/**
 * @ozimizitaxi_feedback_bot (or whatever the FEEDBACK_BOT_TOKEN points
 * at) — anonymous-ish channel where users send complaints / suggestions.
 * Each non-command text message is saved as one Feedback row.
 */
@Injectable()
export class FeedbackBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedbackBotService.name);
  private bot: Telegraf | null = null;
  private readonly state = new Map<number, ChatState>();

  constructor(
    private readonly config: ConfigService,
    private readonly feedback: FeedbackService,
  ) {}

  async onModuleInit() {
    const token = this.config.get<string>('FEEDBACK_BOT_TOKEN') ?? '';
    if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
      this.logger.warn(
        'FEEDBACK_BOT_TOKEN missing or invalid — feedback bot disabled',
      );
      return;
    }
    this.bot = new Telegraf(token);
    this.registerHandlers(this.bot);
    this.bot
      .launch()
      .then(() => this.logger.log('Feedback bot launched'))
      .catch((e) => this.logger.error('Feedback bot launch failed', e));
  }

  async onModuleDestroy() {
    if (this.bot) this.bot.stop('SIGTERM');
  }

  private registerHandlers(bot: Telegraf) {
    bot.start(async (ctx) => this.handleStart(ctx));
    bot.command('yangi', async (ctx) => this.askForMessage(ctx));
    bot.command('cancel', async (ctx) => this.handleCancel(ctx));
    bot.hears('✍️ Yangi murojaat', async (ctx) => this.askForMessage(ctx));
    bot.hears('❌ Bekor qilish', async (ctx) => this.handleCancel(ctx));
    bot.on('text', async (ctx) => this.handleText(ctx));
    bot.catch((err) => this.logger.error('Feedback bot error', err as any));
  }

  private async handleStart(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await ctx.reply(
      'Salom! 👋\n\n' +
        'Bu bot orqali siz shikoyat yoki taklifingizni jo‘natishingiz mumkin.\n' +
        'Adminlarimiz har bir murojaatni ko‘rib chiqadi.\n\n' +
        'Boshlash uchun "✍️ Yangi murojaat" tugmasini bosing yoki to‘g‘ridan-to‘g‘ri matn yozing.',
      this.mainKeyboard(),
    );
    this.state.set(chatId, { awaiting: 'message' });
  }

  private async askForMessage(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    this.state.set(chatId, { awaiting: 'message' });
    await ctx.reply(
      'Murojaatingizni shu yerga yozing. Maksimum 4000 belgi.\n\n' +
        'Bekor qilish uchun /cancel yoki "❌ Bekor qilish" tugmasini bosing.',
      Markup.keyboard([['❌ Bekor qilish']]).resize(),
    );
  }

  private async handleCancel(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    this.state.delete(chatId);
    await ctx.reply('Bekor qilindi.', this.mainKeyboard());
  }

  private async handleText(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const text = ((ctx.message as any)?.text ?? '').trim();
    if (!text || text.startsWith('/')) return;
    // Skip menu button labels.
    if (text === '✍️ Yangi murojaat' || text === '❌ Bekor qilish') return;
    if (text.length < 3) {
      await ctx.reply('Murojaat juda qisqa. Iltimos, batafsil yozing.');
      return;
    }

    try {
      await this.feedback.create({
        telegramUserId: ctx.from?.id ?? 0,
        telegramUsername: ctx.from?.username ?? null,
        firstName: ctx.from?.first_name ?? null,
        text,
      });
      this.state.delete(chatId);
      await ctx.reply(
        '✅ Murojaatingiz qabul qilindi. Rahmat!\n\n' +
          'Yana murojaat yo‘llash uchun "✍️ Yangi murojaat" tugmasini bosing.',
        this.mainKeyboard(),
      );
    } catch (e: any) {
      this.logger.error('feedback save failed', e);
      await ctx.reply(
        '❌ Xato yuz berdi. Birozdan keyin urinib ko‘ring.',
        this.mainKeyboard(),
      );
    }
  }

  private mainKeyboard() {
    return Markup.keyboard([['✍️ Yangi murojaat']]).resize();
  }
}
