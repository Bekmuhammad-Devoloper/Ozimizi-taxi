#!/usr/bin/env bash
# MOVIY TAXI — one-command production deploy from this PC (Git Bash).
#
#   bash deploy/deploy.sh          # web apps
#   bash deploy/deploy.sh apk      # web apps + rebuild/publish both Android APKs
#
# Flow (data never leaves Uzbekistan):
#   1. pack the repo             → code.tgz
#   2. Vega (build server)       → builds, publishes app.tgz over HTTPS (no data there)
#   3. VPS 189.74.100.34 (prod)  → pulls app.tgz, migrates, swaps, restarts
# Needs: `ssh vega` working, python3 + paramiko, deploy/.eskiz.pass (VPS root password).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
WITH_APK=${1:-}
PY=${PYTHON:-python}

echo "→ Pack"
cd "$REPO"
git ls-files -co --exclude-standard -z | tar --null -T - -czf "$HERE/code.tgz"
MD5=$(md5sum "$HERE/code.tgz" | cut -d' ' -f1)
echo "   code.tgz $(du -h "$HERE/code.tgz" | cut -f1) md5=$MD5"

# Vega resets SSH connections now and then — retry each remote step.
retry() { local n; for n in 1 2 3 4; do "$@" && return 0; echo "   retry $n: $*" >&2; sleep 5; done; return 1; }

echo "→ Upload to Vega"
retry scp -q -o ConnectTimeout=20 "$HERE/code.tgz" vega:/opt/moviytaxi/code.tgz
retry scp -q -o ConnectTimeout=20 "$HERE/build-on-vega.sh" "$HERE/build-apk.sh" "$HERE/build-apk-client.sh" vega:/opt/moviytaxi/
[ "$(retry ssh -o ConnectTimeout=20 vega 'md5sum /opt/moviytaxi/code.tgz | cut -d" " -f1')" = "$MD5" ] || { echo "md5 mismatch on vega"; exit 1; }

echo "→ Build on Vega (detached; SSH drops are common there)"
# APKs are built AFTER the web build (they wrap the freshly built app/ dir)
# and then copied next to the published app.tgz.
APK_STEP=""
[ "$WITH_APK" = "apk" ] && APK_STEP="&& bash build-apk.sh && bash build-apk-client.sh && cp -f apk/*.apk apk/*.json build/out/\$(cat build/token)/apk/"
retry ssh -o ConnectTimeout=20 vega "cd /opt/moviytaxi && chmod +x *.sh && : > build.log && (setsid nohup bash -c 'bash build-on-vega.sh $APK_STEP; echo EXIT=\$?' > build.log 2>&1 < /dev/null &)"
for i in $(seq 1 240); do
  LINE=$(ssh -o ConnectTimeout=20 vega 'grep -E "^EXIT=" /opt/moviytaxi/build.log' 2>/dev/null || true)
  [ -n "$LINE" ] && break
  sleep 15
done
retry ssh -o ConnectTimeout=20 vega 'grep -E "^(→|BUILD-DONE|APK-DONE|EXIT=)|rror" /opt/moviytaxi/build.log | tail -12'
URL=$(retry ssh -o ConnectTimeout=20 vega 'grep -oE "url=\S+" /opt/moviytaxi/build.log | tail -1 | cut -d= -f2')
[ -n "$URL" ] || { echo "build failed (no BUILD-DONE)"; exit 1; }

echo "→ Activate on the VPS: $URL"
# Git Bash: the command argument contains /opt/... paths, so MSYS path
# conversion must be off — which means the script path has to be Windows-style.
RRUN=$(cygpath -m "$HERE/rrun.py" 2>/dev/null || echo "$HERE/rrun.py")
# Run detached on the VPS (an SSH drop must not kill a half-done swap), then poll its log.
MSYS_NO_PATHCONV=1 "$PY" -I "$RRUN" "cd /opt/moviytaxi && : > activate.log && (setsid nohup bash pull-activate.sh '$URL' ${WITH_APK} > activate.log 2>&1 < /dev/null &) && echo started" 120 \
  || { sleep 10; MSYS_NO_PATHCONV=1 "$PY" -I "$RRUN" "cd /opt/moviytaxi && pgrep -f pull-activat[e] >/dev/null || ( : > activate.log && (setsid nohup bash pull-activate.sh '$URL' ${WITH_APK} > activate.log 2>&1 < /dev/null &) ); echo started" 120; }
for i in $(seq 1 120); do
  OUT=$(MSYS_NO_PATHCONV=1 "$PY" -I "$RRUN" "grep -E '^ACTIVATE-DONE' /opt/moviytaxi/activate.log; pgrep -f pull-activat[e] >/dev/null && echo RUNNING || echo STOPPED" 60 2>/dev/null || true)
  echo "$OUT" | grep -q "ACTIVATE-DONE" && break
  echo "$OUT" | grep -q "STOPPED" && { echo "activation stopped without ACTIVATE-DONE"; break; }
  sleep 15
done
MSYS_NO_PATHCONV=1 "$PY" -I "$RRUN" "grep -vE '^(npm (warn|notice)|query)' /opt/moviytaxi/activate.log | tail -18" 60 || true

echo "→ Public check"
for p in /api/public/stats /admin/login /client/login /app /downloads/version.json; do
  printf '   %s -> ' "$p"; curl -s -o /dev/null -w '%{http_code} via %{remote_ip}\n' --max-time 60 "https://moviytaxi.uz$p"
done
echo "DEPLOY-DONE"
