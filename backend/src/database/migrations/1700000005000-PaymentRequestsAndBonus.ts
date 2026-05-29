import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentRequestsAndBonus1700000005000
  implements MigrationInterface
{
  name = 'PaymentRequestsAndBonus1700000005000';

  public async up(q: QueryRunner): Promise<void> {
    // Admin/coordinator split.
    await q.query(
      `ALTER TABLE admins ADD COLUMN role varchar(20) NOT NULL DEFAULT 'admin'`,
    );

    // Coordinator-submitted top-up / withdraw queue. Admin must approve before
    // the actual balance move happens. Coordinators never see treasury totals
    // or other coordinators' requests — only their own queue.
    await q.query(
      `CREATE TYPE payment_request_status AS ENUM ('PENDING','APPROVED','REJECTED')`,
    );
    await q.query(`
      CREATE TABLE payment_requests (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        amount numeric(14,2) NOT NULL,
        status payment_request_status NOT NULL DEFAULT 'PENDING',
        requested_by uuid NOT NULL REFERENCES admins(id),
        decided_by uuid REFERENCES admins(id),
        note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz
      )
    `);
    await q.query(
      `CREATE INDEX payment_requests_status_idx ON payment_requests(status)`,
    );
    await q.query(
      `CREATE INDEX payment_requests_driver_idx ON payment_requests(driver_id)`,
    );

    // Bonus amounts — admin can edit them from the Settings page.
    await q.query(`
      INSERT INTO site_settings (key, value) VALUES
        ('referral_bonus_client', '0'),
        ('referral_bonus_referrer', '0')
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM site_settings WHERE key IN ('referral_bonus_client','referral_bonus_referrer')`,
    );
    await q.query(`DROP TABLE payment_requests`);
    await q.query(`DROP TYPE payment_request_status`);
    await q.query(`ALTER TABLE admins DROP COLUMN role`);
  }
}
