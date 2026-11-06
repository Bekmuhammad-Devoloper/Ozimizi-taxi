import { TariffTier } from '../../common/utils/fare';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tariffs')
export class Tariff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // When > 0, commission = fare × percent; otherwise commissionPerOrder.
  @Column({
    name: 'commission_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  commissionPercent: string;

  @Column({
    name: 'price_per_km',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 2000,
  })
  pricePerKm: string;

  @Column({
    name: 'minimum_fare',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 10000,
  })
  minimumFare: string;

  @Column({
    name: 'commission_per_order',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 1000,
  })
  commissionPerOrder: string;

  // Waiting at the pickup: first N minutes free, then per minute.
  @Column({ name: 'waiting_free_minutes', type: 'int', default: 3 })
  waitingFreeMinutes: number;

  @Column({
    name: 'waiting_price_per_minute',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  waitingPricePerMinute: string;

  // Distance price table ("up to X km → Y so‘m"), sorted by uptoKm. Empty =
  // plain per-km pricing with the minimum fare.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  tiers: TariffTier[];

  // Zone drawn by the admin (polygon points). Km driven outside it cost
  // `outsidePricePerKm`; fewer than 3 points or price 0 = no zone pricing.
  @Column({ name: 'zone_polygon', type: 'jsonb', default: () => "'[]'" })
  zonePolygon: { lat: number; lng: number }[];

  @Column({
    name: 'outside_price_per_km',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  outsidePricePerKm: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
