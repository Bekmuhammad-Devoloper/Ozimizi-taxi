import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AnnouncementAudience = 'drivers' | 'clients' | 'all';

/** Admin broadcast: pushed to driver apps and/or sent to clients via the bot. */
@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 160 })
  title: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'varchar', length: 16, default: 'all' })
  audience: AnnouncementAudience;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'sent_clients', type: 'int', default: 0 })
  sentClients: number;

  @Column({ name: 'sent_drivers', type: 'int', default: 0 })
  sentDrivers: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
