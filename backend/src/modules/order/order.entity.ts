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
  @Column({ name: 'client_id' })
  clientId: string;

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
}
