import { Module } from '@nestjs/common';
import { BotUpdate } from './bot.update';
import { ClientModule } from '../client/client.module';
import { OrderModule } from '../order/order.module';
import { PromoModule } from '../promo/promo.module';
import { ReferralModule } from '../referral/referral.module';
import { DriverApplicationModule } from '../driver-application/driver-application.module';
import { BonusModule } from '../bonus/bonus.module';
import { ChatModule } from '../chat/chat.module';
import { AnnouncementModule } from '../announcement/announcement.module';
import { ReceiptModule } from '../receipt/receipt.module';
import { ClientApiModule } from '../client-api/client-api.module';

@Module({
  imports: [
    ClientModule,
    OrderModule,
    PromoModule,
    ReferralModule,
    DriverApplicationModule,
    BonusModule,
    ChatModule,
    AnnouncementModule,
    ReceiptModule,
    ClientApiModule,
  ],
  providers: [BotUpdate],
})
export class BotModule {}
