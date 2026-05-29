import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Driver } from '../driver/driver.entity';
import { Admin } from '../admin/admin.entity';

export enum PaymentRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('payment_requests')
export class PaymentRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  // Positive = top-up, negative = withdrawal.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Index()
  @Column({
    type: 'enum',
    enum: PaymentRequestStatus,
    enumName: 'payment_request_status',
    default: PaymentRequestStatus.PENDING,
  })
  status: PaymentRequestStatus;

  // Either admin/coordinator (requestedBy) OR driver (requestedByDriver),
  // never both. Enforced by a DB check constraint.
  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  @ManyToOne(() => Admin, { nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requester: Admin | null;

  @Column({ name: 'requested_by_driver', type: 'uuid', nullable: true })
  requestedByDriver: string | null;

  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'requested_by_driver' })
  driverRequester: Driver | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @ManyToOne(() => Admin, { nullable: true })
  @JoinColumn({ name: 'decided_by' })
  decider: Admin | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;
}
