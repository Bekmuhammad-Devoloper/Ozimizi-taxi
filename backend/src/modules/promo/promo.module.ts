import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode, PromoRedemption } from './promo-code.entity';
import { PromoService } from './promo.service';
import { PromoController } from './promo.controller';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [TypeOrmModule.forFeature([PromoCode, PromoRedemption]), BalanceModule],
  providers: [PromoService],
  controllers: [PromoController],
  exports: [PromoService],
})
export class PromoModule {}
