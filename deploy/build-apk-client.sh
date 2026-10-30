#!/usr/bin/env bash
# Build + sign the Android CLIENT app from the deployed code and publish it
# at https://moviytaxi.yuksalish.dev/downloads/moviytaxi-client.apk
set -eo pipefail
export JAVA_HOME=/opt/moviytaxi/android-sdk/jdk
export ANDROID_HOME=/opt/moviytaxi/android-sdk ANDROID_SDK_ROOT=/opt/moviytaxi/android-sdk
export PATH=/opt/moviytaxi/android-sdk/node22/bin:$JAVA_HOME/bin:$PATH
export GRADLE_USER_HOME=/opt/moviytaxi/android-sdk/gradle-home
. /opt/moviytaxi/secrets.env
export MOVIY_KEYSTORE=/opt/moviytaxi/android-sdk/moviytaxi.jks MOVIY_KEYSTORE_PASS=$KEYSTORE_PASS
cd /opt/moviytaxi/app/client-android
echo "→ npm ci"; npm ci --no-audit --no-fund >/dev/null
# The web app reads the installed version from the user agent (update banner).
VER=$(grep -oP "versionName \"\K[^\"]+" android/app/build.gradle)
node -e 'const f="capacitor.config.json",c=JSON.parse(require("fs").readFileSync(f));c.appendUserAgent="MoviyClient/"+process.argv[1];require("fs").writeFileSync(f,JSON.stringify(c,null,2)+"\n")' "$VER"
echo "→ cap sync"; npx cap sync android 2>&1 | tail -2
cd android && chmod +x gradlew
echo "→ gradle assembleRelease"; ./gradlew assembleRelease --no-daemon -q 2>&1 | grep -vE "^\s*$|warning:" | tail -15
mkdir -p /opt/moviytaxi/apk
cp app/build/outputs/apk/release/app-release.apk /opt/moviytaxi/apk/moviytaxi-client.apk
VER=$(grep -oP "versionName \"\K[^\"]+" app/build.gradle)
SIZE=$(stat -c %s /opt/moviytaxi/apk/moviytaxi-client.apk)
echo "{\"version\":\"$VER\",\"builtAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"size\":$SIZE,\"url\":\"/downloads/moviytaxi-client.apk\"}" > /opt/moviytaxi/apk/version-client.json
echo "APK-CLIENT-DONE version=$VER size=$SIZE"
