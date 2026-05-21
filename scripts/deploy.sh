#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# OZIMIZNI TAXI — Server deploy
# Boshqa loyihalarga zarar bermaslik uchun:
#   - Faqat /opt/ozimizi-taxi katalogiga yoziladi
#   - PostgreSQL'da YANGI database (ozimizi_taxi)
#   - YANGI ports: 6001 (backend), 6002 (driver), 6003 (admin)
#   - PM2 ichida YANGI process'lar (ozimizi-backend, ozimizi-driver, ozimizi-admin)
#   - nginx alohida site fayli (/etc/nginx/sites-available/ozimizi-taxi)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# === Sozlamalar ===
DEPLOY_DIR="/opt/ozimizi-taxi"
REPO_URL="https://github.com/Bekmuhammad-Devoloper/Ozimizi-taxi.git"
DB_NAME="ozimizi_taxi"
DB_USER="ozimizi_user"
DB_PASSWORD="$(openssl rand -hex 16)"
JWT_SECRET="$(openssl rand -hex 32)"

BACKEND_PORT=6001
DRIVER_PORT=6002
ADMIN_PORT=6003

# Maxfiy ma'lumotlar — environment'dan o'qiladi.
# Foydalanish: BOT_TOKEN=... SMTP_USER=... SMTP_PASS=... bash deploy.sh
: "${BOT_TOKEN:?BOT_TOKEN env required}"
: "${SMTP_USER:?SMTP_USER env required}"
: "${SMTP_PASS:?SMTP_PASS env required}"
PUBLIC_HOST="${PUBLIC_HOST:-$PUBLIC_HOST}"

# ── 1) Repo clone yoki update ─────────────────────────────────
if [ -d "$DEPLOY_DIR/.git" ]; then
  echo "→ Repo allaqachon bor, pull qilamiz"
  cd "$DEPLOY_DIR" && git pull
else
  echo "→ Repo clone qilamiz"
  mkdir -p "$DEPLOY_DIR"
  git clone "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

# ── 2) PostgreSQL: alohida DB va user ─────────────────────────
echo "→ DB user va database (mavjud bo'lsa o'tkazib yuborilamiz)"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# ── 3) Backend .env ───────────────────────────────────────────
cat > "$DEPLOY_DIR/backend/.env" <<EOF
NODE_ENV=production
PORT=$BACKEND_PORT
DATABASE_URL=postgres://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
BOT_TOKEN=$BOT_TOKEN
GOOGLE_MAPS_KEY=
CORS_ORIGIN=*
ORDER_BROADCAST_RADIUS_KM=5
REQUIRE_POSITIVE_BALANCE_TO_ONLINE=false
DRIVER_APP_URL=http://$PUBLIC_HOST:$DRIVER_PORT
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=OZIMIZNI TAXI <$SMTP_USER>
EOF

# ── 4) Driver PWA .env.local ──────────────────────────────────
cat > "$DEPLOY_DIR/driver-pwa/.env.local" <<EOF
NEXT_PUBLIC_API_URL=http://$PUBLIC_HOST:$BACKEND_PORT
NEXT_PUBLIC_WS_URL=http://$PUBLIC_HOST:$BACKEND_PORT
EOF

# ── 5) Admin Panel .env.local ─────────────────────────────────
cat > "$DEPLOY_DIR/admin-panel/.env.local" <<EOF
NEXT_PUBLIC_API_URL=http://$PUBLIC_HOST:$BACKEND_PORT
NEXT_PUBLIC_WS_URL=http://$PUBLIC_HOST:$BACKEND_PORT
EOF

# ── 6) Install + build ────────────────────────────────────────
echo "→ Backend install + build"
cd "$DEPLOY_DIR/backend"
npm ci --no-audit --no-fund || npm install --no-audit --no-fund
npm run build
npm run migration:run
node dist/database/seed.js || npx ts-node src/database/seed.ts

echo "→ Driver PWA install + build"
cd "$DEPLOY_DIR/driver-pwa"
npm ci --no-audit --no-fund || npm install --no-audit --no-fund
npm run build

echo "→ Admin Panel install + build"
cd "$DEPLOY_DIR/admin-panel"
npm ci --no-audit --no-fund || npm install --no-audit --no-fund
npm run build

# ── 7) PM2 process'lar ────────────────────────────────────────
echo "→ PM2 process'lar"
cd "$DEPLOY_DIR"
pm2 delete ozimizi-backend ozimizi-driver ozimizi-admin 2>/dev/null || true

pm2 start --name ozimizi-backend "node dist/main.js" \
  --cwd "$DEPLOY_DIR/backend" \
  --update-env

pm2 start --name ozimizi-driver "npm run start -- -p $DRIVER_PORT" \
  --cwd "$DEPLOY_DIR/driver-pwa" \
  --update-env

pm2 start --name ozimizi-admin "npm run start -- -p $ADMIN_PORT" \
  --cwd "$DEPLOY_DIR/admin-panel" \
  --update-env

pm2 save

echo ""
echo "════════════════════════════════════════════"
echo "✅ Deploy tugadi"
echo ""
echo "  Backend  : http://$PUBLIC_HOST:$BACKEND_PORT"
echo "  Driver   : http://$PUBLIC_HOST:$DRIVER_PORT"
echo "  Admin    : http://$PUBLIC_HOST:$ADMIN_PORT"
echo ""
echo "  Admin login: admin / admin123"
echo ""
echo "  DB user/pass (saqlab qo'ying):"
echo "    user     = $DB_USER"
echo "    password = $DB_PASSWORD"
echo ""
echo "  Logs:"
echo "    pm2 logs ozimizi-backend"
echo "    pm2 logs ozimizi-driver"
echo "    pm2 logs ozimizi-admin"
echo "════════════════════════════════════════════"
