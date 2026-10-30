import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - Kitchens: balance (admin tops up, commission is taken from it), own
 *   couriers, per-kitchen delivery pricing + "farther than N km → taxi".
 * - Food orders: self-pickup, kitchen's own delivery, bonus part-payment,
 *   multi-kitchen groups, orders typed in by the kitchen (no client account).
 * - Menu items: dish / raw material / semi-finished.
 * - Taxi orders: street pickups via the driver's taximeter (no client).
 * - Drivers: app version reported by the app.
 */
export class KitchenBalanceStreetVersions1700000027000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS balance numeric(14,2) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS needs_courier boolean NOT NULL DEFAULT true`);
    await q.query(`ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS delivery_pricing varchar(8) NOT NULL DEFAULT 'custom'`);
    await q.query(`ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS delivery_base_fee numeric(14,2) NULL`);
    await q.query(`ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS delivery_free_km numeric(6,2) NULL`);
    await q.query(`ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS delivery_per_km numeric(14,2) NULL`);
    await q.query(`ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS courier_max_km numeric(6,2) NULL`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS kitchen_couriers (
        kitchen_id uuid NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
        driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (kitchen_id, driver_id)
      )
    `);

    await q.query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS kind varchar(8) NOT NULL DEFAULT 'dish'`);

    await q.query(`ALTER TABLE food_orders ALTER COLUMN client_id DROP NOT NULL`);
    await q.query(`ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS client_name varchar(120) NULL`);
    await q.query(`ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS delivery_type varchar(10) NOT NULL DEFAULT 'delivery'`);
    await q.query(`ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS needs_courier boolean NOT NULL DEFAULT true`);
    await q.query(`ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS courier_mode varchar(8) NOT NULL DEFAULT 'courier'`);
    await q.query(`ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS bonus_used numeric(14,2) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS group_id uuid NULL`);
    await q.query(`ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS created_by varchar(10) NOT NULL DEFAULT 'client'`);

    await q.query(`ALTER TABLE orders ALTER COLUMN client_id DROP NOT NULL`);
    await q.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source varchar(10) NOT NULL DEFAULT 'bot'`);

    await q.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS app_version varchar(32) NULL`);
    await q.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS app_platform varchar(16) NULL`);
    await q.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS app_seen_at timestamptz NULL`);

    await q.query(`ALTER TABLE ledger_events ADD COLUMN IF NOT EXISTS kitchen_id uuid NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ledger_events DROP COLUMN IF EXISTS kitchen_id`);
    for (const c of ['app_seen_at', 'app_platform', 'app_version']) await q.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS ${c}`);
    await q.query(`ALTER TABLE orders DROP COLUMN IF EXISTS source`);
    for (const c of ['created_by', 'group_id', 'bonus_used', 'courier_mode', 'needs_courier', 'delivery_type', 'client_name']) {
      await q.query(`ALTER TABLE food_orders DROP COLUMN IF EXISTS ${c}`);
    }
    await q.query(`ALTER TABLE menu_items DROP COLUMN IF EXISTS kind`);
    await q.query(`DROP TABLE IF EXISTS kitchen_couriers`);
    for (const c of ['courier_max_km', 'delivery_per_km', 'delivery_free_km', 'delivery_base_fee', 'delivery_pricing', 'needs_courier', 'balance']) {
      await q.query(`ALTER TABLE kitchens DROP COLUMN IF EXISTS ${c}`);
    }
  }
}
