import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../driver/driver.entity';
import { Client } from '../client/client.entity';
import { Admin } from '../admin/admin.entity';
import { ClientModule } from '../client/client.module';
import { WalletBotService } from './wallet-bot.service';

/**
 * Separate Telegraf bot (@ozimizitaxi_walletbot) for drivers, clients
 * and coordinators. Imported by AppModule only when the
 * WALLET_BOT_TOKEN env is a real BotFather token.
 *
 * PaymentService + PaymentEvents + WalletBotLinkService come from
 * @Global() modules, so no import needed here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Driver, Client, Admin]), ClientModule],
  providers: [WalletBotService],
})
export class WalletBotModule {}
