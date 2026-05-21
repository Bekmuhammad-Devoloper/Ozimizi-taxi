import { config as loadDotenv } from 'dotenv';
loadDotenv();

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
import { MailerModule } from './modules/mailer/mailer.module';

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

function hasRealBotToken(): boolean {
  const t = process.env.BOT_TOKEN ?? '';
  // Real BotFather tokens look like "<digits>:<35-char alnum>". Reject placeholders.
  return /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(t) && !t.includes('placeholder');
}

const botImports: DynamicModule['imports'] = hasRealBotToken()
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
        ],
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    MailerModule,
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
  ],
})
export class AppModule {}
