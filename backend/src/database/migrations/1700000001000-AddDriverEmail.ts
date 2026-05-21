import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverEmail1700000001000 implements MigrationInterface {
  name = 'AddDriverEmail1700000001000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE drivers ADD COLUMN email varchar(160)`);
    await q.query(
      `CREATE UNIQUE INDEX idx_drivers_email ON drivers(email) WHERE email IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_drivers_email`);
    await q.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS email`);
  }
}
