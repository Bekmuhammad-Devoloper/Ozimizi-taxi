#!/usr/bin/env bash
# End-to-end test rig on Vega: the real backend on loopback with an empty, throwaway
# database (no real data, no bot tokens). Reached from the emulator as 10.0.2.2:6199.
set -eo pipefail
E=/opt/moviytaxi/flutter-work/e2e
cd "$E"
docker rm -f moviytaxi-e2e-pg >/dev/null 2>&1 || true
docker run -d --name moviytaxi-e2e-pg --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e -e POSTGRES_DB=e2e \
  -p 127.0.0.1:15499:5432 postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec moviytaxi-e2e-pg pg_isready -U e2e -d e2e >/dev/null 2>&1 && break; sleep 1; done
sleep 2
rm -rf backend
cp -a /opt/moviytaxi/app/backend backend
cat > backend/.env <<EOF
NODE_ENV=production
PORT=6199
DATABASE_URL=postgres://e2e:e2e@127.0.0.1:15499/e2e
JWT_SECRET=e2e-test-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
ORDER_BROADCAST_RADIUS_KM=5
REQUIRE_POSITIVE_BALANCE_TO_ONLINE=false
DRIVER_APP_URL=http://10.0.2.2:6199
APK_DIR=$E/apk
EOF
mkdir -p apk
cd backend
npx typeorm migration:run -d dist/database/data-source.js 2>&1 | grep -vE '^query' | tail -2
node dist/database/seed.js 2>&1 | grep -vE '^query' | tail -2
pkill -f "$E/backend/dist/main.js" 2>/dev/null || true
NODE_OPTIONS="--require $E/loopback.js" nohup nice -n 10 node "$E/backend/dist/main.js" > "$E/backend.log" 2>&1 &
for i in $(seq 1 40); do
  sleep 2
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:6199/api/driver/me || true)
  [ "$code" = "401" ] && { echo "BACKEND-UP"; break; }
done
ss -ltn | grep ':6199' | cut -c1-80
cd "$E" && node seed-e2e.js
