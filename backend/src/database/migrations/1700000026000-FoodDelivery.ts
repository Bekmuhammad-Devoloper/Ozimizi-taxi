import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Food delivery: kitchens (own panel login), menu, food orders delivered by
 * taxi drivers or dedicated couriers, and a step-by-step order timeline.
 */
export class FoodDelivery1700000026000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS kitchens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        phone varchar(32) NULL,
        address varchar(255) NULL,
        lat double precision NOT NULL,
        lng double precision NOT NULL,
        logo_url varchar(500) NULL,
        description text NULL,
        username varchar(64) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        is_open boolean NOT NULL DEFAULT true,
        prep_minutes int NOT NULL DEFAULT 20,
        min_order numeric(14,2) NOT NULL DEFAULT 0,
        commission_percent numeric(5,2) NOT NULL DEFAULT 10,
        sort int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS menu_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kitchen_id uuid NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
        name varchar(80) NOT NULL,
        sort int NOT NULL DEFAULT 0
      )
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kitchen_id uuid NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
        category_id uuid NULL REFERENCES menu_categories(id) ON DELETE SET NULL,
        name varchar(120) NOT NULL,
        description text NULL,
        price numeric(14,2) NOT NULL,
        photo_url varchar(500) NULL,
        is_available boolean NOT NULL DEFAULT true,
        sort int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_menu_items_kitchen ON menu_items (kitchen_id, sort)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS food_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        number serial,
        client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
        kitchen_id uuid NOT NULL REFERENCES kitchens(id) ON DELETE RESTRICT,
        courier_id uuid NULL REFERENCES drivers(id) ON DELETE SET NULL,
        status varchar(16) NOT NULL DEFAULT 'NEW',
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        items_total numeric(14,2) NOT NULL DEFAULT 0,
        delivery_fee numeric(14,2) NOT NULL DEFAULT 0,
        total numeric(14,2) NOT NULL DEFAULT 0,
        distance_km numeric(8,2) NULL,
        courier_commission numeric(14,2) NOT NULL DEFAULT 0,
        kitchen_commission numeric(14,2) NOT NULL DEFAULT 0,
        address varchar(255) NULL,
        lat double precision NOT NULL,
        lng double precision NOT NULL,
        phone varchar(32) NULL,
        comment text NULL,
        source varchar(8) NOT NULL DEFAULT 'app',
        prep_minutes int NULL,
        reject_reason varchar(255) NULL,
        cancelled_by varchar(16) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        accepted_at timestamptz NULL,
        ready_at timestamptz NULL,
        courier_assigned_at timestamptz NULL,
        picked_up_at timestamptz NULL,
        delivered_at timestamptz NULL,
        cancelled_at timestamptz NULL
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_food_orders_kitchen ON food_orders (kitchen_id, created_at DESC)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_food_orders_client ON food_orders (client_id, created_at DESC)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_food_orders_status ON food_orders (status)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS food_order_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        food_order_id uuid NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
        kind varchar(32) NOT NULL,
        driver_id uuid NULL,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_food_order_events_order ON food_order_events (food_order_id, created_at)`);

    // Drivers: taxi (car) or dedicated courier (foot/bike/moto, delivery only).
    await q.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'taxi'`);
    await q.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS accept_delivery boolean NOT NULL DEFAULT true`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS accept_delivery`);
    await q.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS kind`);
    await q.query(`DROP TABLE IF EXISTS food_order_events`);
    await q.query(`DROP TABLE IF EXISTS food_orders`);
    await q.query(`DROP TABLE IF EXISTS menu_items`);
    await q.query(`DROP TABLE IF EXISTS menu_categories`);
    await q.query(`DROP TABLE IF EXISTS kitchens`);
  }
}
