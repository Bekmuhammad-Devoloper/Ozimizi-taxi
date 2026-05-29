import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  username: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  // 'admin' — full access; 'coordinator' — super-admin lite: can submit
  // top-up/withdraw requests but cannot see treasury totals or any aggregate
  // money flow. Only the primary admin sees the full 100M pool.
  @Column({ length: 20, default: 'admin' })
  role: 'admin' | 'coordinator';

  // Treasury balance. Closed-loop invariant: this + sum(drivers.balance)
  // + sum(clients.balance) + sum(payment_requests.PENDING) = 100_000_000.
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  balance: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
