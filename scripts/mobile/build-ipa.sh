#!/bin/bash
# Build an unsigned iOS IPA for SideStore (SideStore re-signs it with the owner's Apple ID).
# Usage: bash scripts/mobile/build-ipa.sh            (full: prebuild, archive, package)
#        SKIP_PREBUILD=1 bash scripts/mobile/build-ipa.sh   (reuse apps/mobile/ios)
# Output: apps/mobile/build/CodeInsta.ipa. Fails when the widget extension is missing from the app.
set -euo pipefail

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
WIDGET_APPEX="${WIDGET_APPEX:-widget.appex}"
SCHEME="CodeInsta"
START=$(date +%s)

# EXPO_PUBLIC_* values are embedded in the release JS bundle. Read them without printing anything.
if [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env.local"
  set +a
fi

cd "$MOBILE"

if [ "${SKIP_PREBUILD:-0}" != "1" ]; then
  echo "[build-ipa] expo prebuild (ios only)"
  npx expo prebuild --platform ios --clean
fi

if [ ! -d "$MOBILE/ios/$SCHEME.xcworkspace" ]; then
  echo "[build-ipa] missing ios/$SCHEME.xcworkspace after prebuild" >&2
  exit 1
fi

rm -rf "$MOBILE/build/CodeInsta.xcarchive" "$MOBILE/build/Payload" "$MOBILE/build/CodeInsta.ipa"
mkdir -p "$MOBILE/build"

echo "[build-ipa] xcodebuild archive (unsigned, Release, iphoneos)"
xcodebuild archive \
  -workspace "ios/$SCHEME.xcworkspace" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -archivePath build/CodeInsta.xcarchive \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  | tee "$MOBILE/build/xcodebuild-archive.log" \
  | (command -v xcbeautify >/dev/null && xcbeautify || grep -E "^(\*\*|error:|.*: error:|.*BUILD )" || true)

APP="$MOBILE/build/CodeInsta.xcarchive/Products/Applications/$SCHEME.app"
if [ ! -d "$APP" ]; then
  echo "[build-ipa] archive has no $SCHEME.app (see build/xcodebuild-archive.log)" >&2
  exit 1
fi

if [ ! -d "$APP/PlugIns/$WIDGET_APPEX" ]; then
  echo "[build-ipa] widget extension missing: expected $APP/PlugIns/$WIDGET_APPEX" >&2
  echo "[build-ipa] PlugIns contains: $(ls "$APP/PlugIns" 2>/dev/null || echo nothing)" >&2
  exit 1
fi

mkdir -p "$MOBILE/build/Payload"
cp -R "$APP" "$MOBILE/build/Payload/"
(cd "$MOBILE/build" && zip -qry CodeInsta.ipa Payload)
rm -rf "$MOBILE/build/Payload"

# Capture the listing first: `unzip | grep -q` trips pipefail (SIGPIPE) on large archives.
LISTING="$(unzip -l "$MOBILE/build/CodeInsta.ipa")"
if ! grep -q "PlugIns/$WIDGET_APPEX" <<<"$LISTING"; then
  echo "[build-ipa] IPA lacks PlugIns/$WIDGET_APPEX" >&2
  exit 1
fi

SIZE=$(du -h "$MOBILE/build/CodeInsta.ipa" | cut -f1)
echo "[build-ipa] done in $(( $(date +%s) - START ))s"
echo "[build-ipa] IPA: $MOBILE/build/CodeInsta.ipa ($SIZE)"
