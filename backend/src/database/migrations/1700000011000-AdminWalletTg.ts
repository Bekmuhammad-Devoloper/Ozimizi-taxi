import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminWalletTg1700000011000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Admins (incl. coordinators) can link a Telegram chat (via
    // @ozimizitaxi_walletbot) the same way drivers and clients do —
    // so the bot can DM them new pending requests and accept
    // inline approve/reject actions.
    await queryRunner.query(`
      ALTER TABLE admins
        ADD COLUMN IF NOT EXISTS wallet_telegram_id BIGINT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS admins_wallet_tg_uq
        ON admins(wallet_telegram_id)
        WHERE wallet_telegram_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS admins_wallet_tg_uq`);
    await queryRunner.query(
      `ALTER TABLE admins DROP COLUMN IF EXISTS wallet_telegram_id`,
    );
  }
}
