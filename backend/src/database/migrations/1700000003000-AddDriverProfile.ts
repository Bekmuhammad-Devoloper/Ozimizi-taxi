import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverProfile1700000003000 implements MigrationInterface {
  name = 'AddDriverProfile1700000003000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE drivers
        ADD COLUMN avatar_url varchar(500),
        ADD COLUMN car_model varchar(120),
        ADD COLUMN car_color varchar(60),
        ADD COLUMN car_plate varchar(40),
        ADD COLUMN car_photo_url varchar(500)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE drivers
        DROP COLUMN IF EXISTS avatar_url,
        DROP COLUMN IF EXISTS car_model,
        DROP COLUMN IF EXISTS car_color,
        DROP COLUMN IF EXISTS car_plate,
        DROP COLUMN IF EXISTS car_photo_url
    `);
  }
}
