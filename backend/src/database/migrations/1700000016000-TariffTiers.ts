import { MigrationInterface, QueryRunner } from 'typeorm';

export class TariffTiers1700000016000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Distance-tier price table, e.g. [{uptoKm:0.5,price:5000},{uptoKm:1,price:7000},
    // {uptoKm:5,price:15000}]. Beyond the last tier the per-km rate applies.
    await queryRunner.query(`
      ALTER TABLE tariffs
        ADD COLUMN IF NOT EXISTS tiers JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tariffs DROP COLUMN IF EXISTS tiers`);
  }
}
