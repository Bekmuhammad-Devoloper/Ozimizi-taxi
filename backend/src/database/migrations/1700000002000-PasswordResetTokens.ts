import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordResetTokens1700000002000 implements MigrationInterface {
  name = 'PasswordResetTokens1700000002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        token_hash varchar(128) NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_prt_driver ON password_reset_tokens(driver_id)`,
    );
    await q.query(
      `CREATE INDEX idx_prt_token ON password_reset_tokens(token_hash)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS password_reset_tokens`);
  }
}
