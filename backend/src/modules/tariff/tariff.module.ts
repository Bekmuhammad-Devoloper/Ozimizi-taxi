import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tariff } from './tariff.entity';
import { TariffService } from './tariff.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tariff])],
  providers: [TariffService],
  exports: [TariffService],
})
export class TariffModule {}
