import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReceiptContractLedger1700000022000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- receipts: sequential number per completed ride ------------------
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS orders_receipt_no_seq START 1001`);
    await queryRunner.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_no BIGINT NULL`);
    await queryRunner.query(`
      UPDATE orders o SET receipt_no = s.rn
        FROM (SELECT id, 1000 + ROW_NUMBER() OVER (ORDER BY completed_at, created_at) AS rn
                FROM orders WHERE status = 'COMPLETED') s
       WHERE o.id = s.id AND o.receipt_no IS NULL
    `);
    await queryRunner.query(`
      SELECT setval('orders_receipt_no_seq', GREATEST(1000, (SELECT COALESCE(MAX(receipt_no), 1000) FROM orders)) + 1, false)
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_receipt_no ON orders(receipt_no)`);

    // --- drivers: contract acceptance + approval date ---------------------
    await queryRunner.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS contract_accepted_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`UPDATE drivers SET approved_at = created_at WHERE is_approved = true AND approved_at IS NULL`);

    // --- questionnaire: the applicant agreed to the contract --------------
    await queryRunner.query(`
      ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS contract_accepted BOOLEAN NOT NULL DEFAULT false
    `);

    // --- treasury journal: every movement that touches the treasury or a
    // coordinator purse, with the balance after it, so drift is traceable.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ledger_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kind VARCHAR(40) NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        treasury_after NUMERIC(14,2) NULL,
        coord_after NUMERIC(14,2) NULL,
        driver_id UUID NULL,
        client_id UUID NULL,
        coord_id UUID NULL,
        order_id UUID NULL,
        note TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ledger_events_created ON ledger_events(created_at DESC)`);

    await queryRunner.query(`
      INSERT INTO site_settings(key, value) VALUES ('driver_contract_text', '') ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM site_settings WHERE key = 'driver_contract_text'`);
    await queryRunner.query(`DROP TABLE IF EXISTS ledger_events`);
    await queryRunner.query(`ALTER TABLE driver_applications DROP COLUMN IF EXISTS contract_accepted`);
    await queryRunner.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS contract_accepted_at, DROP COLUMN IF EXISTS approved_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_orders_receipt_no`);
    await queryRunner.query(`ALTER TABLE orders DROP COLUMN IF EXISTS receipt_no`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS orders_receipt_no_seq`);
  }
}
