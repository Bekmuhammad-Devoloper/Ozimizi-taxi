import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Order, (order) => order.client)
  orders: Order[];
}
