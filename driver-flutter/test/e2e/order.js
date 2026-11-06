// Places a real client order on the test backend, the same way the client app does.
const B = '/opt/moviytaxi/flutter-work/e2e/backend/node_modules/';
const { Client } = require(B + 'pg');
const jwt = require(B + 'jsonwebtoken');
(async () => {
  const db = new Client({ connectionString: 'postgres://e2e:e2e@127.0.0.1:15499/e2e' });
  await db.connect();
  const c = (await db.query(`SELECT id FROM clients WHERE telegram_id='7700001'`)).rows[0];
  const token = jwt.sign({ sub: c.id, role: 'client' }, 'e2e-test-secret', { expiresIn: '1h' });
  await db.query(`UPDATE orders SET status='CANCELLED' WHERE client_id=$1 AND status NOT IN ('COMPLETED','CANCELLED')`, [c.id]);
  await db.end();
  const r = await fetch('http://127.0.0.1:6199/client/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({
      lat: 41.311, lng: 69.2795, address: 'Amir Temur ko‘chasi 15',
      dest: { lat: 41.3265, lng: 69.2285, address: 'Chorsu bozori' },
    }),
  });
  console.log('ORDER', r.status, (await r.text()).slice(0, 240));
})().catch((e) => {
  console.error('ORDER-FAILED', e.message);
  process.exit(1);
});
