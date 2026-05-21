# Tezkor Taxi — Driver PWA

Mobile-first Next.js 14 PWA haydovchilar uchun.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3002
```

## Sahifalar

- `/login` — telefon + 6-PIN
- `/dashboard` — katta ONLINE/OFFLINE toggle, balans
- `/order/active` — qabul qilingan buyurtma, status tugmalari
- `/orders` — kun bo‘yicha guruhlangan tarix
- `/balance` — balans + tranzaksiyalar
- `/profile` — chiqish

## Asosiy fayllar

- `src/stores/auth.ts`, `src/stores/order.ts` — Zustand (persist)
- `src/lib/api.ts` — axios JWT interceptor bilan
- `src/lib/socket.ts` — Socket.IO `/drivers` namespace
- `src/hooks/useDriverSocket.ts` — `new_order`, `order_taken`, GPS watch + 10s emit, `IN_PROGRESS`-da masofa hisobi
- `src/components/IncomingOrderModal.tsx` — 15s countdown, vibration, audio
- `src/components/BottomNav.tsx` — mobil pastki navigatsiya
- `next.config.js` + `public/manifest.json` — PWA (next-pwa)

## Ishlash oqimi

1. Login → JWT olinadi → `/dashboard`
2. ONLINE toggle → GPS permission so‘raydi → WS ulanadi → har 10 soniyada `location_update` emit qiladi
3. `new_order` kelganda — modal ochiladi, 15s ichida qabul qilish kerak
4. `accept` → `/order/active` sahifasi: `🚗 Yo‘lga chiqdim` → `✅ Yetib keldim` → `▶️ Safarni boshlash` → `🏁 Tugatish`
5. IN_PROGRESS bo‘lganda GPS yangilanishlari haversine bilan jami masofaga qo‘shiladi. Tugatishda shu masofa serverga yuboriladi.

PWA: icon'lar `public/icons/icon-192.png` va `icon-512.png` ga qo‘shilishi kerak. Audio: `public/sounds/new-order.mp3`.
