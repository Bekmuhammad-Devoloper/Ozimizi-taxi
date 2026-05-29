import { MigrationInterface, QueryRunner } from 'typeorm';

const ADMIN_INITIAL_BALANCE = '100000000.00';

export class ApprovalSettingsTreasury1700000004000
  implements MigrationInterface
{
  name = 'ApprovalSettingsTreasury1700000004000';

  public async up(q: QueryRunner): Promise<void> {
    // Driver approval gate. Existing rows (created before this migration)
    // are auto-approved so prior admin-created drivers keep working.
    await q.query(`
      ALTER TABLE drivers
      ADD COLUMN is_approved boolean NOT NULL DEFAULT false
    `);
    await q.query(`UPDATE drivers SET is_approved = true`);

    // Client wallet + referral.
    await q.query(`
      ALTER TABLE clients
      ADD COLUMN balance numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN ref_code varchar(16),
      ADD COLUMN referred_by_id uuid
    `);
    await q.query(
      `CREATE UNIQUE INDEX clients_ref_code_uq ON clients(ref_code) WHERE ref_code IS NOT NULL`,
    );
    await q.query(
      `ALTER TABLE clients
       ADD CONSTRAINT clients_referred_by_fk
       FOREIGN KEY (referred_by_id) REFERENCES clients(id) ON DELETE SET NULL`,
    );

    // Site-wide settings (insta links, admin contact, etc).
    await q.query(`
      CREATE TABLE site_settings (
        key varchar(64) PRIMARY KEY,
        value text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`
      INSERT INTO site_settings (key, value) VALUES
        ('instagram_url_1', ''),
        ('instagram_url_2', ''),
        ('instagram_url_3', ''),
        ('admin_contact_url', ''),
        ('payment_bot_url', '')
    `);

    // Admin treasury balance — closed-loop invariant:
    //   admin.balance + sum(drivers.balance) + sum(clients.balance)
    //   + sum(payment_requests.PENDING) = 100_000_000
    // The first admin row gets the full pool; any later admins start at 0.
    await q.query(`
      ALTER TABLE admins
      ADD COLUMN balance numeric(14,2) NOT NULL DEFAULT 0
    `);
    await q.query(`
      UPDATE admins SET balance = '${ADMIN_INITIAL_BALANCE}'
      WHERE id = (SELECT id FROM admins ORDER BY created_at ASC LIMIT 1)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE admins DROP COLUMN balance`);
    await q.query(`DROP TABLE site_settings`);
    await q.query(`ALTER TABLE clients DROP CONSTRAINT clients_referred_by_fk`);
    await q.query(`DROP INDEX clients_ref_code_uq`);
    await q.query(
      `ALTER TABLE clients
       DROP COLUMN balance,
       DROP COLUMN ref_code,
       DROP COLUMN referred_by_id`,
    );
    await q.query(`ALTER TABLE drivers DROP COLUMN is_approved`);
  }
}
