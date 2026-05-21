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
import { Order } from '../order/order.entity';

export enum BalanceTxType {
  COMMISSION = 'COMMISSION',
  TOPUP = 'TOPUP',
  WITHDRAW = 'WITHDRAW',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('balance_transactions')
export class BalanceTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'driver_id' })
  driverId: string;

  @ManyToOne(() => Driver, (driver) => driver.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'enum', enum: BalanceTxType })
  type: BalanceTxType;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
