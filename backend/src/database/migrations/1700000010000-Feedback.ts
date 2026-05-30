import { MigrationInterface, QueryRunner } from 'typeorm';

export class Feedback1700000010000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        telegram_user_id bigint NOT NULL,
        telegram_username varchar(64),
        first_name varchar(120),
        phone varchar(32),
        text text NOT NULL,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS feedback_unread_idx ON feedback(is_read) WHERE is_read = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS feedback`);
  }
}
