import { MigrationInterface, QueryRunner } from 'typeorm';

export class BonusAndCommissionPct1700000015000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Client pays part of a ride from bonus; driver confirms in the app.
    await queryRunner.query(`ALTER TYPE balance_tx_type ADD VALUE IF NOT EXISTS 'BONUS'`);
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS bonus_used NUMERIC(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bonus_payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        amount NUMERIC(14,2) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at TIMESTAMPTZ NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS bonus_payments_driver_pending_idx
        ON bonus_payments(driver_id) WHERE status = 'PENDING'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS bonus_payments_order_idx ON bonus_payments(order_id)
    `);

    // Commission as a percentage of the fare; 0 keeps the fixed amount.
    await queryRunner.query(`
      ALTER TABLE tariffs
        ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tariffs DROP COLUMN IF EXISTS commission_percent`);
    await queryRunner.query(`DROP TABLE IF EXISTS bonus_payments`);
    await queryRunner.query(`ALTER TABLE orders DROP COLUMN IF EXISTS bonus_used`);
    // Enum values cannot be dropped in Postgres; 'BONUS' stays.
  }
}
