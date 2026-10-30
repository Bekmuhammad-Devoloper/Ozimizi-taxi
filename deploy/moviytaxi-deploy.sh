#!/usr/bin/env bash
# MOVIY TAXI — deploy on shared server. Touches ONLY moviytaxi-* resources.
#
# Everything is installed and built in $APP.new while the live apps keep
# serving from $APP; only then is the directory swapped and PM2 restarted,
# so the site is down for a few seconds rather than for the whole build.
set -eo pipefail

DOMAIN=moviytaxi.uz
OLD_DOMAIN=moviytaxi.yuksalish.dev
DIR=/opt/moviytaxi
APP=$DIR/app
NEW=$APP.new
PG_CONTAINER=moviytaxi-postgres
PG_PORT=15436
BACKEND_PORT=6101
DRIVER_PORT=6102
ADMIN_PORT=6103
CLIENT_PORT=6104

: "${BOT_TOKEN:?}" "${SMTP_USER:?}" "${SMTP_PASS:?}"

mkdir -p "$DIR"
SECRETS=$DIR/secrets.env
if [ ! -f "$SECRETS" ]; then
  echo "DB_PASSWORD=$(openssl rand -hex 16)" > "$SECRETS"
  echo "JWT_SECRET=$(openssl rand -hex 32)" >> "$SECRETS"
  chmod 600 "$SECRETS"
fi
. "$SECRETS"

echo "→ Code"
rm -rf "$NEW" && mkdir -p "$NEW"
tar -xzf "$DIR/code.tgz" -C "$NEW"
[ -d "$APP/backend/uploads" ] && cp -a "$APP/backend/uploads" "$NEW/backend/" || true

echo "→ Postgres container"
if ! docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  docker run -d --name "$PG_CONTAINER" --restart unless-stopped \
    -e POSTGRES_USER=moviytaxi -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB=moviytaxi \
    -v moviytaxi-pgdata:/var/lib/postgresql/data \
    -p 127.0.0.1:$PG_PORT:5432 postgres:16-alpine
fi
docker start "$PG_CONTAINER" >/dev/null
for i in $(seq 1 30); do docker exec "$PG_CONTAINER" pg_isready -U moviytaxi >/dev/null 2>&1 && break; sleep 1; done

echo "→ Env files"
cat > "$NEW/backend/.env" <<EOF
NODE_ENV=production
PORT=$BACKEND_PORT
DATABASE_URL=postgres://moviytaxi:$DB_PASSWORD@127.0.0.1:$PG_PORT/moviytaxi
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
BOT_TOKEN=$BOT_TOKEN
WALLET_BOT_TOKEN=${WALLET_BOT_TOKEN:-}
WALLET_BOT_USERNAME=${WALLET_BOT_USERNAME:-}
COORDINATOR_WEBAPP_URL=https://$DOMAIN/admin/tg
CORS_ORIGIN=https://$DOMAIN,https://www.$DOMAIN,https://$OLD_DOMAIN
ORDER_BROADCAST_RADIUS_KM=5
REQUIRE_POSITIVE_BALANCE_TO_ONLINE=false
DRIVER_APP_URL=https://$DOMAIN
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=Moviy Taxi <$SMTP_USER>
EOF
chmod 600 "$NEW/backend/.env"
cat > "$NEW/driver-pwa/.env.local" <<EOF
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
NEXT_PUBLIC_WS_URL=https://$DOMAIN
EOF
cat > "$NEW/client-pwa/.env.local" <<EOF
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
NEXT_PUBLIC_WS_URL=https://$DOMAIN
NEXT_PUBLIC_BASE_PATH=/client
EOF
cat > "$NEW/admin-panel/.env.local" <<EOF
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
NEXT_PUBLIC_WS_URL=https://$DOMAIN
NEXT_PUBLIC_BASE_PATH=/admin
EOF

echo "→ Backend build"
cd "$NEW/backend"
npm ci --no-audit --no-fund
npm run build

echo "→ Driver PWA build"
cd "$NEW/driver-pwa" && npm ci --no-audit --no-fund && npm run build 2>&1 | tail -5
echo "→ Admin build"
cd "$NEW/admin-panel" && npm ci --no-audit --no-fund && npm run build 2>&1 | tail -5
echo "→ Client PWA build"
cd "$NEW/client-pwa" && npm ci --no-audit --no-fund && npm run build 2>&1 | tail -5

# Migrations are additive, so the old code keeps working during the
# seconds between here and the restart.
echo "→ Migrate + seed"
cd "$NEW/backend"
npm run migration:run 2>&1 | grep -vE '^query' | tail -5
npx ts-node src/database/seed.ts 2>&1 | grep -vE '^query' | tail -5

echo "→ Swap + restart"
rm -rf "$APP.old"; [ -d "$APP" ] && mv "$APP" "$APP.old"; mv "$NEW" "$APP"
cat > "$DIR/ecosystem.config.js" <<EOF
module.exports = { apps: [
  { name: 'moviytaxi-backend', cwd: '$APP/backend', script: 'dist/main.js' },
  { name: 'moviytaxi-driver', cwd: '$APP/driver-pwa', script: 'node_modules/next/dist/bin/next', args: 'start -p $DRIVER_PORT' },
  { name: 'moviytaxi-admin', cwd: '$APP/admin-panel', script: 'node_modules/next/dist/bin/next', args: 'start -p $ADMIN_PORT' },
  { name: 'moviytaxi-client', cwd: '$APP/client-pwa', script: 'node_modules/next/dist/bin/next', args: 'start -p $CLIENT_PORT' },
]};
EOF
if pm2 describe moviytaxi-backend >/dev/null 2>&1; then
  pm2 restart moviytaxi-backend moviytaxi-driver moviytaxi-admin --update-env >/dev/null
  if pm2 describe moviytaxi-client >/dev/null 2>&1; then
    pm2 restart moviytaxi-client --update-env >/dev/null
  else
    pm2 start "$DIR/ecosystem.config.js" --only moviytaxi-client >/dev/null
  fi
else
  pm2 start "$DIR/ecosystem.config.js" >/dev/null
fi
pm2 save >/dev/null

echo "→ Nginx"
NGX=/etc/nginx/sites-available/moviytaxi
# Client app lives under /client (added 2026-10-09); insert once into the existing site.
if [ -f "$NGX" ] && ! grep -q "location /client" "$NGX"; then
  cp "$NGX" "$DIR/nginx-moviytaxi.bak.$(date +%Y%m%d-%H%M%S)"
  python3 - "$NGX" "$CLIENT_PORT" <<'PY'
import sys
path, port = sys.argv[1], sys.argv[2]
s = open(path).read()
block = """    location /client {
        proxy_pass http://127.0.0.1:%s;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
""" % port
marker = '    location / {'
assert marker in s
s = s.replace(marker, block + marker, 1)
open(path, 'w').write(s)
PY
  nginx -t && systemctl reload nginx
fi
if [ ! -f "$NGX" ]; then
cat > "$NGX" <<EOF
# MOVIY TAXI
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 20M;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }
    location /api/ {
        rewrite ^/api/(.*)\$ /\$1 break;
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        expires 30d;
    }
    location /admin {
        proxy_pass http://127.0.0.1:$ADMIN_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:$DRIVER_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf "$NGX" /etc/nginx/sites-enabled/moviytaxi
nginx -t && systemctl reload nginx
certbot --nginx -n --agree-tos -m bekmuhammad.devoloper@gmail.com -d "$DOMAIN" --redirect
nginx -t && systemctl reload nginx
fi

echo "DONE"
