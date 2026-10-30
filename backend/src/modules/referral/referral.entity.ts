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
 * Referral link issued by the admin to a specific person (promoter, blogger,
 * driver…). Every new client who registers through it earns the owner
 * `rewardAmount`, which the admin hands over in cash and marks as paid.
 */
@Entity('referral_links')
export class ReferralLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 32 })
  code: string;

  @Column({ name: 'owner_name', length: 160 })
  ownerName: string;

  @Column({ name: 'owner_phone', type: 'varchar', length: 32, nullable: true })
  ownerPhone: string | null;

  @Column({
    name: 'reward_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  rewardAmount: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('referral_signups')
export class ReferralSignup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'link_id' })
  linkId: string;

  @ManyToOne(() => ReferralLink, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'link_id' })
  link: ReferralLink;

  @Index({ unique: true })
  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  // Snapshot of the link's reward at signup time, so later edits to the link
  // don't rewrite what is already owed.
  @Column({
    name: 'reward_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  rewardAmount: string;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
