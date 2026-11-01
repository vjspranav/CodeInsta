#!/usr/bin/env bash
# Collects the Android performance numbers for the feed (plan Task 3.6) over adb.
# Needs a build made with EXPO_PUBLIC_PERF=1 installed on the device (USB debugging on).
#
#   apps/mobile/perf/android-perf.sh            # 10 cold starts, 30 swipes
#   RUNS=3 SWIPES=10 apps/mobile/perf/android-perf.sh
#
# Writes perf/out/<device>-<date>.txt (gitignored) with CI_PERF lines, `JANKY <pct>` and
# `FRAME_P95 <ms>`, then runs parse-perf.ts on it and exits with its verdict.
#
# cold_start_to_first_frame = `am start -W` TotalTime (process launch to first activity frame)
# + CI_PERF first_frame_playing (JS bundle start to the first reel playing). The two overlap a
# little, so the sum slightly overstates cold start: a pass here is a real pass.
set -uo pipefail

PKG=${PKG:-dev.vjspranav.codeinsta}
ACTIVITY=${ACTIVITY:-.MainActivity}
ADB=${ADB:-adb}
RUNS=${RUNS:-10}
SWIPES=${SWIPES:-30}
SWIPE_GAP=${SWIPE_GAP:-1.2}          # seconds between swipes
SETTLE=${SETTLE:-10}                 # seconds to wait for the first reel to play
SWIPE_ARGS=${SWIPE_ARGS:-"540 1800 540 400 120"}   # x1 y1 x2 y2 duration_ms (adjust to the screen)

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
out_dir=$here/out
mkdir -p "$out_dir"

if [ "$($ADB get-state 2>/dev/null | tr -d '\r')" != "device" ]; then
  echo "No adb device in state 'device'. Connect the phone, enable USB debugging, accept the prompt." >&2
  exit 2
fi

device=$($ADB shell getprop ro.product.model | tr -d '\r' | tr -c 'A-Za-z0-9\n' '_')
out=$out_dir/${device}-$(date +%Y-%m-%d_%H%M).txt
{
  echo "# device=$device package=$PKG runs=$RUNS swipes=$SWIPES"
  echo "# android=$($ADB shell getprop ro.build.version.release | tr -d '\r')"
} > "$out"

# Waits for the first CI_PERF first_frame_playing line in the current logcat buffer and prints its value.
wait_first_frame() {
  local value="" tries=$((SETTLE * 2)) i
  for ((i = 0; i < tries; i++)); do
    value=$($ADB logcat -d -s ReactNativeJS:V | tr -d '\r' | awk '/CI_PERF first_frame_playing/ { print $NF; exit }')
    [ -n "$value" ] && break
    sleep 0.5
  done
  printf '%s' "$value"
}

echo "Cold start: $RUNS runs"
for ((n = 1; n <= RUNS; n++)); do
  $ADB shell am force-stop "$PKG"
  $ADB logcat -c
  total=$($ADB shell am start -W -n "$PKG/$ACTIVITY" | tr -d '\r' | awk '/TotalTime/ { print $2 }')
  first=$(wait_first_frame)
  if [ -n "$total" ] && [ -n "$first" ]; then
    cold=$(awk -v a="$total" -v b="$first" 'BEGIN { printf "%.1f", a + b }')
    {
      echo "CI_PERF launch_total_time $total"
      echo "CI_PERF first_frame_playing $first"
      echo "CI_PERF cold_start_to_first_frame $cold"
    } >> "$out"
    echo "  run $n: ${cold} ms"
  else
    echo "# run $n: no sample (TotalTime='$total' first_frame_playing='$first')" >> "$out"
    echo "  run $n: no sample (is the build made with EXPO_PUBLIC_PERF=1?)" >&2
  fi
done

echo "Swipes: $SWIPES"
$ADB shell am force-stop "$PKG"
$ADB logcat -c
$ADB shell am start -W -n "$PKG/$ACTIVITY" > /dev/null
wait_first_frame > /dev/null
sleep 1
$ADB shell dumpsys gfxinfo "$PKG" reset > /dev/null
$ADB logcat -c
for ((n = 1; n <= SWIPES; n++)); do
  # shellcheck disable=SC2086
  $ADB shell input swipe $SWIPE_ARGS
  sleep "$SWIPE_GAP"
done
sleep 1
$ADB logcat -d -s ReactNativeJS:V | tr -d '\r' | grep 'CI_PERF swipe_to_play' | sed 's/^.*\(CI_PERF swipe_to_play\)/\1/' >> "$out"

gfx=$($ADB shell dumpsys gfxinfo "$PKG" | tr -d '\r')
janky=$(printf '%s\n' "$gfx" | sed -n 's/^.*Janky frames: [0-9]* (\([0-9.]*\)%).*$/\1/p' | head -1)
p95=$(printf '%s\n' "$gfx" | sed -n 's/^.*95th percentile: \([0-9.]*\)ms.*$/\1/p' | head -1)
{
  printf '%s\n' "$gfx" | grep -E 'Total frames rendered|Janky frames|percentile' | sed 's/^/# /'
  [ -n "$janky" ] && echo "JANKY $janky"
  [ -n "$p95" ] && echo "FRAME_P95 $p95"
} >> "$out"

echo "Wrote $out"
tsx=$root/node_modules/.bin/tsx
if [ -x "$tsx" ]; then
  "$tsx" "$here/parse-perf.ts" "$out"
else
  echo "Run: npx tsx apps/mobile/perf/parse-perf.ts $out"
fi
