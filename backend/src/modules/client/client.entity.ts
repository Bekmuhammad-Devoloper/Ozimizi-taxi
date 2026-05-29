import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../order/order.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'bigint', name: 'telegram_id' })
  telegramId: string;

  @Column({ name: 'first_name', length: 120 })
  firstName: string;

  @Column({ name: 'phone_primary', length: 32 })
  phonePrimary: string;

  @Column({ name: 'phone_secondary', type: 'varchar', length: 32, nullable: true })
  phoneSecondary: string | null;

  // Wallet, fed by referral bonuses and admin top-ups. Part of the closed
  // 100M treasury loop.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  balance: string;

  // Short shareable code (e.g. "AB12CD34") used as Telegram /start param.
  @Column({ name: 'ref_code', type: 'varchar', length: 16, nullable: true })
  refCode: string | null;

  @Column({ name: 'referred_by_id', type: 'uuid', nullable: true })
  referredById: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'referred_by_id' })
  referredBy: Client | null;

  // Cached Telegram profile photo. Path under /uploads/clients/<telegramId>.jpg.
  // Refreshed lazily by BotUpdate when missing.
  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Order, (order) => order.client)
  orders: Order[];
}
