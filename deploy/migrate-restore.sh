#!/usr/bin/env bash
# Moviy Taxi: runs ON THE NEW SERVER (189.74.100.34) after deploy/migrate-push.sh
# delivered /opt/moviytaxi/migrate/* from Vega and the staging build is in place.
# No rebuild: restores the database, uploads, TLS cert, nginx site and Vega's
# backend .env (real bot tokens), then restarts the apps. Re-runnable.
#
# Usage: bash /opt/moviytaxi/migrate-restore.sh
set -eo pipefail
DIR=/opt/moviytaxi
APP=$DIR/app
MIG=$DIR/migrate
PG=moviytaxi-postgres
cd "$DIR"
[ -f "$MIG/db.sql.gz" ] || { echo "no $MIG/db.sql.gz — run migrate-push.sh on Vega first"; exit 1; }
[ -f "$MIG/backend.env" ] || { echo "no $MIG/backend.env — run the updated migrate-push.sh on Vega (data-only)"; exit 1; }
[ -f "$APP/backend/dist/main.js" ] || { echo "app not built yet (staging deploy still running?)"; exit 1; }

echo "→ Secrets from Vega (DB password, JWT secret, keystore pass)"
cp "$MIG/secrets.env" "$DIR/secrets.env" && chmod 600 "$DIR/secrets.env"
. "$DIR/secrets.env"

echo "→ Stop apps"
pm2 stop moviytaxi-backend moviytaxi-driver moviytaxi-admin moviytaxi-client >/dev/null 2>&1 || true

echo "→ Database restore ($(du -h "$MIG/db.sql.gz" | cut -f1))"
docker start "$PG" >/dev/null 2>&1 || true
for i in $(seq 1 30); do docker exec "$PG" pg_isready -U moviytaxi >/dev/null 2>&1 && break; sleep 1; done
docker exec "$PG" psql -U moviytaxi -d postgres -q -c "ALTER USER moviytaxi PASSWORD '$DB_PASSWORD';"
docker exec "$PG" psql -U moviytaxi -d postgres -q -c "DROP DATABASE IF EXISTS moviytaxi WITH (FORCE);" -c "CREATE DATABASE moviytaxi OWNER moviytaxi;"
gunzip -c "$MIG/db.sql.gz" | docker exec -i "$PG" psql -U moviytaxi -d moviytaxi -q >/dev/null
q() { docker exec "$PG" psql -U moviytaxi -d moviytaxi -At -c "$1"; }
echo "   drivers=$(q 'SELECT count(*) FROM drivers') clients=$(q 'SELECT count(*) FROM clients') orders=$(q 'SELECT count(*) FROM orders') migrations=$(q 'SELECT count(*) FROM migrations')"

echo "→ Uploads"
mkdir -p "$APP/backend/uploads"
rsync -a "$MIG/uploads/" "$APP/backend/uploads/"
echo "   $(du -sh "$APP/backend/uploads" | cut -f1)"

echo "→ Backend .env (Vega's, verbatim: same DB port/password, real bot tokens)"
cp "$MIG/backend.env" "$APP/backend/.env" && chmod 600 "$APP/backend/.env"
# VALIDATE=1: rehearsal while Vega is still live — keep the bots off here
# (two pollers on one token conflict) and leave nginx proxying to Vega.
if [ "${VALIDATE:-0}" = "1" ]; then
  sed -i -E 's/^(BOT_TOKEN|WALLET_BOT_TOKEN)=.*/\1=disabled/' "$APP/backend/.env"
  echo "   VALIDATE=1: bot tokens disabled in .env (Vega keeps polling)"
fi
# deploy.env so future `moviytaxi-deploy.sh` runs here keep the real tokens.
{
  for k in BOT_TOKEN SMTP_USER SMTP_PASS WALLET_BOT_TOKEN WALLET_BOT_USERNAME; do
    v=$(grep -E "^$k=" "$MIG/backend.env" | head -1 | cut -d= -f2-)
    echo "export $k='$v'"
  done
} > "$DIR/deploy.env" && chmod 600 "$DIR/deploy.env"

echo "→ TLS certificate + nginx site"
mkdir -p /etc/letsencrypt
tar xzf "$MIG/letsencrypt-moviytaxi.tgz" -C /etc/letsencrypt
CB=/usr/lib/python3/dist-packages
[ -f /etc/letsencrypt/options-ssl-nginx.conf ] || cp "$CB/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf" /etc/letsencrypt/
[ -f /etc/letsencrypt/ssl-dhparams.pem ] || cp "$CB/certbot/ssl-dhparams.pem" /etc/letsencrypt/
if [ "${VALIDATE:-0}" = "1" ]; then
  echo "   VALIDATE=1: nginx left as proxy-to-Vega"
elif grep -q 'proxy_pass https://189.74.100.34' "$MIG/nginx-moviytaxi.conf"; then
  # Vega's site was already switched to the proxy (cutover run twice) — installing
  # it here would loop the server onto itself (500s). Keep the current site.
  echo "   !! migrate/nginx-moviytaxi.conf is the Vega→new proxy, NOT installed (restore the real site from Vega's nginx-moviytaxi.bak.cutover-* backup)"
else
  cp "$MIG/nginx-moviytaxi.conf" /etc/nginx/sites-available/moviytaxi
  ln -sf /etc/nginx/sites-available/moviytaxi /etc/nginx/sites-enabled/moviytaxi
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
fi

echo "→ Start apps"
cat > "$DIR/ecosystem.config.js" <<EOF
module.exports = { apps: [
  { name: 'moviytaxi-backend', cwd: '$APP/backend', script: 'dist/main.js' },
  { name: 'moviytaxi-driver', cwd: '$APP/driver-pwa', script: 'node_modules/next/dist/bin/next', args: 'start -p 6102' },
  { name: 'moviytaxi-admin', cwd: '$APP/admin-panel', script: 'node_modules/next/dist/bin/next', args: 'start -p 6103' },
  { name: 'moviytaxi-client', cwd: '$APP/client-pwa', script: 'node_modules/next/dist/bin/next', args: 'start -p 6104' },
]};
EOF
if pm2 describe moviytaxi-backend >/dev/null 2>&1; then
  pm2 restart moviytaxi-backend moviytaxi-driver moviytaxi-admin moviytaxi-client --update-env >/dev/null
else
  pm2 start "$DIR/ecosystem.config.js" >/dev/null
fi
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
# Slow box: NestJS + three Next servers need a while to boot.
for i in $(seq 1 60); do curl -s -o /dev/null --max-time 5 http://127.0.0.1:6101/public/stats && break; sleep 3; done
set +e
pm2 jlist | python3 -c "import json,sys; [print('  ', p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name'].startswith('moviytaxi-')]"
for u in 6101/public/stats 6102/app 6103/admin/login 6104/client/login; do
  printf '   local :%s -> ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 60 "http://127.0.0.1:$u"
done
if [ "${VALIDATE:-0}" != "1" ]; then
  for p in / /app /admin/login /client/login /api/public/stats; do
    printf '   https %s -> ' "$p"; curl -sk -o /dev/null -w '%{http_code}\n' --max-time 30 --resolve moviytaxi.uz:443:127.0.0.1 "https://moviytaxi.uz$p"
  done
fi
echo "RESTORE-DONE $(date -u +%FT%TZ)"
