import { MigrationInterface, QueryRunner } from 'typeorm';

export class WalletBot1700000006000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drivers can now link a Telegram chat (via @ozimizitaxi_walletbot) so the
    // backend can DM them on payment-request decisions.
    await queryRunner.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS wallet_telegram_id BIGINT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS drivers_wallet_tg_uq
        ON drivers(wallet_telegram_id)
        WHERE wallet_telegram_id IS NOT NULL
    `);

    // Allow drivers to author payment requests directly. Either requested_by
    // (admin/coordinator) or requested_by_driver must be set, never both.
    await queryRunner.query(
      `ALTER TABLE payment_requests ALTER COLUMN requested_by DROP NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD COLUMN IF NOT EXISTS requested_by_driver UUID
          REFERENCES drivers(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS payment_requests_driver_author_idx
        ON payment_requests(requested_by_driver)
    `);
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD CONSTRAINT payment_requests_author_chk
        CHECK (
          (requested_by IS NOT NULL AND requested_by_driver IS NULL)
          OR
          (requested_by IS NULL AND requested_by_driver IS NOT NULL)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_author_chk`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS payment_requests_driver_author_idx`,
    );
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP COLUMN IF EXISTS requested_by_driver`,
    );
    await queryRunner.query(
      `ALTER TABLE payment_requests ALTER COLUMN requested_by SET NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS drivers_wallet_tg_uq`);
    await queryRunner.query(
      `ALTER TABLE drivers DROP COLUMN IF EXISTS wallet_telegram_id`,
    );
  }
}
