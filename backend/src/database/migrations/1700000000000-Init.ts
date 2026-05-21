import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1700000000000 implements MigrationInterface {
  name = 'Init1700000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await q.query(`
      CREATE TABLE clients (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        telegram_id bigint NOT NULL UNIQUE,
        first_name varchar(120) NOT NULL,
        phone_primary varchar(32) NOT NULL,
        phone_secondary varchar(32),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE drivers (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        full_name varchar(160) NOT NULL,
        phone varchar(32) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        balance numeric(14,2) NOT NULL DEFAULT 0,
        is_online boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        current_lat double precision,
        current_lng double precision,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);

    await q.query(`
      CREATE TYPE order_status AS ENUM (
        'PENDING','ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED'
      )
    `);

    await q.query(`
      CREATE TABLE orders (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id uuid NOT NULL REFERENCES clients(id),
        driver_id uuid REFERENCES drivers(id),
        pickup_lat double precision NOT NULL,
        pickup_lng double precision NOT NULL,
        pickup_address text,
        destination_lat double precision,
        destination_lng double precision,
        distance_km numeric(10,3),
        price numeric(14,2),
        commission numeric(14,2) NOT NULL DEFAULT 1000,
        status order_status NOT NULL DEFAULT 'PENDING',
        created_at timestamptz NOT NULL DEFAULT now(),
        accepted_at timestamptz,
        completed_at timestamptz,
        cancelled_at timestamptz
      )
    `);
    await q.query(`CREATE INDEX idx_orders_client_id ON orders(client_id)`);
    await q.query(`CREATE INDEX idx_orders_driver_id ON orders(driver_id)`);
    await q.query(`CREATE INDEX idx_orders_status ON orders(status)`);

    await q.query(`
      CREATE TYPE balance_tx_type AS ENUM ('COMMISSION','TOPUP','WITHDRAW','ADJUSTMENT')
    `);

    await q.query(`
      CREATE TABLE balance_transactions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        amount numeric(14,2) NOT NULL,
        type balance_tx_type NOT NULL,
        order_id uuid REFERENCES orders(id),
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_btx_driver ON balance_transactions(driver_id)`);

    await q.query(`
      CREATE TABLE tariffs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        price_per_km numeric(14,2) NOT NULL DEFAULT 2000,
        minimum_fare numeric(14,2) NOT NULL DEFAULT 10000,
        commission_per_order numeric(14,2) NOT NULL DEFAULT 1000,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE admins (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        username varchar(64) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS admins`);
    await q.query(`DROP TABLE IF EXISTS tariffs`);
    await q.query(`DROP TABLE IF EXISTS balance_transactions`);
    await q.query(`DROP TYPE IF EXISTS balance_tx_type`);
    await q.query(`DROP TABLE IF EXISTS orders`);
    await q.query(`DROP TYPE IF EXISTS order_status`);
    await q.query(`DROP TABLE IF EXISTS drivers`);
    await q.query(`DROP TABLE IF EXISTS clients`);
  }
}
