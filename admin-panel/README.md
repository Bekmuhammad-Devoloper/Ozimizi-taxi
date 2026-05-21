# Tezkor Taxi — Admin Panel

Next.js 14 (App Router) + TanStack Query + TanStack Table + Recharts + Tailwind.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3003
```

Default login (backend seed): `admin / admin123`.

## Sahifalar

- `/login`
- `/dashboard` — 4 ta stats card, period selector, line / bar / pie chartlar, live feed (WS `/admin`)
- `/orders` — TanStack Table, sana/status filtri, CSV export, pagination
- `/drivers` — jadval + "Yangi haydovchi" (random PIN) + balansga qo‘shish/ayirish + soft delete
- `/drivers/[id]` — profil, buyurtmalar, tranzaksiyalar
- `/clients` — qidiruv + statistika
- `/tariff` — joriy tarif yangilash

## Fayllar

- `middleware.ts` — `admin_token` cookie tekshiradi, login'ga redirect
- `src/lib/api.ts` — axios JWT interceptor (cookie'dan oladi)
- `src/lib/socket.ts` — Socket.IO `/admin` namespace
- `src/components/Sidebar.tsx`, `Shell.tsx` — global layout

Backend WebSocket eventlari (`order_created`, `order_completed`, `driver_online/offline`) TanStack Query invalidationni triggerlaydi.
