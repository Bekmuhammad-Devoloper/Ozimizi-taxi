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

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
