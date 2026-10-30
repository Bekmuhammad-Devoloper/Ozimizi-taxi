import { MigrationInterface, QueryRunner } from 'typeorm';

export class WaitTickSelfEmployed1700000021000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Waiting is now metered from GPS pings: time counts only while the car
    // stands still. wait_tick_at = last moment accounted.
    await queryRunner.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS wait_tick_at TIMESTAMPTZ NULL
    `);
    // Rides in flight at deploy time keep counting from now (pickup wait)
    // or from when their pause started.
    await queryRunner.query(`
      UPDATE orders SET wait_tick_at = now() WHERE status = 'ARRIVED' AND wait_tick_at IS NULL
    `);
    await queryRunner.query(`
      UPDATE orders SET wait_tick_at = wait_started_at
       WHERE status = 'IN_PROGRESS' AND wait_started_at IS NOT NULL AND wait_tick_at IS NULL
    `);

    // Driver questionnaire: registered as self-employed for passenger transport?
    await queryRunner.query(`
      ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS self_employed BOOLEAN NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE driver_applications DROP COLUMN IF EXISTS self_employed`);
    await queryRunner.query(`ALTER TABLE orders DROP COLUMN IF EXISTS wait_tick_at`);
  }
}
