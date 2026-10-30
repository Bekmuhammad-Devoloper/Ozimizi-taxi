import { MigrationInterface, QueryRunner } from 'typeorm';

export class PromoPartialServerKm1700000017000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // A promo discount is no longer spent in one ride: each ride may use at
    // most `max_percent_per_ride` of its fare, the rest carries over.
    await queryRunner.query(`
      ALTER TABLE promo_codes
        ADD COLUMN IF NOT EXISTS max_percent_per_ride NUMERIC(5,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE promo_redemptions
        ADD COLUMN IF NOT EXISTS remaining NUMERIC(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE promo_redemptions
        SET remaining = CASE WHEN used_at IS NULL THEN amount ELSE 0 END
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS promo_redemptions_open_idx
        ON promo_redemptions(client_id) WHERE remaining > 0
    `);

    // Distance measured server-side from the driver's location pings while
    // the ride is IN_PROGRESS — a safety net when the phone under-counts.
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS server_km NUMERIC(10,3) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE orders DROP COLUMN IF EXISTS server_km`);
    await queryRunner.query(`DROP INDEX IF EXISTS promo_redemptions_open_idx`);
    await queryRunner.query(`ALTER TABLE promo_redemptions DROP COLUMN IF EXISTS remaining`);
    await queryRunner.query(`ALTER TABLE promo_codes DROP COLUMN IF EXISTS max_percent_per_ride`);
  }
}
