import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Treasury journal. One row for every movement that touches the treasury
 * or a coordinator purse (driver top-ups, client credits, allocations,
 * drains…), with the treasury balance right after it. Together with
 * balance_transactions this makes the 100M closed loop auditable.
 */
export type LedgerKind =
  | 'driver_adjust' // treasury ↔ driver (top-up, withdraw, commission…)
  | 'client_adjust' // treasury ↔ client (promo, referral, penalty…)
  | 'driver_drain' // driver removed → remainder to treasury
  | 'coord_allocate' // treasury → coordinator purse (negative = claw-back)
  | 'coord_transfer' // coordinator purse → driver/client
  | 'bonus_to_driver' // client bonus → driver (treasury untouched)
  | 'kitchen_adjust' // treasury ↔ kitchen (top-up, commission, bonus)
  | 'reconcile'; // manual correction

@Entity('ledger_events')
export class LedgerEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 40 })
  kind: LedgerKind;

  // Signed from the treasury's point of view where applicable
  // (negative = money left the treasury).
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ name: 'treasury_after', type: 'numeric', precision: 14, scale: 2, nullable: true })
  treasuryAfter: string | null;

  @Column({ name: 'coord_after', type: 'numeric', precision: 14, scale: 2, nullable: true })
  coordAfter: string | null;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'coord_id', type: 'uuid', nullable: true })
  coordId: string | null;

  @Column({ name: 'kitchen_id', type: 'uuid', nullable: true })
  kitchenId: string | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
