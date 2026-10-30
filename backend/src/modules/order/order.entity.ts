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
import { Driver } from '../driver/driver.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  ON_THE_WAY = 'ON_THE_WAY',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  /** Null for street pickups started from the driver's taximeter. */
  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  /** 'bot' | 'app' | 'street' (taximeter — client not in the system). */
  @Column({ type: 'varchar', length: 10, default: 'bot' })
  source: string;

  @ManyToOne(() => Client, (client) => client.orders, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Index()
  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  @ManyToOne(() => Driver, (driver) => driver.orders, { nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver | null;

  @Column({ name: 'pickup_lat', type: 'double precision' })
  pickupLat: number;

  @Column({ name: 'pickup_lng', type: 'double precision' })
  pickupLng: number;

  @Column({ name: 'pickup_address', type: 'text', nullable: true })
  pickupAddress: string | null;

  @Column({ name: 'destination_lat', type: 'double precision', nullable: true })
  destinationLat: number | null;

  @Column({ name: 'destination_lng', type: 'double precision', nullable: true })
  destinationLng: number | null;

  @Column({
    name: 'distance_km',
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
  })
  distanceKm: string | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  price: string | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 1000,
  })
  commission: string;

  // Promo-code discount taken off `price`. The client pays price − discount in
  // cash; the driver is compensated for the discount from the treasury.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  discount: string;

  // Part of the fare the client paid from their bonus balance (driver
  // confirmed). Moves client balance → driver balance; less cash changes hands.
  @Column({ name: 'bonus_used', type: 'numeric', precision: 14, scale: 2, default: 0 })
  bonusUsed: string;

  // Distance summed server-side from the driver's location pings while the
  // ride is IN_PROGRESS; used as a floor for the phone-reported distance.
  @Column({ name: 'server_km', type: 'numeric', precision: 10, scale: 3, default: 0 })
  serverKm: string;

  @Index()
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  // Driver reached the pickup / ride started — the gap is the waiting time.
  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'waiting_minutes', type: 'int', default: 0 })
  waitingMinutes: number;

  // Charged for waiting beyond the free minutes; added to `price`.
  @Column({ name: 'waiting_fee', type: 'numeric', precision: 14, scale: 2, default: 0 })
  waitingFee: string;

  // Total waiting (pickup wait + mid-ride pauses), settled at completion.
  @Column({ name: 'waiting_seconds', type: 'int', default: 0 })
  waitingSeconds: number;

  // Set while the driver has a mid-ride pause running.
  @Column({ name: 'wait_started_at', type: 'timestamptz', nullable: true })
  waitStartedAt: Date | null;

  // Last moment waiting was accounted (pickup wait or mid-ride pause). GPS
  // pings add the elapsed time only while the car stands still.
  @Column({ name: 'wait_tick_at', type: 'timestamptz', nullable: true })
  waitTickAt: Date | null;

  // Taken from the client's bonus when they cancelled after the driver arrived.
  @Column({ name: 'cancel_penalty', type: 'numeric', precision: 14, scale: 2, default: 0 })
  cancelPenalty: string;

  @Column({ name: 'destination_address', type: 'text', nullable: true })
  destinationAddress: string | null;

  // Sequential receipt number assigned at completion (orders_receipt_no_seq).
  @Column({ name: 'receipt_no', type: 'bigint', nullable: true })
  receiptNo: string | null;
}
