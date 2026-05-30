import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientAvatar1700000007000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cached Telegram profile photo. avatar_fetched_at lets the bot
    // skip re-downloading more than once per week.
    await queryRunner.query(`
      ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS avatar_url TEXT,
        ADD COLUMN IF NOT EXISTS avatar_fetched_at TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE clients
        DROP COLUMN IF EXISTS avatar_fetched_at,
        DROP COLUMN IF EXISTS avatar_url
    `);
  }
}
