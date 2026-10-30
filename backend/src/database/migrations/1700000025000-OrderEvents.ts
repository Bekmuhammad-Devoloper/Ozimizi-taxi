import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderEvents1700000025000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Every step of an order's life (who it was offered to, how long the
    // phone rang, declines, "fell to the middle", accept, ride states,
    // cancel) — shown to the admin as a timeline.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS order_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        kind varchar(32) NOT NULL,
        driver_id uuid NULL,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events (order_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_order_events_created ON order_events (created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS order_events`);
  }
}
