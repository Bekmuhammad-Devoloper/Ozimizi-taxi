// Seeds the throwaway database: one approved driver and one client.
const B = '/opt/moviytaxi/flutter-work/e2e/backend/node_modules/';
const { Client } = require(B + 'pg');
const bcrypt = require(B + (require('fs').existsSync(B + 'bcrypt') ? 'bcrypt' : 'bcryptjs'));
(async () => {
  const db = new Client({ connectionString: 'postgres://e2e:e2e@127.0.0.1:15499/e2e' });
  await db.connect();
  const hash = await bcrypt.hash('test1234', 10);
  const d = await db.query(
    `INSERT INTO drivers (full_name, phone, password_hash, is_online, is_active, is_approved, balance, current_lat, current_lng,
       avatar_url, car_model, car_color, car_plate, car_photo_url)
     VALUES ('Sinov Haydovchi', '+998901234567', $1, false, true, true, 500000, 41.3111, 69.2797,
       '/uploads/a.jpg', 'Cobalt', 'Oq', '01A123BC', '/uploads/c.jpg')
     ON CONFLICT DO NOTHING RETURNING id`,
    [hash],
  );
  const c = await db.query(
    `INSERT INTO clients (telegram_id, first_name, phone_primary) VALUES ('7700001', 'Sinov Mijoz', '+998901112233')
     ON CONFLICT DO NOTHING RETURNING id`,
  );
  console.log('driver', d.rows[0]?.id, 'client', c.rows[0]?.id);
  await db.end();
})().catch((e) => {
  console.error('SEED-FAILED', e.message);
  process.exit(1);
});
