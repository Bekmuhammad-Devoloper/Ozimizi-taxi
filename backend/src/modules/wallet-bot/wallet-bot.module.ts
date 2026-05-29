import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../driver/driver.entity';
import { WalletBotService } from './wallet-bot.service';

/**
 * Separate Telegraf bot (@ozimizitaxi_walletbot) for drivers to request
 * top-ups / withdrawals directly. Imported by AppModule only when the
 * WALLET_BOT_TOKEN env is a real BotFather token.
 *
 * PaymentService + PaymentEvents come from the @Global() PaymentModule,
 * so no import needed here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Driver])],
  providers: [WalletBotService],
})
export class WalletBotModule {}
