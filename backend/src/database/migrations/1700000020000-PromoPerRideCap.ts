import { MigrationInterface, QueryRunner } from 'typeorm';

export class PromoPerRideCap1700000020000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Per-promo limit on how much of its money may be spent on one ride:
    // a % of the fare (max_percent_per_ride, existing) and/or a so'm amount.
    await queryRunner.query(`
      ALTER TABLE promo_codes
        ADD COLUMN IF NOT EXISTS max_amount_per_ride NUMERIC(14,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE promo_codes DROP COLUMN IF EXISTS max_amount_per_ride`);
  }
}
