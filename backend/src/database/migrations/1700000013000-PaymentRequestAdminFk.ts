import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentRequestAdminFk1700000013000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Deleting a coordinator failed with a FK violation once they had made
    // any transfer (payment_requests.requested_by). Keep the audit rows but
    // let the admin reference go NULL when the account is removed.
    await queryRunner.query(`
      ALTER TABLE payment_requests ALTER COLUMN requested_by DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_requests
        DROP CONSTRAINT IF EXISTS payment_requests_requested_by_fkey,
        ADD CONSTRAINT payment_requests_requested_by_fkey
          FOREIGN KEY (requested_by) REFERENCES admins(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payment_requests
        DROP CONSTRAINT IF EXISTS payment_requests_decided_by_fkey,
        ADD CONSTRAINT payment_requests_decided_by_fkey
          FOREIGN KEY (decided_by) REFERENCES admins(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_requests
        DROP CONSTRAINT IF EXISTS payment_requests_decided_by_fkey,
        ADD CONSTRAINT payment_requests_decided_by_fkey
          FOREIGN KEY (decided_by) REFERENCES admins(id)
    `);
    await queryRunner.query(`
      ALTER TABLE payment_requests
        DROP CONSTRAINT IF EXISTS payment_requests_requested_by_fkey,
        ADD CONSTRAINT payment_requests_requested_by_fkey
          FOREIGN KEY (requested_by) REFERENCES admins(id)
    `);
  }
}
