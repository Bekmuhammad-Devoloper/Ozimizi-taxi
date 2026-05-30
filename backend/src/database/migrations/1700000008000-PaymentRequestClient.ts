import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentRequestClient1700000008000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Allow coordinators to send/withdraw money for clients too, not just
    // drivers. A request now targets either a driver OR a client, never
    // both (enforced by the new check constraint below).
    await queryRunner.query(
      `ALTER TABLE payment_requests ALTER COLUMN driver_id DROP NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD COLUMN IF NOT EXISTS client_id UUID
          REFERENCES clients(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS payment_requests_client_idx
        ON payment_requests(client_id)
    `);
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD CONSTRAINT payment_requests_target_chk
        CHECK (
          (driver_id IS NOT NULL AND client_id IS NULL)
          OR
          (driver_id IS NULL AND client_id IS NOT NULL)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_target_chk`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS payment_requests_client_idx`,
    );
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP COLUMN IF EXISTS client_id`,
    );
    // NOTE: not reasserting NOT NULL on driver_id — there may be client-only
    // rows by this point; reverting would lose data.
  }
}
