import { MigrationInterface, QueryRunner } from 'typeorm';

export class WaitPenaltyGeo1700000019000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Waiting is now accumulated in seconds: pickup wait + every mid-ride
    // pause the driver toggles. Fee is settled at completion.
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS waiting_seconds INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS wait_started_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS cancel_penalty NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS destination_address TEXT NULL
    `);
    await queryRunner.query(`
      UPDATE orders SET waiting_seconds = waiting_minutes * 60 WHERE waiting_seconds = 0 AND waiting_minutes > 0
    `);

    // Clients: admin block + cancellation penalties.
    await queryRunner.query(`
      ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS blocked_reason TEXT NULL,
        ADD COLUMN IF NOT EXISTS cancel_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS penalty_total NUMERIC(14,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      INSERT INTO site_settings(key, value) VALUES ('cancel_penalty_amount', '0')
        ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM site_settings WHERE key = 'cancel_penalty_amount'`);
    await queryRunner.query(`
      ALTER TABLE clients
        DROP COLUMN IF EXISTS is_blocked,
        DROP COLUMN IF EXISTS blocked_reason,
        DROP COLUMN IF EXISTS cancel_count,
        DROP COLUMN IF EXISTS penalty_total
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        DROP COLUMN IF EXISTS waiting_seconds,
        DROP COLUMN IF EXISTS wait_started_at,
        DROP COLUMN IF EXISTS cancel_penalty,
        DROP COLUMN IF EXISTS destination_address
    `);
  }
}
