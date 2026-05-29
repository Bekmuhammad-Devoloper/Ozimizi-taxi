import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Client } from '../modules/client/client.entity';
import { Driver } from '../modules/driver/driver.entity';
import { Order } from '../modules/order/order.entity';
import { BalanceTransaction } from '../modules/balance/balance-transaction.entity';
import { Tariff } from '../modules/tariff/tariff.entity';
import { Admin } from '../modules/admin/admin.entity';
import { PasswordResetToken } from '../modules/auth/password-reset-token.entity';
import { SiteSetting } from '../modules/settings/site-setting.entity';
import { PaymentRequest } from '../modules/payment/payment-request.entity';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
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
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
});
