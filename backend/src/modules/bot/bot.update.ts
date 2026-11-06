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
import { DataSource } from 'typeorm';
import { installBotLang, rememberLabels, setBotLang } from './bot-lang';
import * as QRCode from 'qrcode';
import { ClientService } from '../client/client.service';
import { OrderService } from '../order/order.service';
import { DriverApplicationDraft, RegStep, SessionStore } from './bot.scenes';
import { OrderEvents, DriverSummary } from '../order/order.events';
import { SettingsService } from '../settings/settings.service';
import { SettingKey } from '../settings/site-setting.entity';
import { cacheTelegramAvatar } from './telegram-avatar';
import { saveTelegramFile } from './telegram-file';
import { PromoService } from '../promo/promo.service';
import { ReferralService } from '../referral/referral.service';
import { DriverApplicationService } from '../driver-application/driver-application.service';
import { DriverApplicationEvents } from '../driver-application/driver-application.events';
import { DriverApplicationStatus } from '../driver-application/driver-application.entity';
import { BonusService } from '../bonus/bonus.service';
import { BonusEvents } from '../bonus/bonus.events';
import { ChatService } from '../chat/chat.service';
import { ChatEvents } from '../chat/chat.events';
import { AnnouncementService } from '../announcement/announcement.service';
import { AnnouncementEvents } from '../announcement/announcement.events';
import { ReceiptService } from '../receipt/receipt.service';
import { ClientAuthEvents } from '../client-api/client-auth.events';
import { FeedbackService } from '../feedback/feedback.service';
import { FeedbackEvents } from '../feedback/feedback.events';
import { RealtimeService } from '../realtime/realtime.service';
import { FoodEvents } from '../food/food.events';
import { DEFAULT_DRIVER_CONTRACT } from '../settings/driver-contract.default';

const PHONE_REGEX = /^\+?\d{9,15}$/;

/** Telegram Markdown (v1) escaping — minimal: backticks, underscore, asterisk. */
function escapeMd(s: string): string {
  return (s ?? '').replace(/([_*`[\]])/g, '\\$1');
}

function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** "oQ" → "Oq" — drivers type colours in any case. */
function capitalize(s?: string | null): string {
  const t = (s ?? '').trim();
  return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : '';
}

/** How a promo discount is spent, for the passenger. */
function promoRule(
  maxPercentPerRide?: string | number | null,
  maxAmountPerRide?: string | number | null,
): string {
  const pct = Number(maxPercentPerRide ?? 0);
  const amt = Number(maxAmountPerRide ?? 0);
  const parts = [
    pct > 0 ? `narxning ${pct}% igacha` : null,
    amt > 0 ? `ko‘pi bilan ${fmtMoney(amt)} so‘m` : null,
  ].filter(Boolean);
  return parts.length
    ? `Har safarda ${parts.join(', ')} ishlatiladi, qolgani keyingi safarlarga o‘tadi.`
    : 'Istalgan safarda “Bonusdan to‘lash” orqali ishlatishingiz mumkin.';
}

const DIVIDER = '┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈';

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return '-';
  return Number(v).toLocaleString('uz');
}

const BTN = {
  order: '🚕 Taksi buyurtma berish',
  food: '🍔 Ovqat buyurtma berish',
  promo: '🎟 Promo kod',
  invite: '🎁 Do‘stlarni taklif qilish',
  instagram: '📸 Instagram',
  bonus: '💰 Bonus',
  becomeDriver: '🚖 Haydovchi bo‘lish',
  contactAdmin: '👨‍💼 Admin bilan aloqa',
  myOrders: '🧾 Buyurtmalarim',
  settings: '⚙️ Sozlamalar',
  language: '🌐 Til / Тил',
  cancel: '❌ Bekor qilish',
};
type BtnKey = keyof typeof BTN;

// Labels from the previous menu — users keep the old keyboard until their
// next /start, so these must still work.
const LEGACY_BTN: Record<string, BtnKey> = {
  '🚖 Taxi chaqirish': 'order',
  '🚕 Taxi chaqirish': 'order',
  '🍔 Ovqat buyurtma': 'food',
  '📷 Instagram sahifasi': 'instagram',
  '⭐ Bonus': 'bonus',
  '🚕 Haydovchi bo‘lish': 'becomeDriver',
  '💬 Admin bilan aloqa': 'contactAdmin',
  '📋 Buyurtmalarim': 'myOrders',
};

/** Label without the leading emoji — used when a premium icon replaces it. */
const plainLabel = (k: BtnKey) => BTN[k].replace(/^\S+\s+/, '');

function btnKey(text: string): BtnKey | null {
  for (const k of Object.keys(BTN) as BtnKey[]) {
    if (BTN[k] === text || plainLabel(k) === text) return k;
  }
  return LEGACY_BTN[text] ?? null;
}

/**
 * Premium (custom emoji) icons for main-menu buttons, keyed by button and
 * loaded from site settings (`btn_icon_<key>`). Telegram only renders them
 * when the bot owner has Telegram Premium (Bot API 9.4).
 */
const BTN_ICON_SETTING: Partial<Record<BtnKey, SettingKey>> = {
  order: 'btn_icon_order',
  promo: 'btn_icon_promo',
  invite: 'btn_icon_invite',
  instagram: 'btn_icon_instagram',
  bonus: 'btn_icon_bonus',
  becomeDriver: 'btn_icon_become_driver',
  contactAdmin: 'btn_icon_contact_admin',
  myOrders: 'btn_icon_my_orders',
  settings: 'btn_icon_settings',
};
let btnIcons: Partial<Record<BtnKey, string>> = {};

function menuBtn(k: BtnKey) {
  const icon = btnIcons[k];
  // The typings predate `icon_custom_emoji_id`; Telegraf sends the raw object.
  return (icon
    ? { text: plainLabel(k), icon_custom_emoji_id: icon }
    : { text: BTN[k] }) as unknown as string;
}

const mainMenu = () =>
  Markup.keyboard([
    [menuBtn('order')],
    [menuBtn('food')],
    [menuBtn('instagram'), menuBtn('contactAdmin')],
    [menuBtn('becomeDriver'), menuBtn('settings')],
  ])
    .resize()
    .persistent();

/** "Sozlamalar": promo code, invite friends, order history, bonus. */
const settingsMenu = () =>
  Markup.keyboard([
    [menuBtn('promo'), menuBtn('invite')],
    [menuBtn('myOrders'), menuBtn('bonus')],
    [menuBtn('language')],
    ['⬅️ Asosiy menyu'],
  ])
    .resize()
    .persistent();

const DA_BACK = '⬅️ Asosiy menyu';
const DA_SKIP = '⏭ O‘tkazib yuborish';
const DA_YES = '✅ Ha';
const DA_NO = '❌ Yo‘q';

const backKb = () => Markup.keyboard([[DA_BACK]]).resize();

/** Photo steps of the driver questionnaire: field, prompt, next step. */
const DA_PHOTO_STEPS = {
  da_license_photo: {
    field: 'licensePhotoUrl',
    next: 'da_tech_passport_photo',
  },
  da_tech_passport_photo: { field: 'techPassportPhotoUrl', next: 'da_car_photo' },
  da_car_photo: { field: 'carPhotoUrl', next: 'da_selfie_photo' },
  da_selfie_photo: { field: 'selfiePhotoUrl', next: 'da_confirm' },
} as const;

const DA_PROMPTS: Partial<Record<RegStep, string>> = {
  da_full_name: '👤 *To‘liq ismingiz* (familiya, ism, otasining ismi):',
  da_phone:
    '📞 *Telefon raqamingiz.*\nPastdagi tugmani bosing yoki raqamni yozing (masalan, +998901234567):',
  da_car_model: '🚗 *Mashina rusumi* (masalan, Chevrolet Cobalt):',
  da_car_color: '🎨 *Mashina rangi:*',
  da_car_plate: '🔢 *Davlat raqami* (masalan, 01 A 123 BC):',
  da_car_year: '📅 *Ishlab chiqarilgan yili* (masalan, 2021):',
  da_self_employed:
    '🧾 *Yo‘lovchi tashish bo‘yicha o‘z-o‘zini band qilgan shaxs sifatida ro‘yxatdan o‘tganmisiz?*\n' +
    '(Soliq orqali rasmiylashtirilgan bo‘lsa — “Ha”)',
  da_license_photo:
    '🪪 *Haydovchilik guvohnomasi (prava)* rasmini yuboring — old tomoni:',
  da_tech_passport_photo: '📄 *Texnik pasport* rasmini yuboring:',
  da_car_photo:
    '🚘 *Mashinaning rasmi* — davlat raqami ko‘rinib tursin:',
  da_selfie_photo: '🤳 *O‘zingizning rasmingiz* (selfi) — yuzingiz aniq ko‘rinsin:',
};

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
    private readonly settings: SettingsService,
    private readonly promo: PromoService,
    private readonly referral: ReferralService,
    private readonly applications: DriverApplicationService,
    private readonly applicationEvents: DriverApplicationEvents,
    private readonly bonus: BonusService,
    private readonly bonusEvents: BonusEvents,
    private readonly chat: ChatService,
    private readonly chatEvents: ChatEvents,
    private readonly announcements: AnnouncementService,
    private readonly announcementEvents: AnnouncementEvents,
    private readonly receipts: ReceiptService,
    private readonly clientAuth: ClientAuthEvents,
    private readonly feedback: FeedbackService,
    private readonly feedbackEvents: FeedbackEvents,
    private readonly realtime: RealtimeService,
    private readonly foodEvents: FoodEvents,
    private readonly ds: DataSource,
  ) {}

  private botUsername: string | null = null;

  onModuleInit() {
    this.startPollingWatchdog();
    void this.loadButtonIcons();
    void this.loadBotLangs().catch((e) => this.logger.warn(`bot languages: ${(e as Error).message}`));
    void this.bot.telegram
      .getMe()
      .then((m) => (this.botUsername = m.username ?? null))
      .catch(() => undefined);

    // Driver answered a "pay from bonus" request — tell the passenger.
    this.bonusEvents.onDecided(({ payment, order, approved }) => {
      this.notifyClient(order.clientId, async (chatId) => {
        const cash =
          Number(order.price ?? 0) -
          Number(order.discount ?? 0) -
          Number(order.bonusUsed ?? 0);
        const text = approved
          ? '✅ <b>Haydovchi bonusni tasdiqladi</b>\n' +
            DIVIDER +
            `\n💰 Bonusdan to‘landi: <b>${fmtMoney(payment.amount)}</b> so‘m\n` +
            `💵 Naqd to‘laysiz: <b>${fmtMoney(Math.max(0, cash))}</b> so‘m`
          : '❌ <b>Haydovchi bonusdan to‘lashni rad etdi</b>\n' +
            `Safar uchun naqd to‘laysiz: <b>${fmtMoney(Math.max(0, cash))}</b> so‘m`;
        if (approved) {
          await this.sendReceiptOrText(chatId, order.id, text + '\n\n🧾 Yangilangan chek:', { parse_mode: 'HTML' });
        } else {
          await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
        }
      });
    });
    // Client app login: the one-time code goes to the passenger's chat.
    this.clientAuth.setSender(async ({ telegramId, code, firstName }) => {
      await this.bot.telegram.sendMessage(
        Number(telegramId),
        `🔐 <b>Moviy Taxi ilovasiga kirish kodi:</b>\n\n<code>${code}</code>\n\n` +
          `${escapeHtml(firstName)}, bu kodni ilovadagi maydonga kiriting. Kod 5 daqiqa amal qiladi. ` +
          'Agar siz so‘ramagan bo‘lsangiz, bu xabarni e’tiborsiz qoldiring.',
        { parse_mode: 'HTML' },
      );
    });
    // Pick up icon changes made in the admin panel without a restart.
    setInterval(() => void this.loadButtonIcons(), 60_000).unref();

    // Driver wrote to the passenger from the app.
    this.chatEvents.onDriverMessage(({ order, message, driverName }) => {
      this.notifyClient(order.clientId, async (chatId) => {
        await this.bot.telegram.sendMessage(
          chatId,
          `💬 <b>${escapeHtml(driverName)}:</b> ${escapeHtml(message.text)}\n` +
            '<i>Javob yozish uchun shu chatga yozing</i>',
          { parse_mode: 'HTML' },
        );
      });
    });

    // Admin broadcast to clients: fan out through the bot, ~25 msgs/s.
    this.announcementEvents.onToClients((a) => {
      void (async () => {
        const ids = await this.clients.allTelegramIds();
        let sent = 0;
        const html = `📢 <b>${escapeHtml(a.title)}</b>\n\n${escapeHtml(a.text)}`;
        for (const id of ids) {
          try {
            await this.bot.telegram.sendMessage(Number(id), html, { parse_mode: 'HTML' });
            sent++;
          } catch {
            /* blocked the bot / deleted account */
          }
          await new Promise((r) => setTimeout(r, 40));
        }
        await this.announcements.markClientsSent(a.id, sent);
      })().catch((e) => this.logger.warn(`announcement fan-out failed: ${(e as Error).message}`));
    });

    this.applicationEvents.onToApplicant(
      ({ telegramId, applicationId, html, allowReply, attachApp }) => {
        void this.bot.telegram
          .sendMessage(Number(telegramId), html, {
            parse_mode: 'HTML',
            ...(allowReply
              ? Markup.inlineKeyboard([
                  [
                    Markup.button.callback(
                      '✍️ Javob yozish',
                      `dachat:${applicationId}`,
                    ),
                  ],
                ])
              : {}),
          })
          .then(async () => {
            // Approved driver: hand over the newest app right away.
            if (attachApp) await this.sendAppDownload(Number(telegramId), attachApp);
          })
          .catch((e) =>
            this.logger.warn(
              `Applicant message to ${telegramId} failed: ${(e as Error).message}`,
            ),
          );
      },
    );

    // Referral bonus landed after the invited client's first ride — tell both.
    this.orderEvents.onReferralPaid(
      ({ clientId, clientName, clientBonus, referrerId, referrerBonus }) => {
        if (clientBonus > 0) {
          this.notifyClient(clientId, async (chatId) => {
            await this.bot.telegram.sendMessage(
              chatId,
              `🎁 <b>Birinchi safar uchun bonus!</b>\nBalansingizga <b>+${fmtMoney(clientBonus)}</b> so‘m qo‘shildi. ` +
                'Keyingi safarda “💰 Bonusdan to‘lash” orqali ishlatishingiz mumkin.',
              { parse_mode: 'HTML' },
            );
          });
        }
        if (referrerBonus > 0) {
          this.notifyClient(referrerId, async (chatId) => {
            await this.bot.telegram.sendMessage(
              chatId,
              `🎁 <b>Referral bonus!</b>\nTaklif qilgan do‘stingiz <b>${escapeHtml(clientName)}</b> birinchi safarini yakunladi — ` +
                `balansingizga <b>+${fmtMoney(referrerBonus)}</b> so‘m qo‘shildi.`,
              { parse_mode: 'HTML' },
            );
          });
        }
      },
    );

    // Food order status → message to the client in the bot.
    this.foodEvents.onStatus(({ order, kitchenName, courier }) => {
      const n = `#${order.number}`;
      const k = escapeHtml(kitchenName || 'Oshxona');
      const texts: Record<string, string> = {
        NEW: `🍽 <b>Buyurtma ${n} qabul qilindi</b>
${k} buyurtmani ko‘rib chiqmoqda.
Jami: <b>${fmtMoney(order.total)}</b> so‘m (naqd, kuryerga).`,
        COOKING: `👨‍🍳 <b>${k} buyurtma ${n} ni tayyorlamoqda</b>${order.prepMinutes ? `
Taxminan ${order.prepMinutes} daqiqa.` : ''}`,
        READY: `✅ <b>Buyurtma ${n} tayyor</b> — kuryer olib ketadi.`,
        PICKED_UP: `🛵 <b>Kuryer yo‘lda</b> — buyurtma ${n}${courier ? `
${escapeHtml(courier.fullName)} · ${escapeHtml(courier.phone)}${courier.carPlate ? ` · ${escapeHtml(courier.carPlate)}` : ''}` : ''}
To‘lov: <b>${fmtMoney(order.total)}</b> so‘m naqd.`,
        DELIVERED: `🎉 <b>Buyurtma ${n} yetkazildi.</b> Yoqimli ishtaha!`,
        REJECTED: `😔 <b>${k} buyurtma ${n} ni qabul qila olmadi.</b>${order.rejectReason ? `
Sabab: ${escapeHtml(order.rejectReason)}` : ''}`,
        CANCELLED: `❌ <b>Buyurtma ${n} bekor qilindi.</b>`,
      };
      // Courier assignment does not change the status — announce it separately.
      let text = texts[order.status];
      if (order.status !== 'PICKED_UP' && courier && order.courierAssignedAt &&
          Date.now() - new Date(order.courierAssignedAt).getTime() < 5000 && !order.pickedUpAt) {
        text = `🛵 <b>Kuryer biriktirildi</b> — buyurtma ${n}
${escapeHtml(courier.fullName)} · ${escapeHtml(courier.phone)}`;
      }
      if (!text) return;
      this.notifyClient(order.clientId, async (chatId) => {
        await this.bot.telegram.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.webApp('📦 Buyurtmani kuzatish', this.foodUrl(`/food/orders/${order.id}`))]]),
        });
      });
    });

    // Admin answered an inbox message from the panel — relay it to the user.
    this.feedbackEvents.setSender(async ({ telegramUserId, text }) => {
      await this.bot.telegram.sendMessage(
        Number(telegramUserId),
        '👨‍💼 <b>Admin javobi:</b>\n' + escapeHtml(text),
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✍️ Javob yozish', 'fb_reply')],
          ]),
        },
      );
    });

    this.orderEvents.on(
      'order.accepted',
      ({ order, driver, etaMinutes }) => {
        if (!driver) return;
        this.notifyClient(order.clientId, async (chatId) => {
          await this.sendDriverInfoMessage(chatId, order.id, driver, {
            header: '✅ <b>Haydovchi topildi!</b>',
            subtitle: 'Buyurtmangiz qabul qilindi.',
            withPhoto: true,
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
          header: '🚖 <b>Haydovchi yo‘lda</b>',
          subtitle: 'Sizning oldingizga kelmoqda.',
          etaMinutes,
          showCancel: true,
        });
      });
    });

    this.orderEvents.on('order.arrived', ({ order, driver }) => {
      if (!driver) return;
      this.notifyClient(order.clientId, async (chatId) => {
        // Cancelling now costs the client the admin-set penalty — warn first.
        const penalty = Number((await this.settings.get('cancel_penalty_amount')) || '0');
        await this.sendDriverInfoMessage(chatId, order.id, driver, {
          header: '📍 <b>Haydovchi yetib keldi!</b>',
          subtitle:
            'Sizni kutmoqda — chiqishingiz mumkin.' +
            (penalty > 0
              ? `\n⚠️ Endi bekor qilsangiz bonus balansingizdan ${fmtMoney(penalty)} so‘m jarima yechiladi.`
              : ''),
          showCancel: true,
        });
      });
    });

    this.orderEvents.on('order.in_progress', ({ order }) => {
      this.notifyClient(order.clientId, async (chatId) => {
        await this.bot.telegram.sendMessage(
          chatId,
          '🛣 <b>Safar boshlandi</b>\n' +
            'Yaxshi yo‘l tilaymiz! Xavfsizlik kamarini taqishni unutmang 🙂',
          { parse_mode: 'HTML' },
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
        const discount = Number(order.discount ?? 0);
        const lines = [
          '🏁 <b>Safar yakunlandi</b>',
          DIVIDER,
          `📏 <b>Masofa:</b> ${order.distanceKm ?? '—'} km`,
        ];
        if (duration != null) lines.push(`⏱ <b>Vaqt:</b> ${duration} daqiqa`);
        if (Number(order.waitingFee ?? 0) > 0) {
          lines.push(
            `⏳ <b>Kutish:</b> ${order.waitingMinutes} daqiqa — +${fmtMoney(order.waitingFee)} so‘m`,
          );
        }
        lines.push(`💰 <b>Narx:</b> ${fmtMoney(order.price)} so‘m`);
        if (discount > 0) {
          lines.push(`🎟 <b>Promo chegirma:</b> −${fmtMoney(discount)} so‘m`);
          const left = order.clientId ? await this.promo.pendingFor(order.clientId) : null;
          if (left) {
            lines.push(`🎟 Promo qoldig‘i: ${fmtMoney(left.remaining)} so‘m (keyingi safarlarga)`);
          }
        }
        lines.push(
          DIVIDER,
          `💵 <b>To‘lanadi: ${fmtMoney(Number(order.price ?? 0) - discount)} so‘m</b>`,
          '',
          'Moviy Taxi’dan foydalanganingiz uchun rahmat! 💙',
        );
        // Offer paying part of the fare from bonus (driver must confirm).
        const client = await this.clients.findById(order.clientId);
        const bonusBal = Number(client?.balance ?? 0);
        const cashDue =
          Number(order.price ?? 0) - discount - Number(order.bonusUsed ?? 0);
        const offerBonus = bonusBal > 0 && cashDue > 0;
        if (offerBonus) {
          lines.push('', `⭐ Bonus balansingiz: <b>${fmtMoney(bonusBal)}</b> so‘m`);
        }
        await this.sendReceiptOrText(chatId, order.id, lines.join('\n'), {
          parse_mode: 'HTML',
          ...(offerBonus
            ? Markup.inlineKeyboard([
                [Markup.button.callback('💰 Bonusdan to‘lash', `bonus:${order.id}`)],
              ])
            : {}),
        });
      });
    });

    // A driver's phone stopped answering offers → tell him on Telegram (the app may be dead).
    this.orderEvents.onDriverUnreachable(({ driverId, missed }) => {
      void (async () => {
        const app = await this.applications.latestForDriver(driverId);
        if (!app?.telegramId) return;
        this.applicationEvents.emitToApplicant({
          telegramId: app.telegramId,
          applicationId: app.id,
          html:
            '<b>📵 Siz liniyadan chiqarildingiz</b>\n' +
            `Telefoningiz ketma-ket ${missed} ta buyurtma signalini qabul qilmadi — mijozlar kutib qolmasligi uchun liniyadan chiqarildingiz.\n\n` +
            '<b>Nima qilish kerak:</b>\n' +
            '1. Moviy Taxi ilovasini oching va qayta liniyaga chiqing.\n' +
            '2. Bildirishnomalarga ruxsat bering.\n' +
            '3. Sozlamalar → Batareya: shu ilova uchun “Cheklovsiz” qiling.\n' +
            '4. Xiaomi / Redmi / Poco: “Avtozapusk”ni yoqing.\n' +
            '5. Ilovani eng oxirgi versiyaga yangilang.',
          allowReply: false,
        });
      })().catch((e) => this.logger.warn(`unreachable notice failed: ${(e as Error).message}`));
    });

    this.orderEvents.on('order.requeued', ({ order }) => {
      this.notifyClient(order.clientId, async (chatId) => {
        await this.bot.telegram.sendMessage(
          chatId,
          '🔄 <b>Haydovchi buyurtmani qaytardi</b>\n' +
            'Buyurtmangiz bekor qilinmadi — boshqa haydovchi qidirilmoqda. Topilishi bilan xabar beramiz.',
          { parse_mode: 'HTML' },
        );
      });
    });

    this.orderEvents.on('order.cancelled', ({ order }) => {
      this.notifyClient(order.clientId, async (chatId) => {
        const penalty = Number(order.cancelPenalty ?? 0);
        await this.bot.telegram.sendMessage(
          chatId,
          '❌ <b>Buyurtma bekor qilindi</b>\n' +
            (penalty > 0
              ? `⚠️ Haydovchi yetib kelgan edi — bonus balansingizdan <b>${fmtMoney(penalty)}</b> so‘m jarima yechildi.\n`
              : '') +
            `Yangi taksi kerak bo‘lsa, “${BTN.order}” tugmasini bosing.`,
          { parse_mode: 'HTML' },
        );
      });
    });
  }

  private async loadButtonIcons() {
    try {
      const all = await this.settings.getAll();
      const next: Partial<Record<BtnKey, string>> = {};
      for (const [k, setting] of Object.entries(BTN_ICON_SETTING)) {
        const id = (all[setting!] ?? '').trim();
        if (/^\d+$/.test(id)) next[k as BtnKey] = id;
      }
      btnIcons = next;
    } catch (e) {
      this.logger.warn(`loadButtonIcons failed: ${(e as Error).message}`);
    }
  }

  /**
   * Unified "driver info" message used for ACCEPTED / ON_THE_WAY / ARRIVED:
   * car photo + caption (driver, car, plate, phone, ETA) and an optional
   * "Bekor qilish" button. The phone number in the text is tappable in
   * Telegram, so no separate contact card is sent.
   */
  private async sendDriverInfoMessage(
    chatId: number,
    orderId: string,
    driver: DriverSummary,
    opts: {
      header: string;
      subtitle?: string;
      etaMinutes?: number;
      showCancel: boolean;
      /** Car photo only on the first message — the rest are text. */
      withPhoto?: boolean;
    },
  ) {
    const lines: string[] = [opts.header];
    if (opts.subtitle) lines.push(escapeHtml(opts.subtitle));
    lines.push(DIVIDER);
    lines.push(`👤 <b>Haydovchi:</b> ${escapeHtml(driver.fullName)}`);
    const car = [driver.carModel, capitalize(driver.carColor)]
      .filter(Boolean)
      .join(', ');
    if (car) lines.push(`🚗 <b>Mashina:</b> ${escapeHtml(car)}`);
    if (driver.carPlate) {
      lines.push(`🔢 <b>Raqam:</b> <code>${escapeHtml(driver.carPlate)}</code>`);
    }
    lines.push(`📞 <b>Telefon:</b> ${escapeHtml(driver.phone)}`);
    lines.push('💬 Haydovchiga xabar yozish uchun shu chatga yozing');
    if (opts.etaMinutes != null) {
      lines.push(DIVIDER);
      lines.push(`⏱ Taxminan <b>${opts.etaMinutes} daqiqada</b> yetib keladi`);
    }
    const caption = lines.join('\n');

    const keyboard = opts.showCancel
      ? Markup.inlineKeyboard([
          [Markup.button.callback('❌ Bekor qilish', `cancel:${orderId}`)],
        ])
      : undefined;

    // 1. Send car photo (or text) with full caption
    const photoSource = opts.withPhoto ? this.resolveLocalPhoto(driver.carPhotoUrl) : null;
    let sent = false;
    if (photoSource) {
      try {
        await this.bot.telegram.sendPhoto(
          chatId,
          Input.fromLocalFile(photoSource),
          {
            caption,
            parse_mode: 'HTML',
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
        parse_mode: 'HTML',
        ...(keyboard ?? {}),
      });
    }
  }

  /** Receipt PNG with the summary as caption; falls back to plain text. */
  private async sendReceiptOrText(chatId: number, orderId: string, text: string, extra: any) {
    try {
      const { png } = await this.receipts.render(orderId);
      const caption = text.length > 1000 ? text.slice(0, 990) + '…' : text;
      await this.bot.telegram.sendPhoto(chatId, Input.fromBuffer(png, 'chek.png'), {
        caption,
        ...extra,
      });
      return;
    } catch (e) {
      this.logger.warn(`Receipt failed for ${orderId}: ${(e as Error).message}`);
    }
    await this.bot.telegram.sendMessage(chatId, text, extra);
  }

  /** Map /uploads/abc.jpg -> absolute local path. Returns null if missing. */
  private resolveLocalPhoto(url?: string | null): string | null {
    if (!url || !url.startsWith('/uploads/')) return null;
    const rel = url.replace(/^\/+/, '');
    const abs = join(process.cwd(), rel);
    return fs.existsSync(abs) ? abs : null;
  }

  private async notifyClient(
    clientId: string | null,
    cb: (chatId: number) => Promise<void>,
  ) {
    // Street pickups / kitchen-typed orders have no client in the system.
    if (!clientId) return;
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
      if (existing.isBlocked) {
        await ctx.reply('⛔ <b>Hisobingiz bloklangan.</b>\nSabab: ' + escapeHtml(existing.blockedReason || 'ko‘rsatilmagan') + '\nAdmin bilan bog‘laning.', { parse_mode: 'HTML', ...Markup.removeKeyboard() });
        return;
      }
      this.session.set(from.id, { step: 'registered' });
      // Refresh cached avatar in the background when older than TTL.
      if (this.clients.shouldRefreshAvatar(existing)) {
        void cacheTelegramAvatar(this.bot, from.id, existing.id, this.clients);
      }
      await ctx.reply(`Xush kelibsiz, ${existing.firstName}!`, mainMenu());
      return;
    }
    // /start RE1234FG → grab the deep-link payload as a referral code
    const text = ((ctx.message as any)?.text ?? '') as string;
    const parts = text.split(/\s+/);
    const refCode = parts.length > 1 ? parts[1].trim() : null;
    this.session.set(from.id, {
      step: 'awaiting_primary_phone',
      firstName: from.first_name,
      refCode,
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

    if (session.step === 'da_phone') {
      await this.daAdvance(ctx, { phone: phone }, 'da_car_model');
      return;
    }

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
    if (client.isBlocked) {
      await ctx.reply('⛔ <b>Hisobingiz bloklangan.</b>\nSabab: ' + escapeHtml(client.blockedReason || 'ko‘rsatilmagan') + '\nAdmin bilan bog‘laning.', { parse_mode: 'HTML', ...mainMenu() });
      return;
    }
    // Be forgiving: any location from a registered client = pickup intent.
    try {
      const created = await this.orders.create({
        clientId: client.id,
        pickupLat: loc.latitude,
        pickupLng: loc.longitude,
      });
      this.session.set(from.id, { step: 'registered' });
      await ctx.reply('✅ Buyurtma qabul qilindi.', mainMenu());
      await ctx.reply(
        '🔎 <b>Haydovchi qidirilmoqda…</b>\n' +
          'Buyurtmangiz yaqin atrofdagi haydovchilarga yuborildi.\n' +
          '\n' +
          '⏳ Haydovchi topilishi bilan shu yerda xabar beramiz.',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Buyurtmani bekor qilish', `cancel:${created.id}`)],
          ]),
        },
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

    // This handler is registered before the @Command ones and would swallow
    // them, so route commands explicitly.
    const command = text.split(/[\s@]/)[0];
    if (command === '/emojiid') return this.onEmojiId(ctx);
    if (command === '/help') return this.onHelp(ctx);
    if (command === '/app') return this.onAppCommand(ctx);

    if (session.step === 'awaiting_emoji_ids') {
      const entities = ((ctx.message as any)?.entities ?? []) as {
        type: string;
        offset: number;
        length: number;
        custom_emoji_id?: string;
      }[];
      const found = entities.filter((e) => e.type === 'custom_emoji');
      if (found.length) {
        const lines = found.map(
          (e) =>
            `${text.substr(e.offset, e.length)}  <code>${e.custom_emoji_id}</code>`,
        );
        await ctx.reply(
          '🆔 <b>Premium emoji ID lari:</b>\n\n' +
            lines.join('\n') +
            '\n\nID ni nusxalab, admin panel → Sozlamalar → “Bot tugmalari ikonkalari” ga qo‘ying.',
          { parse_mode: 'HTML' },
        );
        return;
      }
      if (!btnKey(text) && text !== DA_BACK) {
        await ctx.reply(
          'Bu xabarda premium emoji topilmadi. Premium emoji yuboring yoki “⬅️ Asosiy menyu”ni bosing.',
        );
        return;
      }
    }

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
      const { client, isNew, referrer } = await this.clients.upsert({
        telegramId: from.id,
        firstName: from.first_name ?? session.firstName ?? 'User',
        phonePrimary: session.phonePrimary!,
        phoneSecondary: secondary,
        refCodeUsed: session.refCode ?? null,
      });
      this.session.set(from.id, { step: 'registered', refCode: null });
      // Cache the Telegram profile photo in the background — never block
      // the registration reply on it.
      if (this.clients.shouldRefreshAvatar(client)) {
        void cacheTelegramAvatar(this.bot, from.id, client.id, this.clients);
      }
      let welcome = '✅ Ro‘yxatdan o‘tdingiz!';
      if (isNew && referrer && referrer.id !== client.id) {
        const bonusNew = Number((await this.settings.get('referral_bonus_client')) || '0');
        const bonusRef = Number((await this.settings.get('referral_bonus_referrer')) || '0');
        welcome += `\n\n🎁 Sizni *${escapeMd(referrer.firstName)}* taklif qildi.`;
        if (bonusNew > 0) {
          welcome += `\nBirinchi safaringizni yakunlaganingizda *+${fmtMoney(bonusNew)}* so‘m bonus olasiz.`;
        }
        // Tell the inviter their link worked (and what they will earn).
        void this.bot.telegram
          .sendMessage(
            Number(referrer.telegramId),
            `🎉 <b>Do‘stingiz ro‘yxatdan o‘tdi!</b>\n${escapeHtml(client.firstName)} sizning havolangiz orqali qo‘shildi.` +
              (bonusRef > 0
                ? `\nU birinchi safarini yakunlaganida sizga <b>+${fmtMoney(bonusRef)}</b> so‘m bonus beriladi.`
                : ''),
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
      }
      if (isNew && session.refCode) {
        await this.referral
          .recordSignup(session.refCode, client.id)
          .catch((e) =>
            this.logger.warn(`recordSignup failed: ${(e as Error).message}`),
          );
      }
      await ctx.reply(welcome, { parse_mode: 'Markdown', ...mainMenu() });
      // Fully registered — hand over the newest passenger app.
      if (isNew) await this.sendAppDownload(from.id, 'client');
      return;
    }

    const key = btnKey(text);

    // "⬅️ Asosiy menyu" or any menu button leaves an in-progress flow.
    if (text === DA_BACK) {
      this.session.set(from.id, {
        step: 'registered',
        draft: undefined,
        chatApplicationId: undefined,
      });
      await ctx.reply('🏠 Asosiy menyu', mainMenu());
      return;
    }
    if (!key) {
      if (session.step === 'awaiting_bonus_amount' && session.bonusOrderId) {
        await this.submitBonusAmount(ctx, session.bonusOrderId, text);
        return;
      }
      if (session.step === 'awaiting_promo_code') {
        await this.claimPromo(ctx, text);
        return;
      }
      if (session.step === 'driver_chat' && session.chatApplicationId) {
        await this.applications.addApplicantMessage(
          session.chatApplicationId,
          text,
        );
        await ctx.reply('✅ Adminga yuborildi. Javobni shu yerda olasiz.');
        return;
      }
      if (session.step === 'admin_chat') {
        await this.submitFeedback(ctx, text, null);
        return;
      }
      if (session.step.startsWith('da_')) {
        await this.daHandleText(ctx, session.step, text);
        return;
      }
      // Plain text from a passenger with a live order = message to the driver.
      if (session.step === 'registered' || session.step === 'idle') {
        const client = await this.clients.findByTelegramId(from.id);
        if (client && (await this.chat.sendFromClient(client.id, text))) {
          await ctx.reply('✅ Haydovchiga yuborildi');
          return;
        }
      }
    } else if (session.step !== 'registered') {
      this.session.set(from.id, {
        step: 'registered',
        draft: undefined,
        chatApplicationId: undefined,
      });
    }

    if (key === 'promo') {
      const client = await this.clients.findByTelegramId(from.id);
      if (!client) {
        await ctx.reply('Avval /start orqali ro‘yxatdan o‘ting.');
        return;
      }
      const pending = await this.promo.pendingFor(client.id);
      if (pending) {
        const lock = this.promo.lockNote(
          pending.promo,
          await this.promo.completedRides(client.id),
        );
        await ctx.reply(
          `🎟 Sizda faol promo bonus bor: *${fmtMoney(pending.remaining)}* so‘m (kod: \`${escapeMd(pending.promo.code)}\`).\n\n` +
            promoRule(pending.promo.maxPercentPerRide, pending.promo.maxAmountPerRide) +
            (lock ? `\n${lock}` : ''),
          { parse_mode: 'Markdown', ...mainMenu() },
        );
        return;
      }
      this.session.set(from.id, { step: 'awaiting_promo_code' });
      await ctx.reply('🎟 Promo kodni yozib yuboring:', backKb());
      return;
    }

    if (key === 'order') {
      const client = await this.clients.findByTelegramId(from.id);
      if (!client) {
        await ctx.reply('Avval /start orqali ro‘yxatdan o‘ting.');
        return;
      }
      if (client.isBlocked) {
        await ctx.reply('⛔ <b>Hisobingiz bloklangan.</b>\nSabab: ' + escapeHtml(client.blockedReason || 'ko‘rsatilmagan') + '\nAdmin bilan bog‘laning.', { parse_mode: 'HTML' });
        return;
      }
      this.session.set(from.id, { step: 'awaiting_pickup_location' });
      await ctx.reply(
        '🚕 <b>Taksi chaqirish</b>\n' +
          'Sizni qayerdan olib ketishimizni yuboring 👇\n' +
          '\n' +
          '📱 <b>Telefonda</b>\n' +
          'Pastdagi <b>«📍 Lokatsiyani yuborish»</b> tugmasini bosing.\n' +
          '\n' +
          '💻 <b>Kompyuterda</b>\n' +
          '1️⃣ Xabar maydoni chapidagi <b>📎</b> belgisini bosing\n' +
          '2️⃣ <b>Location</b> (Joylashuv) ni tanlang\n' +
          '3️⃣ <b>Send my current location</b> ni bosing\n' +
          '\n' +
          '<i>💡 Boshqa joydan chaqirmoqchi bo‘lsangiz — 📎 → Location orqali xaritada kerakli nuqtani tanlab yuboring.</i>',
        { parse_mode: 'HTML', ...locationRequestKb() },
      );
      return;
    }

    if (key === 'cancel') {
      this.session.set(from.id, { step: 'registered' });
      await ctx.reply('Bekor qilindi.', mainMenu());
      return;
    }

    if (key === 'invite') {
      const client = await this.clients.findByTelegramId(from.id);
      if (!client) return;
      if (!this.botUsername) {
        this.botUsername =
          (await this.bot.telegram.getMe().catch(() => null))?.username ?? null;
      }
      const link =
        this.botUsername && client.refCode
          ? `https://t.me/${this.botUsername}?start=${client.refCode}`
          : null;
      const lines = [
        '🎁 <b>Do‘stlaringizni taklif qiling</b>',
        'Havolani do‘stingizga yuboring — u ro‘yxatdan o‘tganida bonus olasiz.',
        DIVIDER,
      ];
      if (link) {
        lines.push(`🔗 <a href="${link}">${link}</a>`);
        lines.push(`🤖 Bot: @${this.botUsername}`);
      }
      if (client.refCode) {
        lines.push(`🔑 Kodingiz: <code>${escapeHtml(client.refCode)}</code>`);
      }
      const bonusRef = Number((await this.settings.get('referral_bonus_referrer')) || '0');
      const bonusNew = Number((await this.settings.get('referral_bonus_client')) || '0');
      if (bonusRef > 0 || bonusNew > 0) {
        lines.push(
          `💰 Do‘stingiz birinchi safarini yakunlaganida: sizga <b>+${fmtMoney(bonusRef)}</b>, unga <b>+${fmtMoney(bonusNew)}</b> so‘m bonus.`,
        );
      }
      lines.push('📷 Pastdagi QR kodni do‘stingiz skanerlasa ham bo‘ladi.');
      const share = link
        ? Markup.inlineKeyboard([
            [
              Markup.button.url(
                '📤 Do‘stga yuborish',
                `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
                  'Moviy Taxi — tez, qulay, ishonchli taksi. Shu havola orqali ro‘yxatdan o‘ting:',
                )}`,
              ),
            ],
          ])
        : {};
      // QR of the personal invite link — scanning it opens the bot with the ref code.
      let sentQr = false;
      if (link) {
        try {
          const png = await QRCode.toBuffer(link, { width: 512, margin: 2, errorCorrectionLevel: 'M' });
          await ctx.replyWithPhoto(Input.fromBuffer(png, 'moviytaxi-invite.png'), {
            caption: lines.join('\n'),
            parse_mode: 'HTML',
            ...share,
          });
          sentQr = true;
        } catch (e) {
          this.logger.warn(`invite QR failed: ${(e as Error).message}`);
        }
      }
      if (!sentQr) await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...share });
      return;
    }

    if (key === 'instagram') {
      const urls = [
        await this.settings.get('instagram_url_1'),
        await this.settings.get('instagram_url_2'),
        await this.settings.get('instagram_url_3'),
      ].filter((s) => s && s.trim());
      if (!urls.length) {
        await ctx.reply('Instagram sahifa hali ulanmagan. Tez orada qo‘shamiz.');
        return;
      }
      const buttons = urls.map((u, i) =>
        [Markup.button.url(`Instagram ${i + 1}`, u)],
      );
      await ctx.reply(
        '📷 Bizning Instagram sahifalarimiz:',
        Markup.inlineKeyboard(buttons),
      );
      return;
    }

    if (key === 'bonus') {
      const client = await this.clients.findByTelegramId(from.id);
      if (!client) return;
      const balance = Number(client.balance ?? 0).toLocaleString('uz');
      const pending = await this.promo.pendingFor(client.id);
      const lines = [
        '💰 *Bonuslarim*',
        '',
        `Bonus balans: *${balance}* so‘m`,
      ];
      lines.push(
        pending
          ? `🎟 Promo bonus qoldig‘i: *${fmtMoney(pending.remaining)}* so‘m — ${promoRule(pending.promo.maxPercentPerRide, pending.promo.maxAmountPerRide)}`
          : `🎟 Promo kodingiz bo‘lsa, “${BTN.promo}” tugmasini bosing`,
      );
      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      return;
    }

    if (key === 'becomeDriver') {
      await this.startDriverApplication(ctx);
      return;
    }

    if (key === 'contactAdmin') {
      // Messages go straight to the admin panel inbox (Murojaatlar).
      await this.startAdminChat(ctx);
      return;
    }

    if (key === 'food') {
      // The menu, cart and checkout live in the client app, opened inside
      // Telegram as a Mini App (logs in from initData — no code needed).
      await ctx.reply(
        '🍔 <b>Ovqat buyurtma</b>' + String.fromCharCode(10) + 'Oshxonalar menyusidan tanlang — kuryer eshigingizgacha olib keladi. To‘lov naqd, kuryerga.',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.webApp('🍽 Menyuni ochish', this.foodUrl('/food'))]]),
        },
      );
      return;
    }

    if (key === 'myOrders') {
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

    if (key === 'settings') {
      const client = await this.clients.findByTelegramId(from.id);
      if (!client) return;
      const lines = [
        `Ism: ${client.firstName}`,
        `Telefon: ${client.phonePrimary}`,
      ];
      if (client.phoneSecondary) {
        lines.push(`Qo‘shimcha: ${client.phoneSecondary}`);
      }
      if (client.refCode) {
        lines.push(`Sizning ref kodingiz: ${client.refCode}`);
      }
      lines.push(
        `Bonus balans: ${Number(client.balance ?? 0).toLocaleString('uz')} so‘m`,
      );
      lines.push('', 'Quyidagi tugmalar: promo kod, do‘stlarni taklif qilish, buyurtmalar tarixi va bonus.');
      await ctx.reply('⚙️ Sozlamalar\n\n' + lines.join('\n'), settingsMenu());
      return;
    }

    if (key === 'language') {
      await ctx.reply(
        'Tilni tanlang / Тилни танланг',
        Markup.inlineKeyboard([
          [Markup.button.callback('Lotin', 'lang:latn'), Markup.button.callback('Кирилл', 'lang:cyrl')],
        ]),
      );
      return;
    }
  }

  // --- promo code -----------------------------------------------------------

  // --- language --------------------------------------------------------------

  /** Keeps the choice across restarts and turns on conversion for these chats. */
  private async loadBotLangs() {
    installBotLang(this.bot);
    rememberLabels([
      ...Object.values(BTN),
      ...(Object.keys(BTN) as BtnKey[]).map(plainLabel),
      ...Object.keys(LEGACY_BTN),
      DA_BACK,
      DA_SKIP,
      DA_YES,
      DA_NO,
    ]);
    const rows = (await this.ds.query(`SELECT telegram_id, lang FROM telegram_langs WHERE lang = 'cyrl'`)) as {
      telegram_id: string;
    }[];
    for (const r of rows) setBotLang(r.telegram_id, 'cyrl');
  }

  @Action(/lang:(latn|cyrl)/)
  async onLanguage(@Ctx() ctx: Context) {
    const lang = ((ctx as any).match?.[1] === 'cyrl' ? 'cyrl' : 'latn') as 'latn' | 'cyrl';
    const id = ctx.from!.id;
    await this.ds.query(
      `INSERT INTO telegram_langs (telegram_id, lang) VALUES ($1, $2)
       ON CONFLICT (telegram_id) DO UPDATE SET lang = EXCLUDED.lang, updated_at = now()`,
      [id, lang],
    );
    setBotLang(id, lang);
    await ctx.answerCbQuery().catch(() => undefined);
    // A new keyboard replaces the old-language one.
    await ctx.reply('✅ Til o‘zgartirildi', mainMenu());
  }

  private async claimPromo(ctx: Context, code: string) {
    const from = ctx.from!;
    const client = await this.clients.findByTelegramId(from.id);
    if (!client) {
      await ctx.reply('Avval /start orqali ro‘yxatdan o‘ting.');
      return;
    }
    try {
      const r = await this.promo.claim(client.id, code);
      this.session.set(from.id, { step: 'registered' });
      const lock = this.promo.lockNote(r.promo, await this.promo.completedRides(client.id));
      await ctx.reply(
        `🎉 *Promo kod qabul qilindi!*\n\nBonus balansingizga *+${fmtMoney(r.amount)}* so‘m qo‘shildi.\n` +
          `Jami bonus: *${fmtMoney((await this.clients.findById(client.id))?.balance ?? 0)}* so‘m.\n\n` +
          promoRule(r.promo?.maxPercentPerRide, r.promo?.maxAmountPerRide) +
          (lock ? `\n${lock}` : '') +
          '\nSafar yakunida “💰 Bonusdan to‘lash” tugmasi bilan ishlatasiz.',
        { parse_mode: 'Markdown', ...mainMenu() },
      );
    } catch (e) {
      await ctx.reply(
        `⚠️ ${(e as Error).message}\n\nBoshqa kod yozing yoki “${DA_BACK}” tugmasini bosing.`,
        backKb(),
      );
    }
  }

  // --- "Haydovchi bo‘lish" questionnaire -------------------------------------

  private async startDriverApplication(ctx: Context) {
    const from = ctx.from!;
    const client = await this.clients.findByTelegramId(from.id);
    if (!client) {
      await ctx.reply('Avval /start orqali ro‘yxatdan o‘ting.');
      return;
    }
    const latest = await this.applications.latestForTelegram(from.id);
    if (latest?.status === DriverApplicationStatus.APPROVED) {
      await ctx.reply(
        '✅ Arizangiz allaqachon qabul qilingan — siz Moviy Taxi haydovchisiz.\nLogin ma’lumotlari sizga shu chatda yuborilgan.',
        mainMenu(),
      );
      return;
    }
    if (
      latest &&
      (latest.status === DriverApplicationStatus.NEW ||
        latest.status === DriverApplicationStatus.IN_REVIEW)
    ) {
      await ctx.reply(
        '⏳ *Arizangiz ko‘rib chiqilmoqda.*\nAdmin javobini shu chatda olasiz. Savolingiz bo‘lsa, adminga yozing.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💬 Adminga yozish', `dachat:${latest.id}`)],
          ]),
        },
      );
      return;
    }

    this.session.set(from.id, { step: 'da_full_name', draft: {} });
    await ctx.reply(
      '🚖 *Moviy Taxi haydovchisi bo‘lish*\n\n' +
        'Ariza uchun quyidagilar kerak bo‘ladi:\n' +
        '• to‘liq ism va telefon raqam\n' +
        '• mashina rusumi, rangi, davlat raqami va yili\n' +
        '• haydovchilik guvohnomasi (prava) rasmi\n' +
        '• texnik pasport rasmi\n' +
        '• mashina rasmi va o‘zingizning rasmingiz\n\n' +
        `Istalgan payt “${DA_BACK}” tugmasi bilan chiqishingiz mumkin.`,
      { parse_mode: 'Markdown' },
    );
    await this.daAsk(ctx, 'da_full_name');
  }

  private async daAsk(ctx: Context, step: RegStep) {
    const from = ctx.from!;
    if (step === 'da_confirm') {
      const draft = this.session.get(from.id).draft ?? {};
      await ctx.reply(this.daSummary(draft), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📄 Shartnomani o‘qish', 'da_contract')],
          [Markup.button.callback('✅ Shartnomaga roziman, yuborish', 'da_submit')],
          [Markup.button.callback('🔄 Qaytadan to‘ldirish', 'da_restart')],
        ]),
      });
      return;
    }
    const prompt = DA_PROMPTS[step] ?? '';
    let kb: ReturnType<typeof backKb> = backKb();
    if (step === 'da_phone') {
      const client = await this.clients.findByTelegramId(from.id);
      const rows: any[] = [
        [Markup.button.contactRequest('📱 Raqamni yuborish')],
      ];
      if (client?.phonePrimary) rows.push([client.phonePrimary]);
      rows.push([DA_BACK]);
      kb = Markup.keyboard(rows).resize();
    } else if (step === 'da_car_year') {
      kb = Markup.keyboard([[DA_SKIP], [DA_BACK]]).resize();
    } else if (step === 'da_self_employed') {
      kb = Markup.keyboard([[DA_YES, DA_NO], [DA_BACK]]).resize();
    }
    await ctx.reply(prompt, { parse_mode: 'Markdown', ...kb });
  }

  private async daAdvance(
    ctx: Context,
    patch: Partial<DriverApplicationDraft>,
    next: RegStep,
  ) {
    const from = ctx.from!;
    const draft = { ...(this.session.get(from.id).draft ?? {}), ...patch };
    this.session.set(from.id, { step: next, draft });
    await this.daAsk(ctx, next);
  }

  private async daHandleText(ctx: Context, step: RegStep, raw: string) {
    const text = raw.trim();
    switch (step) {
      case 'da_full_name':
        if (text.length < 5 || text.split(/\s+/).length < 2) {
          await ctx.reply('Iltimos, familiya va ismingizni to‘liq yozing.');
          return;
        }
        await this.daAdvance(ctx, { fullName: text }, 'da_phone');
        return;
      case 'da_phone': {
        const normalized = text.replace(/[\s()-]/g, '');
        if (!PHONE_REGEX.test(normalized)) {
          await ctx.reply('Telefon raqam noto‘g‘ri. Masalan: +998901234567');
          return;
        }
        const phone = normalized.startsWith('+') ? normalized : '+' + normalized;
        await this.daAdvance(ctx, { phone }, 'da_car_model');
        return;
      }
      case 'da_car_model':
        if (text.length < 2) {
          await ctx.reply('Mashina rusumini yozing.');
          return;
        }
        await this.daAdvance(ctx, { carModel: text.slice(0, 120) }, 'da_car_color');
        return;
      case 'da_car_color':
        if (text.length < 2) {
          await ctx.reply('Mashina rangini yozing.');
          return;
        }
        await this.daAdvance(ctx, { carColor: text.slice(0, 60) }, 'da_car_plate');
        return;
      case 'da_car_plate': {
        const plate = text.toUpperCase().replace(/\s+/g, ' ');
        if (plate.replace(/\s/g, '').length < 5) {
          await ctx.reply('Davlat raqamini to‘liq yozing (masalan, 01 A 123 BC).');
          return;
        }
        await this.daAdvance(ctx, { carPlate: plate.slice(0, 40) }, 'da_car_year');
        return;
      }
      case 'da_car_year':
        if (text === DA_SKIP) {
          await this.daAdvance(ctx, { carYear: null }, 'da_self_employed');
          return;
        }
        if (!/^(19|20)\d{2}$/.test(text)) {
          await ctx.reply('Yilni 4 xonali raqam bilan yozing (masalan, 2021).');
          return;
        }
        await this.daAdvance(ctx, { carYear: text }, 'da_self_employed');
        return;
      case 'da_self_employed': {
        const yes = text === DA_YES || /^ha\b/i.test(text);
        const no = text === DA_NO || /^yo/i.test(text);
        if (!yes && !no) {
          await ctx.reply('Tugmalardan birini bosing: “Ha” yoki “Yo‘q”.');
          return;
        }
        await this.daAdvance(ctx, { selfEmployed: yes }, 'da_license_photo');
        return;
      }
      case 'da_confirm':
        await ctx.reply('Pastdagi “✅ Yuborish” yoki “🔄 Qaytadan to‘ldirish” tugmasini bosing.');
        return;
      default:
        // Photo steps
        await ctx.reply('📷 Iltimos, rasm yuboring (fayl emas, rasm sifatida).');
    }
  }

  private daSummary(d: DriverApplicationDraft): string {
    const esc = (s?: string | null) =>
      (s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tick = (v?: string) => (v ? '✅' : '❌');
    return [
      '📋 <b>Arizangizni tekshiring</b>',
      '',
      `👤 Ism: <b>${esc(d.fullName)}</b>`,
      `📞 Telefon: <b>${esc(d.phone)}</b>`,
      `🚗 Mashina: <b>${esc(d.carModel)}</b>, ${esc(d.carColor)}`,
      `🔢 Raqam: <b>${esc(d.carPlate)}</b>`,
      `📅 Yili: <b>${esc(d.carYear)}</b>`,
      `🧾 O‘z-o‘zini band qilgan: <b>${d.selfEmployed == null ? '—' : d.selfEmployed ? 'Ha' : 'Yo‘q'}</b>`,
      '',
      `${tick(d.licensePhotoUrl)} Prava rasmi`,
      `${tick(d.techPassportPhotoUrl)} Texpasport rasmi`,
      `${tick(d.carPhotoUrl)} Mashina rasmi`,
      `${tick(d.selfiePhotoUrl)} O‘zingizning rasmingiz`,
      '',
      '📄 “Yuborish”ni bosish orqali siz haydovchi shartnomasi shartlariga rozilik bildirasiz.',
    ].join('\n');
  }

  @On('photo')
  async onPhoto(@Ctx() ctx: Context) {
    const photos = (ctx.message as any)?.photo as { file_id: string }[] | undefined;
    if (!photos?.length) return;
    await this.handleIncomingImage(ctx, photos[photos.length - 1].file_id);
  }

  /** Telegram Desktop often sends pictures as files — treat image documents as photos. */
  @On('document')
  async onDocument(@Ctx() ctx: Context) {
    const doc = (ctx.message as any)?.document as
      | { file_id: string; mime_type?: string }
      | undefined;
    if (!doc) return;
    if (!/^image\//.test(doc.mime_type ?? '')) {
      const step = this.session.get(ctx.from!.id).step;
      if (step.startsWith('da_') || step === 'driver_chat') {
        await ctx.reply('📷 Faqat rasm yuboring (JPG yoki PNG).');
      }
      return;
    }
    await this.handleIncomingImage(ctx, doc.file_id);
  }

  private async handleIncomingImage(ctx: Context, fileId: string) {
    const from = ctx.from!;
    const session = this.session.get(from.id);
    const caption = ((ctx.message as any)?.caption ?? null) as string | null;

    const photoStep =
      DA_PHOTO_STEPS[session.step as keyof typeof DA_PHOTO_STEPS];
    if (photoStep) {
      try {
        const url = await saveTelegramFile(this.bot, fileId, 'driver-applications');
        await this.daAdvance(
          ctx,
          { [photoStep.field]: url } as Partial<DriverApplicationDraft>,
          photoStep.next,
        );
      } catch (e) {
        this.logger.warn(`Application photo save failed: ${(e as Error).message}`);
        await ctx.reply('Rasmni saqlab bo‘lmadi. Qaytadan yuboring.');
      }
      return;
    }

    if (session.step === 'admin_chat') {
      try {
        const url = await saveTelegramFile(this.bot, fileId, 'feedback');
        await this.submitFeedback(ctx, caption, url);
      } catch (e) {
        this.logger.warn(`Feedback photo save failed: ${(e as Error).message}`);
        await ctx.reply('Rasmni saqlab bo‘lmadi. Qaytadan yuboring.');
      }
      return;
    }

    if (session.step === 'driver_chat' && session.chatApplicationId) {
      try {
        const url = await saveTelegramFile(this.bot, fileId, 'driver-applications');
        await this.applications.addApplicantMessage(
          session.chatApplicationId,
          caption,
          url,
        );
        await ctx.reply('✅ Rasm adminga yuborildi.');
      } catch (e) {
        this.logger.warn(`Chat photo save failed: ${(e as Error).message}`);
        await ctx.reply('Rasmni yuborib bo‘lmadi. Qaytadan urinib ko‘ring.');
      }
    }
  }

  @Action('da_start')
  async onDaStart(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.startDriverApplication(ctx);
  }

  @Action('da_restart')
  async onDaRestart(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    this.session.set(ctx.from!.id, { step: 'da_full_name', draft: {} });
    await this.daAsk(ctx, 'da_full_name');
  }

  @Action('da_contract')
  async onDaContract(@Ctx() ctx: Context) {
    await ctx.answerCbQuery().catch(() => undefined);
    const custom = (await this.settings.get('driver_contract_text')).trim();
    const text = custom || DEFAULT_DRIVER_CONTRACT;
    // Telegram caps a message at 4096 chars.
    for (let i = 0; i < text.length; i += 3800) {
      await ctx.reply(text.slice(i, i + 3800));
    }
  }

  @Action('da_submit')
  async onDaSubmit(@Ctx() ctx: Context) {
    const from = ctx.from!;
    const session = this.session.get(from.id);
    const d = session.draft;
    if (
      session.step !== 'da_confirm' ||
      !d?.fullName ||
      !d.phone ||
      !d.carModel ||
      !d.carColor ||
      !d.carPlate
    ) {
      await ctx.answerCbQuery('Ariza eskirgan. Qaytadan to‘ldiring.', {
        show_alert: true,
      });
      return;
    }
    const client = await this.clients.findByTelegramId(from.id);
    try {
      const app = await this.applications.submit({
        clientId: client?.id ?? null,
        telegramId: from.id,
        telegramUsername: from.username ?? null,
        fullName: d.fullName,
        phone: d.phone,
        carModel: d.carModel,
        carColor: d.carColor,
        carPlate: d.carPlate,
        carYear: d.carYear ?? null,
        selfEmployed: d.selfEmployed ?? null,
        contractAccepted: true,
        licensePhotoUrl: d.licensePhotoUrl ?? null,
        techPassportPhotoUrl: d.techPassportPhotoUrl ?? null,
        carPhotoUrl: d.carPhotoUrl ?? null,
        selfiePhotoUrl: d.selfiePhotoUrl ?? null,
      });
      this.session.set(from.id, { step: 'registered', draft: undefined });
      await ctx.answerCbQuery('Yuborildi');
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await ctx.reply(
        '✅ *Arizangiz yuborildi!*\n\nAdmin uni ko‘rib chiqib, shu chat orqali javob beradi.',
        { parse_mode: 'Markdown', ...mainMenu() },
      );
      await ctx.reply('Savolingiz bo‘lsa, adminga yozishingiz mumkin:', {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💬 Adminga yozish', `dachat:${app.id}`)],
        ]),
      });
    } catch (e) {
      await ctx.answerCbQuery((e as Error).message, { show_alert: true });
    }
  }

  @Action(/dachat:(.+)/)
  async onDaChat(@Ctx() ctx: Context) {
    const from = ctx.from!;
    const appId = ((ctx as any).match as RegExpExecArray)[1];
    const latest = await this.applications.latestForTelegram(from.id);
    if (!latest || latest.id !== appId) {
      await ctx.answerCbQuery('Ariza topilmadi', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery();
    this.session.set(from.id, { step: 'driver_chat', chatApplicationId: appId });
    await ctx.reply(
      `✍️ Adminga xabaringizni yozing (matn yoki rasm).\nChiqish uchun “${DA_BACK}” tugmasini bosing.`,
      backKb(),
    );
  }

  /**
   * Self-heal: Telegraf stops polling for good when its startup getMe times
   * out or another process steals getUpdates (409). Updates then pile up on
   * Telegram's side while the app looks healthy. If updates stay pending for
   * ~3 minutes, exit and let PM2 restart the process with a fresh poller.
   */
  private startPollingWatchdog() {
    let stuck = 0;
    const timer = setInterval(async () => {
      try {
        const info = await this.bot.telegram.getWebhookInfo();
        if ((info.pending_update_count ?? 0) > 0) {
          stuck++;
          this.logger.warn(`Bot watchdog: ${info.pending_update_count} pending updates (${stuck}/3)`);
          if (stuck >= 3) {
            this.logger.error('Bot watchdog: polling is dead — exiting so PM2 restarts the backend');
            setTimeout(() => process.exit(1), 500);
          }
        } else {
          stuck = 0;
        }
      } catch {
        /* Telegram unreachable for a moment — try again next minute */
      }
    }, 60_000);
    timer.unref?.();
  }

  // --- "Admin bilan aloqa" → admin panel inbox --------------------------------

  private async startAdminChat(ctx: Context) {
    const from = ctx.from!;
    this.session.set(from.id, { step: 'admin_chat' });
    await ctx.reply(
      '👨‍💼 *Admin bilan aloqa*\n\n' +
        'Xabaringizni yozing (matn yoki rasm) — u to‘g‘ridan-to‘g‘ri admin paneliga tushadi.\n' +
        `Admin javobi shu chatga keladi. Chiqish uchun “${DA_BACK}” tugmasini bosing.`,
      { parse_mode: 'Markdown', ...backKb() },
    );
  }

  /** "✍️ Javob yozish" under an admin reply — continue the conversation. */
  @Action('fb_reply')
  async onFbReply(@Ctx() ctx: Context) {
    await ctx.answerCbQuery().catch(() => undefined);
    await this.startAdminChat(ctx);
  }

  private async submitFeedback(
    ctx: Context,
    text: string | null,
    photoUrl: string | null,
  ) {
    const from = ctx.from!;
    const clean = (text ?? '').trim();
    if (!clean && !photoUrl) {
      await ctx.reply('Xabar bo‘sh. Matn yoki rasm yuboring.');
      return;
    }
    if (clean && clean.length < 2) {
      await ctx.reply('Xabar juda qisqa, batafsilroq yozing.');
      return;
    }
    const client = await this.clients.findByTelegramId(from.id);
    try {
      const row = await this.feedback.create({
        telegramUserId: from.id,
        telegramUsername: from.username ?? null,
        firstName: from.first_name ?? client?.firstName ?? null,
        phone: client?.phonePrimary ?? null,
        text: clean || '📷 Rasm',
        photoUrl,
        clientId: client?.id ?? null,
      });
      this.realtime.emitToAdmin('feedback_new', {
        id: row.id,
        firstName: row.firstName,
        text: row.text,
        photoUrl: row.photoUrl,
        createdAt: row.createdAt,
      });
      this.session.set(from.id, { step: 'registered' });
      await ctx.reply(
        '✅ Xabaringiz admin paneliga yetkazildi. Admin javobi shu chatga keladi.',
        mainMenu(),
      );
    } catch (e) {
      this.logger.error(`feedback save failed: ${(e as Error).message}`);
      await ctx.reply(
        'Xabarni yuborib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.',
        backKb(),
      );
    }
  }

  // --- app download (newest APK) ---------------------------------------------

  /** Client app URL (Mini App) for the food section. */
  private foodUrl(path: string): string {
    const base = (this.config.get<string>('DRIVER_APP_URL') ?? 'https://moviytaxi.uz').replace(/\/$/, '');
    return `${base}/client${path}`;
  }

  /** Telegram file_id of the last uploaded build per app, keyed by build. */
  private readonly apkFileIds = new Map<'client' | 'driver', { key: string; fileId: string }>();

  /** /app — resend the newest app(s) to a registered user. */
  private async onAppCommand(ctx: Context) {
    const from = ctx.from!;
    const client = await this.clients.findByTelegramId(from.id);
    if (!client) {
      await ctx.reply('Avval /start orqali ro‘yxatdan o‘ting.');
      return;
    }
    await this.sendAppDownload(from.id, 'client');
    const latest = await this.applications.latestForTelegram(from.id);
    if (latest?.status === DriverApplicationStatus.APPROVED) {
      await this.sendAppDownload(from.id, 'driver');
    }
  }

  /**
   * Send the newest Android build of the client/driver app as a document
   * (the ~5 MB upload happens once per build — Telegram's file_id is reused
   * afterwards), with links to the download page as a fallback.
   */
  private async sendAppDownload(chatId: number, kind: 'client' | 'driver') {
    const base = (this.config.get<string>('DRIVER_APP_URL') ?? 'https://moviytaxi.uz').replace(/\/$/, '');
    const dir = this.config.get<string>('APK_DIR') ?? '/opt/moviytaxi/apk';
    const file = join(dir, `moviytaxi-${kind}.apk`);
    const versionFile = join(dir, kind === 'client' ? 'version-client.json' : 'version.json');
    let version = '';
    try {
      version = String(JSON.parse(fs.readFileSync(versionFile, 'utf8')).version ?? '');
    } catch {
      /* no build info — still send the links */
    }
    const title =
      kind === 'client'
        ? '📱 <b>Moviy Taxi — mijoz ilovasi</b>'
        : '🚖 <b>Moviy Taxi — haydovchi ilovasi</b>';
    const howTo =
      kind === 'client'
        ? '🔐 Kirish: telefon raqamingiz → tasdiqlash kodi shu botga keladi.'
        : '🔐 Kirish: yuqoridagi login va parol bilan.';
    const caption =
      `${title}${version ? ` v${version}` : ''}\n` +
      'Android uchun eng yangi versiya. Faylni oching va o‘rnating ' +
      '(“Noma’lum manbalar”ga ruxsat so‘ralsa — ruxsat bering).\n\n' +
      howTo;
    const kb = Markup.inlineKeyboard([
      [Markup.button.url('🌐 Yuklab olish sahifasi', `${base}/app`)],
      [Markup.button.url('⬇️ APK havolasi', `${base}/downloads/moviytaxi-${kind}.apk`)],
    ]);
    try {
      const st = fs.statSync(file);
      const key = `${version}:${st.mtimeMs}:${st.size}`;
      const cached = this.apkFileIds.get(kind);
      const source =
        cached && cached.key === key
          ? cached.fileId
          : Input.fromLocalFile(file, `MoviyTaxi-${kind}${version ? `-v${version}` : ''}.apk`);
      const msg = await this.bot.telegram.sendDocument(chatId, source, {
        caption,
        parse_mode: 'HTML',
        ...kb,
      });
      const fileId = (msg as any)?.document?.file_id as string | undefined;
      if (fileId) this.apkFileIds.set(kind, { key, fileId });
    } catch (e) {
      this.logger.warn(`APK send (${kind}) failed, sending links: ${(e as Error).message}`);
      await this.bot.telegram
        .sendMessage(chatId, caption, { parse_mode: 'HTML', ...kb })
        .catch(() => undefined);
    }
  }

  // --- pay from bonus ---------------------------------------------------------

  @Action(/bonus:(.+)/)
  async onBonusStart(@Ctx() ctx: Context) {
    const from = ctx.from!;
    const orderId = ((ctx as any).match as RegExpExecArray)[1];
    const client = await this.clients.findByTelegramId(from.id);
    if (!client) {
      await ctx.answerCbQuery('Avval /start', { show_alert: true });
      return;
    }
    try {
      const { max, order, promoNote } = await this.bonus.maxForOrder(client.id, orderId);
      if (max <= 0) {
        await ctx.answerCbQuery('Bonus balansingiz yetarli emas', { show_alert: true });
        return;
      }
      await ctx.answerCbQuery();
      this.session.set(from.id, { step: 'awaiting_bonus_amount', bonusOrderId: orderId });
      const cash =
        Number(order.price ?? 0) - Number(order.discount ?? 0) - Number(order.bonusUsed ?? 0);
      await ctx.reply(
        '💰 <b>Bonusdan to‘lash</b>\n' +
          DIVIDER +
          `\n⭐ Bonus balansingiz: <b>${fmtMoney(client.balance)}</b> so‘m\n` +
          `💵 Safar uchun to‘lanadi: <b>${fmtMoney(cash)}</b> so‘m\n` +
          (promoNote ? `🎟 ${escapeHtml(promoNote).replace(/\n/g, '\n🎟 ')}\n` : '') +
          `\nQancha so‘mni bonusdan to‘lamoqchisiz? (maksimal <b>${fmtMoney(max)}</b>)\n` +
          'Summani yozing yoki tugmani bosing 👇',
        {
          parse_mode: 'HTML',
          ...Markup.keyboard([[String(max)], [DA_BACK]]).resize(),
        },
      );
    } catch (e) {
      await ctx.answerCbQuery((e as Error).message, { show_alert: true });
    }
  }

  private async submitBonusAmount(ctx: Context, orderId: string, raw: string) {
    const from = ctx.from!;
    const amount = Number(raw.replace(/[^\d]/g, ''));
    if (!amount) {
      await ctx.reply('Summani raqam bilan yozing, masalan: 8000');
      return;
    }
    const client = await this.clients.findByTelegramId(from.id);
    if (!client) return;
    try {
      await this.bonus.request(client.id, orderId, amount);
      this.session.set(from.id, { step: 'registered', bonusOrderId: undefined });
      await ctx.reply(
        `⏳ Haydovchiga yuborildi: <b>${fmtMoney(amount)}</b> so‘m bonusdan.\n` +
          'Haydovchi tasdiqlashi bilan xabar beramiz.',
        { parse_mode: 'HTML', ...mainMenu() },
      );
    } catch (e) {
      await ctx.reply(`⚠️ ${(e as Error).message}`, Markup.keyboard([[DA_BACK]]).resize());
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

  /** Helper for setting premium button icons: echoes custom emoji IDs. */
  @Command('emojiid')
  async onEmojiId(@Ctx() ctx: Context) {
    this.session.set(ctx.from!.id, { step: 'awaiting_emoji_ids' });
    await ctx.reply(
      '✨ Premium emojilarni yuboring — har birining ID sini qaytaraman.',
      backKb(),
    );
  }

  @Command('help')
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(
      'Buyruqlar:\n/start — boshlash\n"🚖 Taxi chaqirish" — yangi buyurtma\n"📋 Buyurtmalarim" — tarix',
    );
  }
}
