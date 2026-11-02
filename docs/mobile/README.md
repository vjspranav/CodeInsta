# CodeInsta mobile: build, install, update

The app lives in `apps/mobile` (Expo, React Native New Architecture). Bundle and package id: `dev.vjspranav.codeinsta`. The iOS widget extension is `dev.vjspranav.codeinsta.widget`, sharing the App Group `group.dev.vjspranav.codeinsta`. Nothing in this document contains a secret: credentials stay in `.env.local` and in `apps/mobile/credentials/`, both gitignored.

Environment for any build: `set -a; . ./.env.local; set +a` from the repo root (the `EXPO_PUBLIC_*` values are baked into the JS bundle). Never print `.env.local`.

## Android

Prerequisites: JDK 17, the Android SDK (`~/Library/Android/sdk`), `adb` on PATH, USB debugging on and the phone listed by `adb devices` (see RUNBOOK O3). `apps/mobile/android` is generated prebuild output (gitignored) and is the folder the Android builds use. Do not run `expo prebuild` for Android over it without checking with the orchestrator.

Debug build straight to the phone (fast refresh, dev menu):

```
cd apps/mobile
npx expo run:android --device
```

Release APK (JS bundled, minified, signed with the release keystore):

```
cd apps/mobile/android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

`adb install -r` replaces the installed app and keeps its data. `scripts/mobile/ship-android.sh` wraps the release build and install in one command; prefer it when present.

### Release keystore

- Location: `apps/mobile/credentials/codeinsta-release.keystore` (gitignored).
- The keystore password and key alias are in `.env.local` as `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`. Never print or commit them.
- Android only installs an update over an existing app when both are signed by the same key. If this keystore is lost, every install must be uninstalled (losing local data) before a new build can be installed, and the app can never update in place again.
- The owner must back up the keystore file and its password somewhere outside this checkout (password manager plus an offline copy). Do this once, before the first final version goes onto the phone.

## iOS with a free Apple ID (SideStore)

No paid developer account is needed. The IPA is built unsigned and SideStore re-signs it with the owner's Apple ID on the phone. One-time phone setup is RUNBOOK O4 (Developer Mode, iloader, SideStore, LocalDevVPN, background refresh).

Build the IPA on the Mac (Xcode and CocoaPods installed, first run takes 10 to 20 minutes):

```
bash scripts/mobile/build-ipa.sh
```

It runs `npx expo prebuild --platform ios --clean`, archives with `CODE_SIGNING_ALLOWED=NO`, copies the app into `Payload/` and zips `apps/mobile/build/CodeInsta.ipa`. It prints the path and size, and fails if the archive lacks `PlugIns/widget.appex` (the widget). Set `SKIP_PREBUILD=1` to reuse an existing `apps/mobile/ios` folder. Check the contents yourself:

```
unzip -l apps/mobile/build/CodeInsta.ipa | grep -E "Payload/CodeInsta.app/Info.plist|PlugIns/widget.appex"
```

Install: AirDrop or save the IPA to Files, open SideStore, My Apps, `+`, choose `CodeInsta.ipa`. SideStore asks for the Apple ID password when it re-signs.

Free-account limits to plan around:

- The signature lasts 7 days. SideStore refreshes it automatically while LocalDevVPN is on and the phone is on Wi-Fi; open SideStore if a refresh was missed.
- At most 3 active sideloaded apps, and 10 App IDs per week (the widget extension uses one App ID, so each fresh install costs two).
- No push notifications: the push entitlement needs a paid account. The app skips push registration silently.
- App Groups may be unavailable on a free account. If so, the widget shows its empty state ("Open CodeInsta to get started") instead of data.

## iOS with the paid Apple Developer Program ($99 per year)

This path gives push, App Groups, a one-year signature and TestFlight.

1. Enroll at https://developer.apple.com/programs/enroll and wait for approval.
2. Find the Team ID (Membership details) and export it for builds: `APPLE_TEAM_ID=<team id>`. `apps/mobile/app.config.ts` passes it to `ios.appleTeamId`. It is an identifier, not a secret, but keep it in `.env.local`.
3. In the developer portal, create App IDs for `dev.vjspranav.codeinsta` and `dev.vjspranav.codeinsta.widget`; enable **Push Notifications** on the app and **App Groups** on both, using the group `group.dev.vjspranav.codeinsta`.
4. Build and sign with EAS: `cd apps/mobile && npx eas-cli build -p ios --profile production` (EAS creates the certificates and provisioning profiles after you sign in with the Apple ID).
5. Distribute with TestFlight (`npx eas-cli submit -p ios`) or install the signed build directly from the EAS page on the phone.
6. Push notifications then work: upload an APNs key through `npx eas-cli credentials` (iOS, Push Notifications).

## Updates over the air

After the first final version is installed, JavaScript and asset changes ship over the air with EAS Update (needs the Expo account, RUNBOOK O6):

```
cd apps/mobile
npx eas-cli update --branch production --message "what changed"
```

Installed apps fetch it on launch and apply it on the next relaunch, so relaunch the app twice. No Expo branding appears in the app: updates are silent.

A change that touches native code cannot ship over the air and needs a new build installed on the phone. That means anything touching `plugins/`, `modules/`, `targets/`, `native/`, `app.config.ts` native settings (permissions, icon, splash, plugin list), or any dependency version change.

- Android: build a release APK and sideload it. This only needs the "install unknown apps" permission for whichever app opens the APK (Files, browser, or `adb install -r`); developer options and wireless debugging can stay off.
- iOS: build a new IPA with `scripts/mobile/build-ipa.sh` and install it through SideStore (or a new TestFlight build on the paid path).

The runtime version keeps incompatible builds apart: an update is only delivered to builds whose runtime version it matches, so a native change needs a new build rather than an update.
