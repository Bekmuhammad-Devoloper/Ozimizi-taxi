// Food side of the test rig: admin creates kitchens, a client orders from two of them,
// the kitchens accept and mark ready. Only ever talks to the throwaway backend.
const fs = require('fs');
const crypto = require('crypto');
const B = '/opt/moviytaxi/flutter-work/e2e/backend/node_modules/';
const { Client } = require(B + 'pg');
const jwt = require(B + 'jsonwebtoken');
const API = 'http://127.0.0.1:6199';
const SECRET = 'e2e-test-secret';
const STATE = '/opt/moviytaxi/flutter-work/e2e/food-state.json';

const sign = (sub, role) => jwt.sign({ sub, role }, SECRET, { expiresIn: '1h' });
async function call(method, path, token, body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const db = new Client({ connectionString: 'postgres://e2e:e2e@127.0.0.1:15499/e2e' });
  await db.connect();
  const cmd = process.argv[2];
  if (cmd === 'setup') {
    await db.query(`UPDATE drivers SET accept_delivery = true WHERE phone = '+998901234567'`);
    let admin = (await db.query(`SELECT id FROM admins ORDER BY created_at LIMIT 1`)).rows[0];
    if (!admin) {
      admin = (await db.query(`INSERT INTO admins (username, password_hash) VALUES ('e2e', 'x') RETURNING id`)).rows[0];
    }
    const at = sign(admin.id, 'admin');
    const kitchens = [];
    for (const [n, lat, lng] of [['A', 41.3115, 69.28], ['B', 41.3125, 69.282]]) {
      const tag = n + Date.now().toString().slice(-6);
      const k = await call('POST', '/admin/food/kitchens', at, {
        name: 'Sinov oshxona ' + n, address: 'Manzil ' + n, phone: '+998712000000', lat, lng,
        username: ('e2e' + tag).toLowerCase(), password: 'secret12', commissionPercent: 10, courierMaxKm: 20, needsCourier: true,
      });
      const it = await call('POST', `/admin/food/kitchens/${k.id}/items`, at, { name: 'Osh ' + n, price: 20000 });
      kitchens.push({ id: k.id, itemId: it.id });
    }
    fs.writeFileSync(STATE, JSON.stringify({ kitchens }));
    console.log('FOOD-SETUP-OK');
  } else if (cmd === 'order') {
    const { kitchens } = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const c = (await db.query(`SELECT id FROM clients WHERE telegram_id='7700001'`)).rows[0];
    const ct = sign(c.id, 'client');
    const groupId = crypto.randomUUID();
    const ids = [];
    for (const k of kitchens) {
      const o = await call('POST', '/client/food/orders', ct, {
        kitchenId: k.id, items: [{ itemId: k.itemId, qty: 1 }], lat: 41.315, lng: 69.29, address: 'Mijoz manzili', groupId,
      });
      ids.push(o.id);
    }
    for (let i = 0; i < kitchens.length; i++) {
      await call('POST', `/kitchen/orders/${ids[i]}/accept`, sign(kitchens[i].id, 'kitchen'), { prepMinutes: 10, needsCourier: true });
    }
    fs.writeFileSync(STATE, JSON.stringify({ kitchens, ids }));
    console.log('FOOD-ORDER-OK ' + ids.join(' '));
  } else if (cmd === 'ready') {
    const { kitchens, ids } = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    for (let i = 0; i < ids.length; i++) {
      await call('POST', `/kitchen/orders/${ids[i]}/ready`, sign(kitchens[i].id, 'kitchen'), {});
    }
    console.log('FOOD-READY-OK');
  } else {
    throw new Error('unknown command ' + cmd);
  }
  await db.end();
})().catch((e) => {
  console.error('FOOD-FAILED', e.message);
  process.exit(1);
});
