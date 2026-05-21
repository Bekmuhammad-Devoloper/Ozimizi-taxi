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
    return this.repo.save(row);
  }
}
