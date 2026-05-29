import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../order/order.entity';
import { BalanceTransaction } from '../balance/balance-transaction.entity';

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', length: 160 })
  fullName: string;

  @Index({ unique: true })
  @Column({ length: 32 })
  phone: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  balance: string;

  @Column({ name: 'is_online', default: false })
  isOnline: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Admin must approve before the driver can go online. Drivers created by
  // an admin are approved at creation time; Telegram self-registrations
  // start at false and must be approved from the admin panel.
  @Column({ name: 'is_approved', default: false })
  isApproved: boolean;

  @Column({
    name: 'current_lat',
    type: 'double precision',
    nullable: true,
  })
  currentLat: number | null;

  @Column({
    name: 'current_lng',
    type: 'double precision',
    nullable: true,
  })
  currentLng: number | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'car_model', type: 'varchar', length: 120, nullable: true })
  carModel: string | null;

  @Column({ name: 'car_color', type: 'varchar', length: 60, nullable: true })
  carColor: string | null;

  @Column({ name: 'car_plate', type: 'varchar', length: 40, nullable: true })
  carPlate: string | null;

  @Column({
    name: 'car_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  carPhotoUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @OneToMany(() => Order, (order) => order.driver)
  orders: Order[];

  @OneToMany(() => BalanceTransaction, (tx) => tx.driver)
  transactions: BalanceTransaction[];
}
