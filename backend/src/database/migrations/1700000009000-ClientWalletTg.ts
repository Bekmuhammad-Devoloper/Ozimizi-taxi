import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientWalletTg1700000009000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Clients link a Telegram chat (via @ozimizitaxi_walletbot) the
    //    same way drivers do — so the bot can DM them on top-up decisions.
    await queryRunner.query(`
      ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS wallet_telegram_id BIGINT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS clients_wallet_tg_uq
        ON clients(wallet_telegram_id)
        WHERE wallet_telegram_id IS NOT NULL
    `);

    // 2. Payment requests gain a `requested_by_client` author. Clients can
    //    now self-submit top-ups via the wallet bot. The old author check
    //    (admin XOR driver) is replaced with a three-way XOR.
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD COLUMN IF NOT EXISTS requested_by_client UUID
          REFERENCES clients(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS payment_requests_client_author_idx
        ON payment_requests(requested_by_client)
    `);
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_author_chk`,
    );
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD CONSTRAINT payment_requests_author_chk
        CHECK (
          (
            (requested_by IS NOT NULL)::int +
            (requested_by_driver IS NOT NULL)::int +
            (requested_by_client IS NOT NULL)::int
          ) = 1
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_author_chk`,
    );
    // Restore the two-way XOR from migration 1700000006000.
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD CONSTRAINT payment_requests_author_chk
        CHECK (
          (requested_by IS NOT NULL AND requested_by_driver IS NULL)
          OR
          (requested_by IS NULL AND requested_by_driver IS NOT NULL)
        )
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS payment_requests_client_author_idx`,
    );
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP COLUMN IF EXISTS requested_by_client`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS clients_wallet_tg_uq`);
    await queryRunner.query(
      `ALTER TABLE clients DROP COLUMN IF EXISTS wallet_telegram_id`,
    );
  }
}
