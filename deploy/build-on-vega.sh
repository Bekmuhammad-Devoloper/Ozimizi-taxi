#!/usr/bin/env bash
# MOVIY TAXI — BUILD ONLY. Runs on Vega (62.171.184.14, `ssh vega`).
#
# Vega holds NO user data: no database, no uploads, no bot tokens. It only
# compiles the code and publishes the result over HTTPS for the production
# VPS in Uzbekistan (189.74.100.34) to pull with deploy/pull-activate.sh.
#
#   /opt/moviytaxi/code.tgz → /opt/moviytaxi/app (built; APK builds read it)
#                           → /opt/moviytaxi/build/out/<token>/app.tgz (+ .md5, apk/)
#   served by Vega's nginx at https://moviytaxi.yuksalish.dev/_build-<token>/
set -eo pipefail
DOMAIN=moviytaxi.uz
DIR=/opt/moviytaxi
APP=$DIR/app
NEW=$APP.new
OUT=$DIR/build/out
TOKEN_FILE=$DIR/build/token
mkdir -p "$OUT"
[ -f "$TOKEN_FILE" ] || { openssl rand -hex 16 > "$TOKEN_FILE"; chmod 600 "$TOKEN_FILE"; }
TOKEN=$(cat "$TOKEN_FILE")
PUB="$OUT/$TOKEN"
mkdir -p "$PUB/apk"

echo "→ Code"
rm -rf "$NEW" && mkdir -p "$NEW"
tar -xzf "$DIR/code.tgz" -C "$NEW"

echo "→ Public env files (NEXT_PUBLIC_* only — secrets live on the VPS)"
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
cd "$NEW/backend" && npm ci --no-audit --no-fund && npm run build
echo "→ Driver PWA build"
cd "$NEW/driver-pwa" && npm ci --no-audit --no-fund && npm run build 2>&1 | tail -5
echo "→ Admin build"
cd "$NEW/admin-panel" && npm ci --no-audit --no-fund && npm run build 2>&1 | tail -5
echo "→ Client PWA build"
cd "$NEW/client-pwa" && npm ci --no-audit --no-fund && npm run build 2>&1 | tail -5

echo "→ Keep the build as $APP (build-apk*.sh read it); scrub anything data-like"
rm -rf "$APP.old"; [ -d "$APP" ] && mv "$APP" "$APP.old"; mv "$NEW" "$APP"
rm -rf "$APP.old" "$APP/backend/uploads" "$APP/backend/.env"

echo "→ Package"
STAMP=$(date -u +%Y%m%d-%H%M%S)
cd "$DIR"
# GNU tar exits 1 for "file changed as we read it" (npm/next leave stray
# writes for a moment) — that is harmless here, only exit ≥2 is fatal.
set +e
tar -cf - --warning=no-file-changed \
  --exclude='app/*/.next/cache' \
  --exclude='app/*/node_modules/.cache' \
  --exclude='app/driver-android/android/app/build' \
  --exclude='app/client-android/android/app/build' \
  --exclude='app/driver-android/node_modules' \
  --exclude='app/client-android/node_modules' \
  app | gzip -1 > "$PUB/app-$STAMP.tgz"
TAR_RC=${PIPESTATUS[0]}
set -e
[ "$TAR_RC" -le 1 ] || { echo "tar failed rc=$TAR_RC"; exit 1; }
md5sum "$PUB/app-$STAMP.tgz" | cut -d' ' -f1 > "$PUB/app-$STAMP.md5"
ln -sfn "app-$STAMP.tgz" "$PUB/app.tgz"
ln -sfn "app-$STAMP.md5" "$PUB/app.md5"
# keep the last two builds only
ls -t "$PUB"/app-*.tgz | tail -n +3 | xargs -r rm -f
ls -t "$PUB"/app-*.md5 | tail -n +3 | xargs -r rm -f
# latest APKs (built here by build-apk*.sh) travel with the build
cp -f "$DIR"/apk/*.apk "$DIR"/apk/*.json "$PUB/apk/" 2>/dev/null || true

echo "BUILD-DONE url=https://moviytaxi.yuksalish.dev/_build-$TOKEN/app.tgz md5=$(cat "$PUB/app.md5") size=$(du -h "$PUB/app-$STAMP.tgz" | cut -f1)"
