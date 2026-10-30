import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentRequestAuthorChk1700000014000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // requested_by is now SET NULL when a coordinator account is deleted,
    // so an audit row may end up with no author at all. Allow that
    // (at most one author) instead of exactly one.
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_author_chk`,
    );
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD CONSTRAINT payment_requests_author_chk
        CHECK (
          (
            (requested_by IS NOT NULL)::int +
            (requested_by_driver IS NOT NULL)::int +
            (requested_by_client IS NOT NULL)::int
          ) <= 1
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_author_chk`,
    );
    await queryRunner.query(`
      ALTER TABLE payment_requests
        ADD CONSTRAINT payment_requests_author_chk
        CHECK (
          (
            (requested_by IS NOT NULL)::int +
            (requested_by_driver IS NOT NULL)::int +
            (requested_by_client IS NOT NULL)::int
          ) = 1
        )
    `);
  }
}
