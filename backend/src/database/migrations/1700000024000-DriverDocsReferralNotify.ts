import { MigrationInterface, QueryRunner } from 'typeorm';

export class DriverDocsReferralNotify1700000024000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Driver documents the admin can view/replace from the panel.
    await queryRunner.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_photo_url VARCHAR(500) NULL`);
    await queryRunner.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS tech_passport_photo_url VARCHAR(500) NULL`);
    await queryRunner.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number VARCHAR(64) NULL`);
    await queryRunner.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expires_at DATE NULL`);
    await queryRunner.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NULL`);
    // Drivers approved from the bot questionnaire already sent these photos.
    await queryRunner.query(`
      UPDATE drivers d
         SET license_photo_url = COALESCE(d.license_photo_url, a.license_photo_url),
             tech_passport_photo_url = COALESCE(d.tech_passport_photo_url, a.tech_passport_photo_url)
        FROM driver_applications a
       WHERE a.driver_id = d.id AND a.status = 'APPROVED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS password_changed_at`);
    await queryRunner.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS license_expires_at`);
    await queryRunner.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS license_number`);
    await queryRunner.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS tech_passport_photo_url`);
    await queryRunner.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS license_photo_url`);
  }
}
