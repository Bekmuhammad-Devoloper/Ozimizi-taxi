import { MigrationInterface, QueryRunner } from 'typeorm';

export class WaitingChatAnnouncements1700000018000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Waiting time: first N minutes at the pickup are free, then per-minute.
    await queryRunner.query(`
      ALTER TABLE tariffs
        ADD COLUMN IF NOT EXISTS waiting_free_minutes INTEGER NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS waiting_price_per_minute NUMERIC(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS waiting_minutes INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS waiting_fee NUMERIC(14,2) NOT NULL DEFAULT 0
    `);

    // Driver <-> passenger chat for an active order.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS order_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        sender VARCHAR(8) NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS order_messages_order_idx
        ON order_messages(order_id, created_at)
    `);

    // Admin broadcasts to drivers (app) and/or clients (bot).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(160) NOT NULL,
        text TEXT NOT NULL,
        audience VARCHAR(16) NOT NULL DEFAULT 'all',
        created_by UUID NULL REFERENCES admins(id) ON DELETE SET NULL,
        sent_clients INTEGER NOT NULL DEFAULT 0,
        sent_drivers INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Share of a ride's fare a client may cover from bonus balance (0 = no cap).
    await queryRunner.query(`
      INSERT INTO site_settings(key, value) VALUES ('bonus_max_percent_per_ride', '0')
        ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM site_settings WHERE key = 'bonus_max_percent_per_ride'`);
    await queryRunner.query(`DROP TABLE IF EXISTS announcements`);
    await queryRunner.query(`DROP TABLE IF EXISTS order_messages`);
    await queryRunner.query(`
      ALTER TABLE orders
        DROP COLUMN IF EXISTS arrived_at,
        DROP COLUMN IF EXISTS started_at,
        DROP COLUMN IF EXISTS waiting_minutes,
        DROP COLUMN IF EXISTS waiting_fee
    `);
    await queryRunner.query(`
      ALTER TABLE tariffs
        DROP COLUMN IF EXISTS waiting_free_minutes,
        DROP COLUMN IF EXISTS waiting_price_per_minute
    `);
  }
}
