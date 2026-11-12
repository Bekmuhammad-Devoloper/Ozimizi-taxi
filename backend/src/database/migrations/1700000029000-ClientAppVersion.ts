import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clients: the version of the Android app they use (reported by the app), so a
 * new client APK is sent by the bot only to people who actually have the app.
 */
export class ClientAppVersion1700000029000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS app_version varchar(32) NULL`);
    await q.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS app_seen_at timestamptz NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE clients DROP COLUMN IF EXISTS app_seen_at`);
    await q.query(`ALTER TABLE clients DROP COLUMN IF EXISTS app_version`);
  }
}
