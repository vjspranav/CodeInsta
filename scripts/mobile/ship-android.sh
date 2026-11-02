#!/usr/bin/env bash
# Build the release APK (signed with apps/mobile/credentials/codeinsta-release.keystore), run the ship gate,
# and `adb install -r` only when the gate says ok (plan Task 7.4).
#   bash scripts/mobile/ship-android.sh
# Env: ANDROID_SERIAL (device to install on; required when more than one device is connected),
#      SKIP_BUILD=1 (reuse the existing APK), APK (override path), MAX_AGE_HOURS (default 24).
# Reads .env.local with `set -a; . ./.env.local; set +a` (ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS); never prints it.
set -uo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root" || exit 1
mobile=$root/apps/mobile
apk=${APK:-$mobile/android/app/build/outputs/apk/release/app-release.apk}
pass_file=$mobile/.maestro/last-pass-android.json
keystore=$mobile/credentials/codeinsta-release.keystore

O3_HELP='No Android device is connected over adb. Owner steps (plan O3):
  1. Settings > About phone > Software information: tap Build number 7 times (enables Developer options).
  2. Settings > Developer options: turn on USB debugging (and Wireless debugging for adb over Wi-Fi).
  3. Connect (USB, or: adb pair <ip:pair-port>, then adb connect <ip:port>), unlock the phone, accept the "Allow USB debugging" prompt.
  4. Check with: adb devices   (the device must say "device", not "unauthorized")
Then run this script again (set ANDROID_SERIAL when more than one device is listed).'

if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi

# Device selection first, so a missing phone fails before a long build.
devices=$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}')
if [ -z "$devices" ]; then echo "$O3_HELP" >&2; exit 1; fi
serial=${ANDROID_SERIAL:-}
if [ -z "$serial" ]; then
  if [ "$(printf '%s\n' "$devices" | wc -l | tr -d ' ')" -ne 1 ]; then
    echo "More than one adb device is connected; set ANDROID_SERIAL to the target:" >&2
    printf '  %s\n' $devices >&2
    exit 1
  fi
  serial=$devices
fi
if [ "$serial" = "192.168.0.38:5555" ]; then echo "refusing: $serial is not the target device" >&2; exit 1; fi
printf '%s\n' "$devices" | grep -qx "$serial" || { echo "$serial is not connected (adb devices)" >&2; exit 1; }

# Build.
if [ "${SKIP_BUILD:-0}" != 1 ]; then
  [ -f "$keystore" ] || { echo "missing release keystore at apps/mobile/credentials/codeinsta-release.keystore (plan O1)" >&2; exit 1; }
  for v in ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS; do
    [ -n "${!v:-}" ] || { echo "missing $v in .env.local (the build would silently use the debug key)" >&2; exit 1; }
  done
  command -v java >/dev/null 2>&1 && java -version >/dev/null 2>&1 || { echo "no JDK found; install one (brew install --cask temurin@17) and set JAVA_HOME" >&2; exit 1; }
  (cd "$mobile" && npx expo prebuild --platform android --no-install) || { echo "expo prebuild failed" >&2; exit 1; }
  (cd "$mobile/android" && ./gradlew assembleRelease) || { echo "gradle assembleRelease failed" >&2; exit 1; }
fi
[ -f "$apk" ] || { echo "no APK at $apk" >&2; exit 1; }

# Gate.
npx tsx apps/mobile/scripts/ship-gate.ts "$pass_file" "$apk"
gate=$?
if [ "$gate" -ne 0 ]; then
  echo "not installing: run 'bash apps/mobile/.maestro/run-gate.sh android' against this APK first" >&2
  exit "$gate"
fi

adb -s "$serial" install -r "$apk" || { echo "adb install failed" >&2; exit 1; }
echo "installed $(basename "$apk") on $serial"
