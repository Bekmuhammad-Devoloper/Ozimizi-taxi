import { MigrationInterface, QueryRunner } from 'typeorm';

export class PromoReferralBranded1700000012000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Branded cars get new orders a few seconds before everyone else.
    await queryRunner.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS is_branded BOOLEAN NOT NULL DEFAULT false
    `);

    // 2. Promo codes: admin-defined discount, limited by a time window and/or
    //    by the number of clients who may claim it (first N win).
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS discount NUMERIC(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(32) NOT NULL UNIQUE,
        discount_amount NUMERIC(14,2) NOT NULL,
        max_uses INTEGER NULL,
        used_count INTEGER NOT NULL DEFAULT 0,
        starts_at TIMESTAMPTZ NULL,
        ends_at TIMESTAMPTZ NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS promo_redemptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        promo_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        amount NUMERIC(14,2) NOT NULL,
        order_id UUID NULL REFERENCES orders(id) ON DELETE SET NULL,
        used_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT promo_redemptions_uq UNIQUE (promo_id, client_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS promo_redemptions_pending_idx
        ON promo_redemptions(client_id) WHERE used_at IS NULL
    `);

    // 3. Admin-issued referral links. Each new client who registers through a
    //    link earns its owner a reward that the admin pays out in cash.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_links (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(32) NOT NULL UNIQUE,
        owner_name VARCHAR(160) NOT NULL,
        owner_phone VARCHAR(32) NULL,
        reward_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        note TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_signups (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        link_id UUID NOT NULL REFERENCES referral_links(id) ON DELETE CASCADE,
        client_id UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
        reward_amount NUMERIC(14,2) NOT NULL,
        paid_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS referral_signups_link_idx
        ON referral_signups(link_id)
    `);

    // 4. "Haydovchi bo'lish" applications collected by the client bot, plus a
    //    two-way chat thread between the applicant and the admin panel.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS driver_applications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
        telegram_id BIGINT NOT NULL,
        telegram_username VARCHAR(64) NULL,
        full_name VARCHAR(160) NOT NULL,
        phone VARCHAR(32) NOT NULL,
        car_model VARCHAR(120) NOT NULL,
        car_color VARCHAR(60) NOT NULL,
        car_plate VARCHAR(40) NOT NULL,
        car_year VARCHAR(8) NULL,
        license_photo_url VARCHAR(500) NULL,
        tech_passport_photo_url VARCHAR(500) NULL,
        car_photo_url VARCHAR(500) NULL,
        selfie_photo_url VARCHAR(500) NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'NEW',
        driver_id UUID NULL REFERENCES drivers(id) ON DELETE SET NULL,
        unread_count INTEGER NOT NULL DEFAULT 0,
        last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS driver_applications_tg_idx
        ON driver_applications(telegram_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS driver_application_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        application_id UUID NOT NULL
          REFERENCES driver_applications(id) ON DELETE CASCADE,
        sender VARCHAR(16) NOT NULL,
        text TEXT NULL,
        photo_url VARCHAR(500) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS driver_application_messages_app_idx
        ON driver_application_messages(application_id, created_at)
    `);

    await queryRunner.query(`
      INSERT INTO site_settings(key, value)
        VALUES ('branded_priority_seconds', '5')
        ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM site_settings WHERE key = 'branded_priority_seconds'`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS driver_application_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS driver_applications`);
    await queryRunner.query(`DROP TABLE IF EXISTS referral_signups`);
    await queryRunner.query(`DROP TABLE IF EXISTS referral_links`);
    await queryRunner.query(`DROP TABLE IF EXISTS promo_redemptions`);
    await queryRunner.query(`DROP TABLE IF EXISTS promo_codes`);
    await queryRunner.query(`ALTER TABLE orders DROP COLUMN IF EXISTS discount`);
    await queryRunner.query(
      `ALTER TABLE drivers DROP COLUMN IF EXISTS is_branded`,
    );
  }
}
