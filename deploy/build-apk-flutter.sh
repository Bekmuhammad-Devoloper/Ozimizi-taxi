#!/usr/bin/env bash
# Build + sign the Flutter driver app from the deployed code.
# Same application id and keystore as the older app, so it installs over it.
#   /opt/moviytaxi/apk/moviytaxi-driver-flutter.apk + version-flutter.json
set -eo pipefail
export JAVA_HOME=/opt/moviytaxi/android-sdk/jdk
export ANDROID_HOME=/opt/moviytaxi/android-sdk ANDROID_SDK_ROOT=/opt/moviytaxi/android-sdk
export PATH=/opt/moviytaxi/android-sdk/flutter/bin:$JAVA_HOME/bin:$PATH
export GRADLE_USER_HOME=/opt/moviytaxi/android-sdk/gradle-home
export PUB_CACHE=/opt/moviytaxi/android-sdk/pub-cache
. /opt/moviytaxi/secrets.env
export MOVIY_KEYSTORE=/opt/moviytaxi/android-sdk/moviytaxi.jks MOVIY_KEYSTORE_PASS=$KEYSTORE_PASS
cd "${1:-/opt/moviytaxi/app/driver-flutter}"
echo "→ pub get"; flutter pub get >/dev/null
echo "→ tests"; flutter test test/logic_test.dart 2>&1 | tail -1
echo "→ flutter build apk"; flutter build apk --release --target-platform android-arm,android-arm64 2>&1 | tail -3
mkdir -p /opt/moviytaxi/apk
cp build/app/outputs/flutter-apk/app-release.apk /opt/moviytaxi/apk/moviytaxi-driver-flutter.apk
VER=$(grep -oP '^version: \K[^+]+' pubspec.yaml)
SIZE=$(stat -c %s /opt/moviytaxi/apk/moviytaxi-driver-flutter.apk)
echo "{\"version\":\"$VER\",\"builtAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"size\":$SIZE,\"url\":\"/downloads/moviytaxi-driver-flutter.apk\"}" > /opt/moviytaxi/apk/version-flutter.json
echo "APK-FLUTTER-DONE version=$VER size=$SIZE"
