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

export enum DriverApplicationStatus {
  NEW = 'NEW',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** "🚕 Haydovchi bo‘lish" form submitted through the client bot. */
@Entity('driver_applications')
export class DriverApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client: Client | null;

  @Index()
  @Column({ name: 'telegram_id', type: 'bigint' })
  telegramId: string;

  @Column({
    name: 'telegram_username',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  telegramUsername: string | null;

  @Column({ name: 'full_name', length: 160 })
  fullName: string;

  @Column({ length: 32 })
  phone: string;

  @Column({ name: 'car_model', length: 120 })
  carModel: string;

  @Column({ name: 'car_color', length: 60 })
  carColor: string;

  @Column({ name: 'car_plate', length: 40 })
  carPlate: string;

  @Column({ name: 'car_year', type: 'varchar', length: 8, nullable: true })
  carYear: string | null;

  // Registered as self-employed for passenger transport (null = not asked).
  @Column({ name: 'self_employed', type: 'boolean', nullable: true })
  selfEmployed: boolean | null;

  // Applicant agreed to the driver contract when submitting.
  @Column({ name: 'contract_accepted', default: false })
  contractAccepted: boolean;

  @Column({
    name: 'license_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  licensePhotoUrl: string | null;

  @Column({
    name: 'tech_passport_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  techPassportPhotoUrl: string | null;

  @Column({
    name: 'car_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  carPhotoUrl: string | null;

  @Column({
    name: 'selfie_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  selfiePhotoUrl: string | null;

  @Column({ type: 'varchar', length: 16, default: DriverApplicationStatus.NEW })
  status: DriverApplicationStatus;

  // Driver account created when the admin approves the application.
  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  // Applicant messages the admin hasn't opened yet.
  @Column({ name: 'unread_count', type: 'int', default: 0 })
  unreadCount: number;

  @Column({ name: 'last_message_at', type: 'timestamptz' })
  lastMessageAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

export type ApplicationMessageSender = 'applicant' | 'admin' | 'system';

@Entity('driver_application_messages')
export class DriverApplicationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id' })
  applicationId: string;

  @ManyToOne(() => DriverApplication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application: DriverApplication;

  @Column({ type: 'varchar', length: 16 })
  sender: ApplicationMessageSender;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
