import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('site_settings')
export class SiteSetting {
  @PrimaryColumn({ length: 64 })
  key: string;

  @Column({ type: 'text', default: '' })
  value: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export type SettingKey =
  | 'instagram_url_1'
  | 'instagram_url_2'
  | 'instagram_url_3'
  | 'admin_contact_url'
  | 'payment_bot_url'
  | 'referral_bonus_client'
  | 'referral_bonus_referrer';

export const SETTING_KEYS: SettingKey[] = [
  'instagram_url_1',
  'instagram_url_2',
  'instagram_url_3',
  'admin_contact_url',
  'payment_bot_url',
  'referral_bonus_client',
  'referral_bonus_referrer',
];
