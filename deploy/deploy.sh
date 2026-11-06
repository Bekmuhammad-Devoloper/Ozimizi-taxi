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
# RESUME=1: a build is already running on Vega — just wait for it and activate.
RESUME=${RESUME:-}

# Some shells block `sleep`; fall back to ping as a timer.
pause() { sleep "$1" 2>/dev/null || ping -n "$(( $1 + 1 ))" 127.0.0.1 >/dev/null 2>&1 || ping -c "$(( $1 + 1 ))" 127.0.0.1 >/dev/null 2>&1; }

# Vega resets SSH connections now and then — retry each remote step.
retry() { local n; for n in 1 2 3 4; do "$@" && return 0; echo "   retry $n: $*" >&2; pause 5; done; return 1; }

if [ -z "$RESUME" ]; then
echo "→ Pack"
cd "$REPO"
git ls-files -co --exclude-standard -z | tar --null -T - -czf "$HERE/code.tgz"
MD5=$(md5sum "$HERE/code.tgz" | cut -d' ' -f1)
echo "   code.tgz $(du -h "$HERE/code.tgz" | cut -f1) md5=$MD5"


echo "→ Upload to Vega"
retry scp -q -o ConnectTimeout=20 "$HERE/code.tgz" vega:/opt/moviytaxi/code.tgz
retry scp -q -o ConnectTimeout=20 "$HERE/build-on-vega.sh" "$HERE/build-apk.sh" "$HERE/build-apk-client.sh" "$HERE/build-apk-flutter.sh" vega:/opt/moviytaxi/
[ "$(retry ssh -o ConnectTimeout=20 vega 'md5sum /opt/moviytaxi/code.tgz | cut -d" " -f1')" = "$MD5" ] || { echo "md5 mismatch on vega"; exit 1; }

echo "→ Build on Vega (detached; SSH drops are common there)"
# APKs are built AFTER the web build (they wrap the freshly built app/ dir)
# and then copied next to the published app.tgz.
APK_STEP=""
[ "$WITH_APK" = "apk" ] && APK_STEP="&& bash build-apk.sh && bash build-apk-client.sh && bash build-apk-flutter.sh && cp -f apk/*.apk apk/*.json build/out/\$(cat build/token)/apk/"
retry ssh -o ConnectTimeout=20 vega "cd /opt/moviytaxi && chmod +x *.sh && : > build.log && (setsid nohup bash -c 'bash build-on-vega.sh $APK_STEP; echo EXIT=\$?' > build.log 2>&1 < /dev/null &)"
else
  echo "→ Resume: waiting for the build already running on Vega"
fi
for i in $(seq 1 240); do
  LINE=$(ssh -o ConnectTimeout=20 vega 'grep -E "^EXIT=" /opt/moviytaxi/build.log' 2>/dev/null || true)
  [ -n "$LINE" ] && break
  pause 15
done
retry ssh -o ConnectTimeout=20 vega 'grep -E "^(→|BUILD-DONE|APK-DONE|EXIT=)|rror" /opt/moviytaxi/build.log | tail -12'
URL=$(retry ssh -o ConnectTimeout=20 vega 'grep -oE "url=\S+" /opt/moviytaxi/build.log | tail -1 | cut -d= -f2')
[ -n "$URL" ] || { echo "build failed (no BUILD-DONE)"; exit 1; }

echo "→ Activate on the VPS: $URL"
# Git Bash: the command argument contains /opt/... paths, so MSYS path
# conversion must be off — which means the script path has to be Windows-style.
RRUN=$(cygpath -m "$HERE/rrun.py" 2>/dev/null || echo "$HERE/rrun.py")
RPUT=$(cygpath -m "$HERE/rput.py" 2>/dev/null || echo "$HERE/rput.py")
ACT=$(cygpath -m "$HERE/pull-activate.sh" 2>/dev/null || echo "$HERE/pull-activate.sh")
# The VPS always runs this repo's activation script.
retry env MSYS_NO_PATHCONV=1 "$PY" -I "$RPUT" "$ACT:/opt/moviytaxi/pull-activate.sh"
# Run detached on the VPS (an SSH drop must not kill a half-done swap), then poll its log.
MSYS_NO_PATHCONV=1 "$PY" -I "$RRUN" "cd /opt/moviytaxi && : > activate.log && (setsid nohup bash pull-activate.sh '$URL' ${WITH_APK} > activate.log 2>&1 < /dev/null &) && echo started" 120 \
  || { pause 10; MSYS_NO_PATHCONV=1 "$PY" -I "$RRUN" "cd /opt/moviytaxi && pgrep -f pull-activat[e] >/dev/null || ( : > activate.log && (setsid nohup bash pull-activate.sh '$URL' ${WITH_APK} > activate.log 2>&1 < /dev/null &) ); echo started" 120; }
# The VPS can take over an hour to pull the package when the Vega link is slow.
ACTIVATED=
for i in $(seq 1 480); do
  OUT=$(MSYS_NO_PATHCONV=1 "$PY" -I "$RRUN" "grep -E '^ACTIVATE-DONE' /opt/moviytaxi/activate.log; pgrep -f pull-activat[e] >/dev/null && echo RUNNING || echo STOPPED" 60 2>/dev/null || true)
  echo "$OUT" | grep -q "ACTIVATE-DONE" && { ACTIVATED=1; break; }
  echo "$OUT" | grep -q "STOPPED" && { echo "activation stopped without ACTIVATE-DONE"; break; }
  pause 15
done
MSYS_NO_PATHCONV=1 "$PY" -I "$RRUN" "grep -vE '^(npm (warn|notice)|query)' /opt/moviytaxi/activate.log | tail -18" 60 || true
[ -n "$ACTIVATED" ] || { echo "DEPLOY-NOT-CONFIRMED: no ACTIVATE-DONE (it may still be running on the VPS: /opt/moviytaxi/activate.log)"; exit 1; }

echo "→ Public check"
for p in /api/public/stats /admin/login /client/login /app /downloads/version.json; do
  printf '   %s -> ' "$p"; curl -s -o /dev/null -w '%{http_code} via %{remote_ip}\n' --max-time 60 "https://moviytaxi.uz$p"
done
echo "DEPLOY-DONE"
