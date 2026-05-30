import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../driver/driver.entity';
import { Client } from '../client/client.entity';
import { ClientModule } from '../client/client.module';
import { WalletBotService } from './wallet-bot.service';

/**
 * Separate Telegraf bot (@ozimizitaxi_walletbot) for drivers and clients
 * to request top-ups / withdrawals directly. Imported by AppModule only
 * when the WALLET_BOT_TOKEN env is a real BotFather token.
 *
 * PaymentService + PaymentEvents come from the @Global() PaymentModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Driver, Client]), ClientModule],
  providers: [WalletBotService],
})
export class WalletBotModule {}
