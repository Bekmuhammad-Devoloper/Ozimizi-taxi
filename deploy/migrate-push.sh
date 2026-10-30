#!/usr/bin/env bash
# Moviy Taxi: Vega (62.171.184.14) → Eskiz VPS (189.74.100.34) data push.
# Runs ON VEGA as root. Copies only what cannot be rebuilt from the repo:
#   - secrets.env            (JWT secret, keystore password)
#   - android-sdk/           (JDK/SDK/Gradle cache + the APK signing keystore)
#   - backend uploads/       (driver documents, receipts, avatars)
#   - the TLS certificate    (moviytaxi.uz + www + moviytaxi.yuksalish.dev)
#   - a fresh database dump
# Safe to re-run: rsync only sends what changed. Usage on Vega:
#   bash /opt/moviytaxi/migrate-push.sh            # everything (android-sdk + data)
#   bash /opt/moviytaxi/migrate-push.sh app        # the BUILT app dir (node_modules, .next, dist) + data
#   bash /opt/moviytaxi/migrate-push.sh data-only  # fast re-sync (db dump, uploads, env)
#   bash /opt/moviytaxi/migrate-push.sh cutover    # STOP Vega apps → final dump/push → run
#                                                  # migrate-restore.sh on the new server →
#                                                  # switch Vega nginx to proxy to the new server
# The new VPS (1 vCPU / 1 GB) cannot build the apps itself, so the build made
# on Vega is copied as-is ("app" mode); node 20 on both sides, same ABI.
set -uo pipefail
cd /opt/moviytaxi || exit 1
NEW=root@189.74.100.34
KEY=/opt/moviytaxi/migrate_key
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=20 -o ServerAliveCountMax=6"
MODE="${1:-all}"
echo "start $(date -u +%FT%TZ) mode=$MODE"
command -v rsync >/dev/null || { echo "rsync missing on vega"; exit 1; }
[ -f "$KEY" ] || { echo "missing $KEY (ssh-keygen -t ed25519 -N '' -f $KEY)"; exit 1; }
mkdir -p migrate

$SSH $NEW 'mkdir -p /opt/moviytaxi/migrate /opt/moviytaxi/apk' || { echo "ssh to new server failed"; exit 1; }

if [ "$MODE" = "cutover" ]; then
  # Freeze writes on Vega so the dump below is final (apps stay stopped, not deleted).
  pm2 stop moviytaxi-backend moviytaxi-driver moviytaxi-admin moviytaxi-client >/dev/null 2>&1 \
    && echo "vega apps stopped $(date -u +%FT%TZ)"
fi

tar czf migrate/letsencrypt-moviytaxi.tgz -C /etc/letsencrypt \
  live/moviytaxi.yuksalish.dev archive/moviytaxi.yuksalish.dev renewal/moviytaxi.yuksalish.dev.conf \
  && echo "cert packed"
cp /etc/nginx/sites-available/moviytaxi migrate/nginx-moviytaxi.conf && echo "nginx conf copied"
cp secrets.env migrate/secrets.env && echo "secrets copied"
cp app/backend/.env migrate/backend.env && echo "backend env copied"

docker exec moviytaxi-postgres pg_dump -U moviytaxi -d moviytaxi --no-owner --no-acl | gzip > migrate/db.sql.gz \
  && echo "db dump $(du -h migrate/db.sql.gz | cut -f1) at $(date -u +%FT%TZ)"

rsync -a -e "$SSH" migrate/ $NEW:/opt/moviytaxi/migrate/ && echo "migrate dir ok"
rsync -a -e "$SSH" app/backend/uploads/ $NEW:/opt/moviytaxi/migrate/uploads/ && echo "uploads ok"
rsync -a -e "$SSH" apk/ $NEW:/opt/moviytaxi/apk/ && echo "apk ok"
if [ "$MODE" = "all" ]; then
  rsync -a --delete -e "$SSH" android-sdk/ $NEW:/opt/moviytaxi/android-sdk/ && echo "android-sdk ok"
fi
if [ "$MODE" = "app" ]; then
  rsync -a -e "$SSH" ecosystem.config.js moviytaxi-deploy.sh build-apk.sh build-apk-client.sh $NEW:/opt/moviytaxi/ && echo "scripts ok"
  rsync -a --delete --exclude 'backend/.env' --exclude 'backend/uploads' -e "$SSH" app/ $NEW:/opt/moviytaxi/app/ && echo "app ok"
fi
echo "PUSH-DONE $(date -u +%FT%TZ)"

if [ "$MODE" = "cutover" ]; then
  echo "=== restore on the new server"
  $SSH $NEW 'bash /opt/moviytaxi/migrate-restore.sh' 2>&1 | tail -30
  if [ -f /opt/moviytaxi/vega-proxy-to-new.conf ]; then
    cp /etc/nginx/sites-available/moviytaxi "/opt/moviytaxi/nginx-moviytaxi.bak.cutover-$(date +%Y%m%d-%H%M%S)"
    cp /opt/moviytaxi/vega-proxy-to-new.conf /etc/nginx/sites-available/moviytaxi \
      && nginx -t && systemctl reload nginx && echo "vega nginx now proxies to 189.74.100.34"
  fi
  printf 'public check https://moviytaxi.uz/api/public/stats -> '
  curl -s -o /dev/null -w '%{http_code} via %{remote_ip}\n' --max-time 30 https://moviytaxi.uz/api/public/stats
  echo "CUTOVER-DONE $(date -u +%FT%TZ)"
fi
