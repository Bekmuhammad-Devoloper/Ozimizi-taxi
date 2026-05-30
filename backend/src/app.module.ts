import { config as loadDotenv } from 'dotenv';
// override=true so values from .env always win over stale env inherited
// from PM2 (e.g. an old BOT_TOKEN cached from the first `pm2 start`).
loadDotenv({ override: true });

import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegrafModule } from 'nestjs-telegraf';
import { LoggerModule } from 'nestjs-pino';

import { Client } from './modules/client/client.entity';
import { Driver } from './modules/driver/driver.entity';
import { Order } from './modules/order/order.entity';
import { BalanceTransaction } from './modules/balance/balance-transaction.entity';
import { Tariff } from './modules/tariff/tariff.entity';
import { Admin } from './modules/admin/admin.entity';
import { PasswordResetToken } from './modules/auth/password-reset-token.entity';
import { SiteSetting } from './modules/settings/site-setting.entity';
import { PaymentRequest } from './modules/payment/payment-request.entity';
import { Feedback } from './modules/feedback/feedback.entity';
import { MailerModule } from './modules/mailer/mailer.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PaymentModule } from './modules/payment/payment.module';
import { FeedbackModule } from './modules/feedback/feedback.module';

import { AuthModule } from './modules/auth/auth.module';
import { ClientModule } from './modules/client/client.module';
import { DriverModule } from './modules/driver/driver.module';
import { OrderModule } from './modules/order/order.module';
import { BalanceModule } from './modules/balance/balance.module';
import { TariffModule } from './modules/tariff/tariff.module';
import { AdminModule } from './modules/admin/admin.module';
import { BotModule } from './modules/bot/bot.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { GatewaysModule } from './modules/realtime/gateways.module';
import { WalletBotModule } from './modules/wallet-bot/wallet-bot.module';
import { FeedbackBotModule } from './modules/feedback-bot/feedback-bot.module';

function isRealTelegramToken(t: string | undefined): boolean {
  // Real BotFather tokens look like "<digits>:<35-char alnum>". Reject placeholders.
  return (
    !!t && /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(t) && !t.includes('placeholder')
  );
}

const botImports: DynamicModule['imports'] = isRealTelegramToken(
  process.env.BOT_TOKEN,
)
  ? [
      TelegrafModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          token: config.get<string>('BOT_TOKEN') ?? '',
        }),
      }),
      BotModule,
    ]
  : [];

const walletBotImports: DynamicModule['imports'] = isRealTelegramToken(
  process.env.WALLET_BOT_TOKEN,
)
  ? [WalletBotModule]
  : [];

const feedbackBotImports: DynamicModule['imports'] = isRealTelegramToken(
  process.env.FEEDBACK_BOT_TOKEN,
)
  ? [FeedbackBotModule]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        autoLogging: false,
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [
          Client,
          Driver,
          Order,
          BalanceTransaction,
          Tariff,
          Admin,
          PasswordResetToken,
          SiteSetting,
          PaymentRequest,
          Feedback,
        ],
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    MailerModule,
    SettingsModule,
    PaymentModule,
    FeedbackModule,
    RealtimeModule,
    AuthModule,
    ClientModule,
    BalanceModule,
    TariffModule,
    OrderModule,
    DriverModule,
    AdminModule,
    GatewaysModule,
    ...botImports,
    ...walletBotImports,
    ...feedbackBotImports,
  ],
})
export class AppModule {}
