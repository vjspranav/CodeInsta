#!/usr/bin/env bash
# Maestro ship gate runner (plan Task 7.3).
#   bash apps/mobile/.maestro/run-gate.sh <android|ios>
# 1. needs at least MIN_REELS (12) live reels visible to the test member, else exits "waiting for the library"
# 2. boots the emulator or simulator and installs the latest local build
# 3. runs every flow in apps/mobile/.maestro (order in config.yaml), then ALWAYS runs the test-member cleanup
# 4. on success writes apps/mobile/.maestro/last-pass-<platform>.json {passedAt, buildSha256, gitRev}
#
# Overrides: ANDROID_SERIAL (use an already-connected device instead of booting the AVD),
#   APK (default apps/mobile/android/app/build/outputs/apk/release/app-release.apk),
#   IOS_APP (default: newest .app under apps/mobile/ios/build/Build/Products/*-iphonesimulator),
#   AVD_NAME / SIM_NAME (default codeinsta-e2e), MIN_REELS.
# Reads .env.local with `set -a; . ./.env.local; set +a`; never prints it. MAESTRO_* vars reach the flows through the shell env.
set -uo pipefail

PLATFORM=${1:-}
case "$PLATFORM" in android | ios) ;; *) echo "usage: run-gate.sh <android|ios>" >&2; exit 2 ;; esac

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
cd "$root" || exit 1
MIN_REELS=${MIN_REELS:-12}
AVD_NAME=${AVD_NAME:-codeinsta-e2e}
SIM_NAME=${SIM_NAME:-codeinsta-e2e}
APP_ID=dev.vjspranav.codeinsta
SDK=${ANDROID_HOME:-$HOME/Library/Android/sdk}

if [ ! -f .env.local ]; then echo "missing .env.local" >&2; exit 1; fi
set -a; . ./.env.local; set +a

for v in MAESTRO_EMAIL MAESTRO_PASSWORD NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "missing $v in .env.local (run: npx tsx scripts/mobile-test-user.ts create; MAESTRO_EMAIL must be an inbox you control)" >&2
    exit 1
  fi
done
command -v maestro >/dev/null || { echo "maestro is not installed (RUNBOOK E7)" >&2; exit 1; }

# 1. Library precondition, through the test member's own read of the catalog.
live=$(npx tsx apps/mobile/.maestro/live-reels.ts) || { echo "could not read the catalog as the test member" >&2; exit 1; }
count=$(node -e 'console.log(JSON.parse(process.argv[1]).count)' "$live")
reel_id=$(node -e 'console.log(JSON.parse(process.argv[1]).firstId||"")' "$live")
if [ "$count" -lt "$MIN_REELS" ]; then
  echo "waiting for the library (RUNBOOK B1): $count live reels, need at least $MIN_REELS" >&2
  exit 3
fi
echo "library ok: $count live reels"

# 2. Device, build and hash.
device_args=()
if [ "$PLATFORM" = android ]; then
  apk=${APK:-$root/apps/mobile/android/app/build/outputs/apk/release/app-release.apk}
  [ -f "$apk" ] || { echo "no release APK at $apk (the orchestrator builds Android)" >&2; exit 1; }
  adb=adb
  if [ -n "${ANDROID_SERIAL:-}" ]; then
    adb="adb -s $ANDROID_SERIAL"
    device_args=(--device "$ANDROID_SERIAL")
  else
    if ! adb devices | awk 'NR>1 && $2=="device"' | grep -q .; then
      echo "booting AVD $AVD_NAME"
      nohup "$SDK/emulator/emulator" -avd "$AVD_NAME" -no-snapshot-save -no-audio >/dev/null 2>&1 &
    fi
    adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
  fi
  $adb install -r "$apk" >/dev/null || { echo "install failed" >&2; exit 1; }
  build_sha=$(shasum -a 256 "$apk" | cut -d' ' -f1)
else
  app=${IOS_APP:-$(ls -td "$root"/apps/mobile/ios/build/Build/Products/*-iphonesimulator/*.app 2>/dev/null | head -1)}
  [ -n "$app" ] && [ -d "$app" ] || { echo "no simulator .app found (set IOS_APP)" >&2; exit 1; }
  xcrun simctl boot "$SIM_NAME" 2>/dev/null || true
  xcrun simctl bootstatus "$SIM_NAME" -b >/dev/null
  xcrun simctl install "$SIM_NAME" "$app" || { echo "install failed" >&2; exit 1; }
  # A .app is a directory: hash every file in a stable order.
  build_sha=$(cd "$app" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
  device_args=(--device "$(xcrun simctl list devices | grep "$SIM_NAME" | grep -Eo '[0-9A-F-]{36}' | head -1)")
fi

# 3. Flows, then cleanup whatever happened.
maestro "${device_args[@]}" test -e REEL_ID="$reel_id" "$here"
status=$?
npx tsx scripts/mobile-test-cleanup.ts || echo "WARNING: test member cleanup failed; rerun scripts/mobile-test-cleanup.ts" >&2
if [ "$status" -ne 0 ]; then
  echo "Maestro flows failed; no pass file written" >&2
  exit "$status"
fi

# 4. Pass record (gitignored).
git_rev=$(git rev-parse HEAD 2>/dev/null || echo unknown)
passed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
node -e '
const [file, passedAt, buildSha256, gitRev] = process.argv.slice(1);
require("fs").writeFileSync(file, JSON.stringify({ passedAt, buildSha256, gitRev }, null, 2) + "\n");
' "$here/last-pass-$PLATFORM.json" "$passed_at" "$build_sha" "$git_rev"
echo "gate passed on $PLATFORM; wrote apps/mobile/.maestro/last-pass-$PLATFORM.json"
