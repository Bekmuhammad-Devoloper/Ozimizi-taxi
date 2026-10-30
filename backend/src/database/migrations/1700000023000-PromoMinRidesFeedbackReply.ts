import { MigrationInterface, QueryRunner } from 'typeorm';

export class PromoMinRidesFeedbackReply1700000023000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Promo money unlocks only after the client has completed this many
    // rides (0 = usable right away). Set per promo by the admin.
    await queryRunner.query(`
      ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS min_rides INT NOT NULL DEFAULT 0
    `);

    // "Adminga yozish" in the bot now lands in the admin panel inbox; the
    // admin answers from there and the bot relays the reply.
    await queryRunner.query(`
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS client_id UUID NULL
    `);
    await queryRunner.query(`
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS reply_text TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE feedback DROP COLUMN IF EXISTS replied_at`);
    await queryRunner.query(`ALTER TABLE feedback DROP COLUMN IF EXISTS reply_text`);
    await queryRunner.query(`ALTER TABLE feedback DROP COLUMN IF EXISTS client_id`);
    await queryRunner.query(`ALTER TABLE feedback DROP COLUMN IF EXISTS photo_url`);
    await queryRunner.query(`ALTER TABLE promo_codes DROP COLUMN IF EXISTS min_rides`);
  }
}
