#!/usr/bin/env bash
# MOVIY TAXI — ACTIVATE. Runs on the production VPS (189.74.100.34).
#
# Pulls the build that Vega published (deploy/build-on-vega.sh), keeps this
# server's uploads, writes backend/.env from the secrets that live ONLY here
# (secrets.env + deploy.env), runs DB migrations, swaps the directory and
# restarts PM2. The site stays up until the final swap (a few seconds).
#
#   bash /opt/moviytaxi/pull-activate.sh <https://.../_build-<token>/app.tgz> [apk]
#   "apk" also refreshes /opt/moviytaxi/apk from the build's apk/ folder.
set -eo pipefail
URL=${1:?usage: pull-activate.sh <app.tgz url> [apk]}
WITH_APK=${2:-}
DOMAIN=moviytaxi.uz
OLD_DOMAIN=moviytaxi.yuksalish.dev
DIR=/opt/moviytaxi
APP=$DIR/app
NEW=$APP.new
PG_PORT=15436
BACKEND_PORT=6101
DRIVER_PORT=6102
ADMIN_PORT=6103
CLIENT_PORT=6104
cd "$DIR"
. "$DIR/secrets.env"
. "$DIR/deploy.env"
: "${BOT_TOKEN:?}" "${SMTP_USER:?}" "${SMTP_PASS:?}" "${DB_PASSWORD:?}" "${JWT_SECRET:?}"

echo "→ Download"
rm -rf "$NEW" "$DIR/unpack" "$DIR/app.tgz"
# Vega ↔ Tashkent resets happen now and then: retry on any error and resume.
for i in 1 2 3 4 5 6; do
  curl -4 -fsSL --retry 5 --retry-all-errors --retry-delay 5 -C - -o "$DIR/app.tgz" "$URL" && break
  echo "   download attempt $i failed, retrying…"; sleep 5
done
EXP=$(curl -4 -fsSL --retry 5 --retry-all-errors "${URL%.tgz}.md5")
GOT=$(md5sum "$DIR/app.tgz" | cut -d' ' -f1)
[ "$EXP" = "$GOT" ] || { echo "md5 mismatch: expected $EXP got $GOT"; exit 1; }
echo "   $(du -h "$DIR/app.tgz" | cut -f1), md5 ok"

echo "→ Unpack"
mkdir -p "$DIR/unpack"
tar -xzf "$DIR/app.tgz" -C "$DIR/unpack"
mv "$DIR/unpack/app" "$NEW"
rm -rf "$DIR/unpack" "$DIR/app.tgz"
[ -d "$APP/backend/uploads" ] && cp -a "$APP/backend/uploads" "$NEW/backend/" || true

echo "→ Backend .env (secrets stay on this server)"
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
APK_DIR=$DIR/apk
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=Moviy Taxi <$SMTP_USER>
EOF
chmod 600 "$NEW/backend/.env"

# Migrations are additive, so the running code keeps working until the swap.
echo "→ Migrate + seed"
cd "$NEW/backend"
# Compiled JS, not ts-node: on the 1-vCPU VPS ts-node ate the CPU for minutes
# and the live bot stalled while a deploy was running.
npx typeorm migration:run -d dist/database/data-source.js 2>&1 | grep -vE '^query' | tail -5
node dist/database/seed.js 2>&1 | grep -vE '^query' | tail -3

echo "→ Swap + restart"
cd "$DIR"
rm -rf "$APP.old"; [ -d "$APP" ] && mv "$APP" "$APP.old"; mv "$NEW" "$APP"
# The Eskiz VPS has a broken IPv6 route: Node prefers the AAAA record of
# api.telegram.org and every bot call fails — force IPv4 for all apps.
cat > "$DIR/ecosystem.config.js" <<EOF
const env = { NODE_OPTIONS: '--dns-result-order=ipv4first' };
module.exports = { apps: [
  { name: 'moviytaxi-backend', cwd: '$APP/backend', script: 'dist/main.js', env },
  { name: 'moviytaxi-driver', cwd: '$APP/driver-pwa', script: 'node_modules/next/dist/bin/next', args: 'start -p $DRIVER_PORT', env },
  { name: 'moviytaxi-admin', cwd: '$APP/admin-panel', script: 'node_modules/next/dist/bin/next', args: 'start -p $ADMIN_PORT', env },
  { name: 'moviytaxi-client', cwd: '$APP/client-pwa', script: 'node_modules/next/dist/bin/next', args: 'start -p $CLIENT_PORT', env },
]};
EOF
if pm2 describe moviytaxi-backend >/dev/null 2>&1; then
  # Backend (API + bots) first so it is back within seconds; the three Next
  # apps afterwards, one by one, so they don't fight it for the single CPU.
  pm2 restart "$DIR/ecosystem.config.js" --only moviytaxi-backend --update-env >/dev/null
  for i in $(seq 1 40); do curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$BACKEND_PORT/public/stats" && break; sleep 2; done
  for a in moviytaxi-driver moviytaxi-admin moviytaxi-client; do
    pm2 restart "$DIR/ecosystem.config.js" --only "$a" --update-env >/dev/null; sleep 3
  done
else
  pm2 start "$DIR/ecosystem.config.js" >/dev/null
fi
pm2 save >/dev/null

if [ "$WITH_APK" = "apk" ]; then
  echo "→ APKs"
  BASE=${URL%/app.tgz}
  mkdir -p "$DIR/apk"
  for f in moviytaxi-driver.apk version.json moviytaxi-client.apk version-client.json; do
    curl -4 -fsSL --retry 3 -o "$DIR/apk/$f.part" "$BASE/apk/$f" && mv "$DIR/apk/$f.part" "$DIR/apk/$f" && echo "   $f $(du -h "$DIR/apk/$f" | cut -f1)" || echo "   $f: not published"
  done
fi

echo "→ Health"
set +e
for i in $(seq 1 60); do curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$BACKEND_PORT/public/stats" && break; sleep 3; done
pm2 jlist | python3 -c "import json,sys; [print('  ', p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name'].startswith('moviytaxi-')]"
for u in $BACKEND_PORT/public/stats $DRIVER_PORT/app $ADMIN_PORT/admin/login $CLIENT_PORT/client/login; do
  printf '   :%s -> ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 60 "http://127.0.0.1:$u"
done
df -h / | awk 'NR==2{print "   disk avail "$4}'
echo "ACTIVATE-DONE $(date -u +%FT%TZ)"
