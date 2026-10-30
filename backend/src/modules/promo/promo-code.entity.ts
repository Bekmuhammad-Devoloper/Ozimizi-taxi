import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../client/client.entity';

/**
 * Admin-defined promo campaign. A client claims the code in the bot and the
 * amount is credited to their bonus balance; per ride they may spend at most
 * the promo's own limit of it (% of fare and/or so'm). Availability is
 * limited by an optional time window (startsAt..endsAt) and/or an optional
 * cap on the number of clients (maxUses) — the first N to claim it win.
 */
@Entity('promo_codes')
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 32 })
  code: string;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  discountAmount: string;

  @Column({ name: 'max_uses', type: 'int', nullable: true })
  maxUses: number | null;

  // Per ride, at most this % of the fare may be paid with this promo's
  // money; the rest stays for later rides. 0 = no % limit.
  @Column({
    name: 'max_percent_per_ride',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  maxPercentPerRide: string;

  // Per ride, at most this many so'm of this promo's money. 0 = no limit.
  @Column({
    name: 'max_amount_per_ride',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  maxAmountPerRide: string;

  // Promo money unlocks only after the client has completed this many
  // rides (0 = usable right away). Set per promo by the admin.
  @Column({ name: 'min_rides', type: 'int', default: 0 })
  minRides: number;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount: number;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('promo_redemptions')
export class PromoRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'promo_id' })
  promoId: string;

  @ManyToOne(() => PromoCode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promo_id' })
  promo: PromoCode;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  // Unspent part of `amount` (promo money still on the bonus balance).
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  remaining: string;

  // Last order the discount was applied to / when.
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
