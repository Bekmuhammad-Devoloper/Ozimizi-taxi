import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('feedback')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'telegram_user_id', type: 'bigint' })
  telegramUserId: string;

  @Column({ name: 'telegram_username', type: 'varchar', length: 64, nullable: true })
  telegramUsername: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 120, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'text' })
  text: string;

  // Optional photo sent with the message (served under /uploads).
  @Column({ name: 'photo_url', type: 'varchar', length: 512, nullable: true })
  photoUrl: string | null;

  // Registered client who wrote it, when known.
  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  // Admin's answer from the panel (relayed to Telegram by the bot).
  @Column({ name: 'reply_text', type: 'text', nullable: true })
  replyText: string | null;

  @Column({ name: 'replied_at', type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  @Index()
  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
