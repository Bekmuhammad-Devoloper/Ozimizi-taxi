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

  // Branded (company-livery) cars receive new orders a few seconds before
  // everyone else — see `branded_priority_seconds` in site settings.
  @Column({ name: 'is_branded', default: false })
  isBranded: boolean;

  /** 'taxi' (car: rides + deliveries) or 'courier' (deliveries only). */
  @Column({ type: 'varchar', length: 16, default: 'taxi' })
  kind: 'taxi' | 'courier';

  /** A taxi driver may opt out of food deliveries. */
  @Column({ name: 'accept_delivery', default: true })
  acceptDelivery: boolean;

  /** App version the driver last used ('1.0.6', 'web', …) and when. */
  @Column({ name: 'app_version', type: 'varchar', length: 32, nullable: true })
  appVersion: string | null;

  @Column({ name: 'app_platform', type: 'varchar', length: 16, nullable: true })
  appPlatform: string | null;

  @Column({ name: 'app_seen_at', type: 'timestamptz', nullable: true })
  appSeenAt: Date | null;

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

  // Set when the driver runs /start in @ozimizitaxi_walletbot and shares their
  // contact. Used by the wallet bot to DM withdrawal/top-up verdicts.
  @Index({ unique: true, where: 'wallet_telegram_id IS NOT NULL' })
  @Column({
    name: 'wallet_telegram_id',
    type: 'bigint',
    nullable: true,
  })
  walletTelegramId: string | null;

  // Driver accepted the agreement (register form / first-login gate).
  // Documents (admin-managed; photos from the bot questionnaire are copied in).
  @Column({ name: 'license_photo_url', type: 'varchar', length: 500, nullable: true })
  licensePhotoUrl: string | null;

  @Column({ name: 'tech_passport_photo_url', type: 'varchar', length: 500, nullable: true })
  techPassportPhotoUrl: string | null;

  @Column({ name: 'license_number', type: 'varchar', length: 64, nullable: true })
  licenseNumber: string | null;

  @Column({ name: 'license_expires_at', type: 'date', nullable: true })
  licenseExpiresAt: string | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ name: 'contract_accepted_at', type: 'timestamptz', nullable: true })
  contractAcceptedAt: Date | null;

  // When the admin approved them (null = still pending).
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

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
