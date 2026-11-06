import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tariff } from './tariff.entity';
import { UpdateTariffDto } from './dto/update-tariff.dto';

@Injectable()
export class TariffService {
  constructor(
    @InjectRepository(Tariff) private readonly repo: Repository<Tariff>,
  ) {}

  async getCurrent(): Promise<Tariff> {
    const t = await this.repo.find({ take: 1, order: { updatedAt: 'DESC' } });
    if (!t.length) {
      throw new NotFoundException('Tariff not configured');
    }
    return t[0];
  }

  async update(dto: UpdateTariffDto): Promise<Tariff> {
    const current = await this.repo.find({ take: 1 });
    const row = current[0] ?? this.repo.create();
    if (dto.pricePerKm !== undefined) row.pricePerKm = String(dto.pricePerKm);
    if (dto.minimumFare !== undefined) row.minimumFare = String(dto.minimumFare);
    if (dto.commissionPerOrder !== undefined)
      row.commissionPerOrder = String(dto.commissionPerOrder);
    if (dto.commissionPercent !== undefined)
      row.commissionPercent = String(dto.commissionPercent);
    if (dto.waitingFreeMinutes !== undefined)
      row.waitingFreeMinutes = Math.floor(Number(dto.waitingFreeMinutes));
    if (dto.waitingPricePerMinute !== undefined)
      row.waitingPricePerMinute = String(dto.waitingPricePerMinute);
    if (dto.tiers !== undefined) {
      // Store normalised: ascending by distance, no duplicate limits.
      const seen = new Set<number>();
      row.tiers = dto.tiers
        .map((t) => ({ uptoKm: Number(t.uptoKm), price: Number(t.price) }))
        .filter((t) => t.uptoKm > 0 && t.price >= 0)
        .sort((a, b) => a.uptoKm - b.uptoKm)
        .filter((t) => (seen.has(t.uptoKm) ? false : (seen.add(t.uptoKm), true)));
    }
    if (dto.zonePolygon !== undefined) {
      row.zonePolygon = dto.zonePolygon.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    }
    if (dto.outsidePricePerKm !== undefined) row.outsidePricePerKm = String(dto.outsidePricePerKm);
    return this.repo.save(row);
  }
}
