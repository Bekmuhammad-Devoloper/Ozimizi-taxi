import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Client } from '../modules/client/client.entity';
import { Driver } from '../modules/driver/driver.entity';
import { Order } from '../modules/order/order.entity';
import { BalanceTransaction } from '../modules/balance/balance-transaction.entity';
import { LedgerEvent } from '../modules/balance/ledger-event.entity';
import { Tariff } from '../modules/tariff/tariff.entity';
import { Admin } from '../modules/admin/admin.entity';
import { PasswordResetToken } from '../modules/auth/password-reset-token.entity';
import { SiteSetting } from '../modules/settings/site-setting.entity';
import { PaymentRequest } from '../modules/payment/payment-request.entity';
import { Feedback } from '../modules/feedback/feedback.entity';
import {
  PromoCode,
  PromoRedemption,
} from '../modules/promo/promo-code.entity';
import {
  ReferralLink,
  ReferralSignup,
} from '../modules/referral/referral.entity';
import {
  DriverApplication,
  DriverApplicationMessage,
} from '../modules/driver-application/driver-application.entity';
import { BonusPayment } from '../modules/bonus/bonus-payment.entity';
import { OrderMessage } from '../modules/chat/order-message.entity';
import { OrderEvent } from '../modules/order/order-event.entity';
import { Announcement } from '../modules/announcement/announcement.entity';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Client,
    Driver,
    Order,
    BalanceTransaction,
    LedgerEvent,
    Tariff,
    Admin,
    PasswordResetToken,
    SiteSetting,
    PaymentRequest,
    Feedback,
    PromoCode,
    PromoRedemption,
    ReferralLink,
    ReferralSignup,
    DriverApplication,
    DriverApplicationMessage,
    BonusPayment,
    OrderMessage,
    OrderEvent,
    Announcement,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
});
