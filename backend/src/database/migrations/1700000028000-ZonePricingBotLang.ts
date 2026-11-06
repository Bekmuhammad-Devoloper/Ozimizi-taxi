import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - Tariff: admin-drawn zone; km driven outside it cost `outside_price_per_km`.
 * - Orders: km driven outside the zone (server tally + settled) and their fee.
 * - Bot: language each Telegram user picked (Latin / Cyrillic).
 */
export class ZonePricingBotLang1700000028000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS zone_polygon jsonb NOT NULL DEFAULT '[]'`);
    await q.query(`ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS outside_price_per_km numeric(14,2) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS server_outside_km numeric(10,3) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS outside_km numeric(10,3) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS outside_fee numeric(14,2) NOT NULL DEFAULT 0`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS telegram_langs (
        telegram_id bigint PRIMARY KEY,
        lang varchar(8) NOT NULL DEFAULT 'latn',
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS telegram_langs`);
    for (const c of ['outside_fee', 'outside_km', 'server_outside_km']) {
      await q.query(`ALTER TABLE orders DROP COLUMN IF EXISTS ${c}`);
    }
    await q.query(`ALTER TABLE tariffs DROP COLUMN IF EXISTS outside_price_per_km`);
    await q.query(`ALTER TABLE tariffs DROP COLUMN IF EXISTS zone_polygon`);
  }
}
