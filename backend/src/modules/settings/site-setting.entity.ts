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
  | 'referral_bonus_referrer'
  | 'branded_priority_seconds'
  | 'btn_icon_order'
  | 'btn_icon_promo'
  | 'btn_icon_invite'
  | 'btn_icon_instagram'
  | 'btn_icon_bonus'
  | 'btn_icon_become_driver'
  | 'btn_icon_contact_admin'
  | 'btn_icon_my_orders'
  | 'btn_icon_settings'
  | 'bonus_max_percent_per_ride'
  | 'cancel_penalty_amount'
  | 'driver_contract_text'
  | 'dispatch_offer_seconds'
  | 'dispatch_sequential_count'
  | 'delivery_base_fee'
  | 'delivery_free_km'
  | 'delivery_per_km'
  | 'delivery_commission_percent';

export const SETTING_KEYS: SettingKey[] = [
  'instagram_url_1',
  'instagram_url_2',
  'instagram_url_3',
  'admin_contact_url',
  'payment_bot_url',
  'referral_bonus_client',
  'referral_bonus_referrer',
  'branded_priority_seconds',
  'btn_icon_order',
  'btn_icon_promo',
  'btn_icon_invite',
  'btn_icon_instagram',
  'btn_icon_bonus',
  'btn_icon_become_driver',
  'btn_icon_contact_admin',
  'btn_icon_my_orders',
  'btn_icon_settings',
  'bonus_max_percent_per_ride',
  'cancel_penalty_amount',
  'driver_contract_text',
  'dispatch_offer_seconds',
  'dispatch_sequential_count',
  'delivery_base_fee',
  'delivery_free_km',
  'delivery_per_km',
  'delivery_commission_percent',
];
