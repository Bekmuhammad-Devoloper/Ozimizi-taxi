# Tezkor Taxi

Taxi buyurtma tizimi — uchta loyihadan iborat:

| Loyiha | Stack | Port |
|--------|-------|------|
| [`backend/`](./backend) | NestJS, PostgreSQL, TypeORM, Telegraf, Socket.IO, JWT | 3001 |
| [`driver-pwa/`](./driver-pwa) | Next.js 14 PWA, Tailwind, Zustand, Socket.IO, GPS | 3002 |
| [`admin-panel/`](./admin-panel) | Next.js 14, TanStack Query/Table, Recharts | 3003 |

## Tez ishga tushirish

1. **Backend**:
   ```bash
   cd backend
   cp .env.example .env  # DATABASE_URL, BOT_TOKEN, JWT_SECRET
   npm install
   npm run migration:run
   npm run seed
   npm run start:dev
   ```
2. **Driver PWA**:
   ```bash
   cd driver-pwa && cp .env.example .env.local && npm install && npm run dev
   ```
3. **Admin Panel**:
   ```bash
   cd admin-panel && cp .env.example .env.local && npm install && npm run dev
   ```

Default admin: `admin / admin123`.

## Oqim

1. Klient Telegram bot orqali `/start` → kontakt → ixtiyoriy ikkinchi raqam → asosiy menyu.
2. "🚖 Taxi chaqirish" → lokatsiya yuborish → Order `PENDING`.
3. Backend `ORDER_BROADCAST_RADIUS_KM` ichidagi onlayn haydovchilarga WebSocket orqali `new_order` emit qiladi.
4. Driver PWA modal ko‘rsatadi (15s countdown). Qabul qilingach atomic `UPDATE` orqali bitta haydovchiga biriktiriladi, qolganlariga `order_taken` yuboriladi.
5. Haydovchi status zanjiri: `ACCEPTED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED`. Har bir o‘tishda Telegram orqali klientga xabar boradi.
6. Tugatishda: `price = max(distance × pricePerKm, minimumFare)`, balansga `price − commission` qo‘shiladi, `BalanceTransaction(type=COMMISSION)` yoziladi.
7. Admin Panel'da real vaqtli stats, jadval va boshqaruv.

## Arxitektura izohlar

- `RealtimeService` `@Global` — circular import'larsiz emit qilish uchun.
- `OrderEvents` ichki EventEmitter — bot Telegram orqali klientga xabar yuborish uchun shunga subscribe bo‘ladi.
- Buyurtma qabul qilinishi atomic: `UPDATE orders SET driver_id = :id, status='ACCEPTED' WHERE id=:id AND status='PENDING' AND driver_id IS NULL`.
- Balans o‘zgarishlari `SERIALIZABLE` emas, lekin pessimistic write lock orqali atomicly tranzaksiya ichida.
- Haydovchi GPS klient tomonda `watchPosition` bilan kuzatiladi, har 10 soniyada WS orqali yuboriladi. `IN_PROGRESS` paytida bosib o‘tilgan masofa lokal haversine bilan yig‘iladi va tugatishda serverga uzatiladi.
