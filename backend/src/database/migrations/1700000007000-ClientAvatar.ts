import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientAvatar1700000007000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE clients DROP COLUMN IF EXISTS avatar_url`,
    );
  }
}
