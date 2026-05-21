# Tezkor Taxi — Backend

NestJS + PostgreSQL + TypeORM + Telegraf + Socket.IO.

## Setup

```bash
cp .env.example .env
# .env'ni DATABASE_URL, BOT_TOKEN, JWT_SECRET bilan to'ldiring

npm install
npm run migration:run
npm run seed   # admin/admin123 va default tariff
npm run start:dev
```

Server: `http://localhost:3001`
WebSocket namespacelari: `/drivers`, `/admin` (JWT handshake auth bilan).

## API qisqacha

### Auth
- `POST /auth/driver/login` `{ phone, pin }` → `{ access_token, driver }`
- `POST /auth/admin/login` `{ username, password }` → `{ access_token, admin }`

### Driver (Bearer JWT)
- `POST /driver/online` — online/offline toggle
- `PATCH /driver/location` `{ lat, lng }`
- `POST /driver/orders/:id/accept | on-the-way | arrived | start`
- `POST /driver/orders/:id/complete` `{ distanceKm }`
- `GET /driver/orders/history`
- `GET /driver/balance`
- `GET /driver/me`

### Admin (Bearer JWT)
- `GET /admin/stats?period=day|week|month`
- `GET /admin/orders?from=&to=&status=&driverId=&clientId=&page=&pageSize=`
- `GET /admin/drivers` / `POST /admin/drivers` / `DELETE /admin/drivers/:id`
- `GET /admin/drivers/:id` — to'liq profil + tranzaksiyalar
- `POST /admin/drivers/:id/balance` `{ amount, note }`
- `GET /admin/clients`
- `GET /admin/tariff` / `PATCH /admin/tariff`

## WebSocket

```js
// driver client
const socket = io('http://localhost:3001/drivers', {
  auth: { token: 'JWT_HERE' }
});
socket.on('new_order', payload => { /* ... */ });
socket.emit('location_update', { lat, lng });
socket.emit('accept_order', { orderId });
```

## Biznes logika

- Narx = `distanceKm * pricePerKm`, agar `minimumFare`'dan kam bo‘lsa, `minimumFare`.
- Tugatishda balansga `price - commission` qo‘shiladi va `BalanceTransaction(type=COMMISSION)` yoziladi.
- Buyurtma yaratilganda PENDING — radius (`ORDER_BROADCAST_RADIUS_KM`) ichidagi online haydovchilarga emit qilinadi. Birinchi qabul qilgan haydovchiga atomic update bilan biriktiriladi (UPDATE ... WHERE status='PENDING' AND driver_id IS NULL). Boshqalarga `order_taken` emit.
- Masofa haversine formula bilan hisoblanadi.
- `REQUIRE_POSITIVE_BALANCE_TO_ONLINE=true` bo‘lsa, balans manfiy bo‘lganda online bo‘lib bo‘lmaydi.

## Telegram Bot

`/start` → kontakt → ixtiyoriy ikkinchi raqam → asosiy menyu. "🚖 Taxi chaqirish" → lokatsiya yuborish → buyurtma yaratiladi va onlayn haydovchilarga broadcast bo‘ladi. Inline tugma orqali bekor qilish mavjud.
