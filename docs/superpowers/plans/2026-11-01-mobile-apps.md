# CodeInsta Mobile Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Android and iOS Expo apps (feed, explore, profiles, inbox, ask, owner review, widgets, push) that behave like the web app, with a shared feed-ranking package and a Maestro-gated install on the owner's phone.

**Architecture:** `apps/mobile` is a standalone Expo package (own `package.json` and lockfile, no root npm workspace). `packages/shared` is plain TypeScript (types, validation, `orderFeed` and friends, overlay-zone math, widget snapshot) consumed by web through relative imports and by mobile through Metro `watchFolders` plus tsconfig paths `@shared/*`. The apps talk to Supabase directly (anon key plus user session). Backend additions are additive migrations only: a streak RPC and `push_tokens` with an Expo-push edge function. Widgets never call Supabase: the app writes a snapshot to shared storage (iOS App Group, Android SharedPreferences) and the widgets render it.

**Tech Stack:** Expo SDK (latest stable, pinned exactly at E2.1), React Native New Architecture, TypeScript, expo-router, expo-video, expo-image, FlashList v2 (or a paged pager), Reanimated, expo-haptics, expo-notifications, expo-secure-store, TanStack Query, lucide-react-native, jest-expo + @testing-library/react-native, Jetpack Glance, WidgetKit via expo-apple-targets, EAS Build/Update, Maestro. Shared package tests run in the root vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-mobile-apps-design.md` (approved 2026-11-01, including its "Calls made" section). Read it and `docs/RUNBOOK.md` section E first.

## Global Constraints

- Package and bundle ID: `dev.vjspranav.codeinsta` (iOS widget extension: `dev.vjspranav.codeinsta.widget`; App Group: `group.dev.vjspranav.codeinsta`; URL scheme: `codeinsta`).
- Expo SDK latest stable at build time, New Architecture on. Pin exact versions at implementation time (`npm view <pkg> version`, then write the number). No `latest`, `^`, `~` ranges in `apps/mobile/package.json`; set `save-exact=true` in `apps/mobile/.npmrc`.
- Never `supabase config push`. Migrations: `npx supabase db push --linked -p "$SUPABASE_DB_PASSWORD"` (PROD step, owner approval or allow rule). Env: `set -a; . ./.env.local; set +a` (never print it).
- No emojis anywhere: UI, copy, notifications, widgets, native strings. Lucide line icons only. Plain arrows (→ ← ↓) are fine. Mobile gets its own `no-emoji.test.ts` (Task 2.2); push copy is covered by Task 4.7.
- Overlay zones come from `packages/shared/overlay-zones.json` (video space 720x1280; zones `topControls`, `rightRail`, `bottomMeta`). Series order is a hard rule: shared `seriesInOrder` and `withEarlierParts` are the only implementation.
- Reels are full-bleed: video fills the screen width, no gutters, controls float over it.
- Targets: cold start to first frame playing < 1.5 s; swipe to next reel playing < 150 ms when preloaded; 60 fps scrolling; next 2 reels preloaded.
- Auth: Google native sign-in gives an ID token, then Supabase `signInWithIdToken({provider:"google", token, nonce: raw})` where the Google token carries SHA-256(raw). Email/password stays. Invite-only via `redeem_invite`; owner = allowlisted email plus Google identity (server-checked, never client-trusted). RLS stays the boundary; member text never reaches AI creators.
- Web stays at the repo root and its behavior must not change: `npm test`, `npm run lint`, `npm run build` stay green after every task that touches root files.
- Ownership: Codex owns `apps/mobile/app/**` screens and `apps/mobile/src/ui/**` components (UI). Claude owns `supabase/**`, `src/app/api/**` additions, `packages/shared/**`, `scripts/**`, and everything else under `apps/mobile` (data layer, auth, engine, config, native plugins, tests, Maestro). Scaffold and root tooling normally belong to Codex; where this plan marks them **[claude]** it is the spec-sanctioned stand-in, recorded in `docs/coordination/claude-status.md` and `decisions.md` entry (Task 1.1 Step 1).
- Commits: only your own paths, `git add <paths>`, prefix `[claude]` (or `[codex]` when Claude commits Codex output), push only when dispatched.

## Conventions

- **Owner marks:** every task is **[claude]** or **[codex]**. Codex tasks are self-contained briefs: the orchestrator copies the brief block verbatim to `docs/coordination/codex-queue/NN-name.md` (queue number given as `Queue:`), and `scripts/schedule/codex-queue.sh` runs the oldest first. A Codex brief never depends on another Codex brief's unmerged work except where its `Needs:` line names a Claude task that must be committed first. Codex cannot write `.git`; Claude reviews and commits output.
- **Test IDs:** all interactive UI elements carry `testID`s from `apps/mobile/src/testids.ts` (`TID`, Task 2.2). Maestro flows (E7) depend on them.
- **Mobile test commands:** `cd apps/mobile && npx jest <path>`; types: `cd apps/mobile && npx tsc --noEmit`. Shared tests: `npx vitest run packages/shared` from the repo root.
- **Pinned-version steps** say "pin": run `npm view <pkg> version`, install that exact version with `npx expo install` (for Expo-managed packages) or `npm i -E`, and record the numbers in `docs/coordination/claude-status.md`.

## Review Focus

Failure modes the spec implies but its feature list does not test; each has a pinning test in the named task.

1. **Empty or tiny library** (fewer than 3 live reels, or none yet): feed shows an empty state, preload window clamps, widget shows a "Nothing new yet" state, no crash. Tests: 3.2 (`preloadWindow` clamps), 5.1 (`buildSnapshot` with no reels).
2. **Session ends mid-use** (expired refresh token, membership removed, sign-out): app returns to login, widget snapshot is cleared, push token is deleted. Tests: 2.5 (`useAuth` status on refresh failure), 5.2 (sign-out clears snapshot), 4.8 (token removed on sign-out).
3. **Bad rows and offline swipes:** a reel with no `video_url`, an expired news reel, or a failed video load never crashes or shows a spinner between reels; a failed like or dislike rolls back; deep link to Part 3 with Parts 1 and 2 unseen plays 1, 2, then 3. Tests: 2.6 (rows dropped), 3.3 (rollback, `23505` treated as success), 3.2 (`ReelVideo` error state shows retry, not spinner).
4. **Privacy of notifications and logs:** the push body never contains member or creator message text (Expo servers relay it); sign-in errors never include the ID token or nonce; no secret is in a tracked file (only `EXPO_PUBLIC_*` anon values). Tests: 4.7, 2.5, 1.1 (`secrets` scan).
5. **Free Apple ID limits:** push entitlement and possibly App Groups are unavailable; the iOS app must still launch, skip push registration silently, and the widget must show its empty state instead of crashing when no snapshot is readable. Tests: 4.8 (registration failure is non-fatal), 5.1 (`parseSnapshot(null)`), 6.1 (device check).

## File Structure

```
packages/shared/
  overlay-zones.json                 (exists)
  src/feed.ts                        orderFeed, scoreFeed, seriesInOrder, withEarlierParts, FeedContext, FeedRow
  src/feed.test.ts                   moved from src/components/reel/timeline.test.ts
  src/types.ts                       Category, Creator, MobileReel, GlossaryEntry
  src/validation.ts                  validInvite, isLabReel, DAILY_ASKS, isValidSlug
  src/overlay-zones.ts               Zone, zonePercent
  src/streak.ts                      computeStreak (reference for the SQL RPC)
  src/widget-snapshot.ts             WidgetSnapshot, buildSnapshot, parseSnapshot
  src/index.ts                       barrel
src/components/reel/{timeline,overlay-zones,playable-content}.ts, src/lib/supabase/invites.ts   re-export from shared (web behavior unchanged)
src/app/api/mobile/bootstrap/route.ts   owner bootstrap for native sign-in
supabase/migrations/0012_streak.sql, 0013_push_tokens.sql; supabase/functions/push/; supabase/tests/0012_streak.sql
apps/mobile/
  app/**                             expo-router screens                         (Codex)
  src/ui/**                          components                                  (Codex)
  src/theme/tokens.ts, src/testids.ts, src/no-emoji.test.ts
  src/lib/{supabase,secure-storage,env}.ts
  src/auth/{nonce,google,useAuth,bootstrap}.ts
  src/data/{queries,library,feedSession,asks,explore,profiles,inbox,requests,owner,interests}.ts
  src/feed/{layout,preload,playerPool,playback}.ts, src/feed/ReelVideo.tsx
  src/push/register.ts, src/widgets/sync.ts, src/perf/probe.ts
  modules/widget-bridge/             local Expo module (Kotlin + Swift): setSnapshot, reloadWidgets
  plugins/with-android-widget/, native/android/widget/, targets/widget/ (expo-apple-targets)
  .maestro/*.yaml, perf/*, scripts/ship-gate.ts, eas.json, app.config.ts, metro.config.js, .env.example
docs/mobile/README.md, docs/mobile/perf-results.md
```

## OWNER steps (all click-by-click; each is also a gate in the task that needs it)

### O1. Android OAuth client (needed before Task 2.5 verification on a device)

1. Get the SHA-1 of the keystore that signs the build you install.
   - Debug build (`npx expo run:android`, after `npx expo prebuild --platform android` has generated `apps/mobile/android`):
     `keytool -list -v -alias androiddebugkey -keystore /Users/vjspranav/Projects/CodeInsta/apps/mobile/android/app/debug.keystore -storepass android -keypass android | grep "SHA1:"`
   - The generic Android Studio debug key (only if you build outside Expo): `keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android | grep "SHA1:"`
   - Release build (created once in Task 7.5):
     `keytool -genkeypair -v -storetype PKCS12 -keystore /Users/vjspranav/Projects/CodeInsta/apps/mobile/credentials/codeinsta-release.keystore -alias codeinsta -keyalg RSA -keysize 2048 -validity 10000`, then
     `keytool -list -v -alias codeinsta -keystore /Users/vjspranav/Projects/CodeInsta/apps/mobile/credentials/codeinsta-release.keystore | grep "SHA1:"`
     (`credentials/` is git-ignored; back the file and its password up in your password manager. Losing it means reinstalling over a new signature.)
2. Open https://console.cloud.google.com/ and select the same project that holds the existing CodeInsta web OAuth client.
3. Left menu: APIs & Services, then Credentials, then Create credentials, then OAuth client ID.
4. Application type: **Android**. Name: `CodeInsta Android debug` (repeat once more later for release: `CodeInsta Android release`, one client per SHA-1).
5. Package name: `dev.vjspranav.codeinsta`. SHA-1 certificate fingerprint: paste the value from step 1 (format `AA:BB:...`). Create. (Android clients have no secret; nothing else to copy.)
6. Copy the existing **Web** OAuth client's Client ID (the one the website uses): native sign-in requests the ID token for the web client. Put it in `/Users/vjspranav/Projects/CodeInsta/apps/mobile/.env.local` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<id>` (git-ignored).
7. Supabase dashboard, project CodeInsta: Authentication, Providers, Google. In **Authorized Client IDs** enter, comma separated and without spaces, the web client ID first, then the Android client ID(s), then (after O2) the iOS client ID. Leave **Skip nonce checks** off. Save. (Dashboard only: never `supabase config push`.)
8. If the OAuth consent screen is in Testing status, confirm your Google account is listed under Test users.

### O2. iOS OAuth client (before Task 2.5 iOS verification)

1. Same console, Credentials, Create credentials, OAuth client ID, Application type **iOS**, Name `CodeInsta iOS`.
2. Bundle ID: `dev.vjspranav.codeinsta`. Create.
3. Copy the **Client ID** (`<digits>-<hash>.apps.googleusercontent.com`) into `apps/mobile/.env.local` as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<id>`.
4. Copy the **iOS URL scheme** shown on the client page (`com.googleusercontent.apps.<digits>-<hash>`, the client ID reversed) as `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=<scheme>`.
5. Add the iOS client ID to Supabase Authorized Client IDs (O1 step 7).

### O3. USB debugging and ADB (Galaxy Z Flip 8) (before Task 2.1 device check)

1. On the phone: Settings, About phone, Software information, tap **Build number** 7 times, enter your PIN. Developer options now appears at the bottom of Settings.
2. Settings, Security and privacy, **Auto Blocker**: turn it **off** (it blocks installing apps by cable and ADB commands).
3. Settings, Developer options: turn **USB debugging** on, confirm.
4. Connect the phone to the Mac with a data-capable USB cable. Choose "File transfer" if the USB notification asks.
5. A dialog "Allow USB debugging?" appears on the phone: tick **Always allow from this computer**, tap **Allow**.
6. On the Mac: `adb devices` must list the phone with state `device` (not `unauthorized`, not `offline`). If `unauthorized`: `adb kill-server && adb devices` and accept the dialog again (Developer options, Revoke USB debugging authorizations, then reconnect).
7. Optional wireless: Developer options, Wireless debugging, Pair device with pairing code, then `adb pair <ip:port>` and `adb connect <ip:port>`.

### O4. SideStore for iOS (before Task 6.1 device install). Screens change between SideStore releases; if one differs, follow https://docs.sidestore.io and keep these goals.

1. iPhone: Settings, Privacy & Security, **Developer Mode** on; the phone restarts; confirm Turn On after restart.
2. Mac: install **iloader** from https://github.com/nab138/iloader (download the macOS release and open it). Connect the iPhone by USB, tap **Trust** on the phone.
3. In iloader sign in with your Apple ID (free is fine; a second, dedicated Apple ID is advisable). Choose **Install SideStore**. It installs SideStore and the pairing file.
4. iPhone: Settings, General, VPN & Device Management, tap your Apple ID under Developer App, **Trust**.
5. App Store: install **LocalDevVPN** (SideStore uses a loopback VPN to refresh apps), open it and switch it on; SideStore's refresh only works while it is on.
6. Open SideStore, Settings: enable Background Refresh. Turn on iOS Settings, General, Background App Refresh for SideStore.
7. After Task 6.1 produces `CodeInsta.ipa`: AirDrop or save the IPA to Files, open SideStore, My Apps, **+**, pick `CodeInsta.ipa`. Re-signing needs your Apple ID password each time it asks.
8. Free-account limits to expect: a 7-day signature (SideStore refreshes automatically while LocalDevVPN is on and the phone is on Wi-Fi), 3 active sideloaded apps, 10 App IDs per week (the widget extension counts as one), no push notifications. Paid path ($99/yr): see `docs/mobile/README.md` (Task 6.3).

### O5. Android push credentials (before Task 4.6 verification on Android)

1. https://console.firebase.google.com, Add project `codeinsta` (analytics off).
2. Project settings, Your apps, Add app, Android, package name `dev.vjspranav.codeinsta`, register, download `google-services.json` into `/Users/vjspranav/Projects/CodeInsta/apps/mobile/credentials/google-services.json` (git-ignored; `app.config.ts` reads its path from `GOOGLE_SERVICES_JSON`).
3. Project settings, Service accounts, **Generate new private key** for the Firebase Admin SDK; run `cd apps/mobile && eas credentials` (Android, Push Notifications: FCM V1, upload that key). Do not commit the JSON.

### O6. Expo / EAS account (before Task 6.2)

1. https://expo.dev/signup (free). 2. `cd apps/mobile && npx eas-cli login`. 3. `npx eas-cli init` (writes the project ID into `app.config.ts` extra via env `EAS_PROJECT_ID`; Claude records it in status). 4. `npx eas-cli update:configure`.

---

# Phase E1: Workspace and `packages/shared`

Deliverable: shared package exists, web consumes it, `npm test`, `npm run lint`, `npm run build` all green and identical in behavior; streak RPC exists.

### Task 1.1: Root tooling guard and baseline [claude]

**Files:**
- Create: `vitest.config.ts`
- Modify: `tsconfig.json` (exclude `apps`), `eslint.config.mjs` (ignore `apps/**`, `packages/**/node_modules`), `.gitignore` (add `apps/mobile/credentials/`, `apps/mobile/.env.local`, `apps/mobile/android/`, `apps/mobile/ios/`, `apps/mobile/.expo/`)
- Modify: `docs/coordination/claude-status.md`, `docs/coordination/decisions.md` (stand-in record, `views` decision below)
- Test: `src/secrets.test.ts`

**Interfaces:**
- Produces: root vitest ignores `apps/**` (jest-expo tests live there) and still runs everything it ran before.

- [x] **Step 1:** Record the stand-in and two decisions in `claude-status.md` and `decisions.md`: (a) Claude does workspace tooling for `apps/mobile` because the spec allows it; (b) streak and "seen" sync use the existing `public.views` table (same shape as the spec's `reel_views`, own-row RLS, web already reads it) plus a new RPC, instead of a duplicate `reel_views` table; owner may override.
- [x] **Step 2:** Baseline: `npx vitest run 2>&1 | tail -8`, `npm run lint`, `npx tsc --noEmit`; write the file and test counts into `claude-status.md`.
- [x] **Step 3:** Write the failing test `src/secrets.test.ts`: `it("tracked files hold no live secrets")` runs `git ls-files` and asserts no line in `apps/mobile/**`, `docs/**`, `supabase/**` matches `/(SERVICE_ROLE|AGENT_TOKEN|PRIVATE KEY|sk-[A-Za-z0-9]{20,})\s*[=:]\s*\S{16,}/`, and that `apps/mobile/credentials/` and `.env.local` paths are not tracked. Run `npx vitest run src/secrets.test.ts`: expected PASS now (guard), and it must fail if you stage a dummy `.env.local` line locally (check once, then unstage).
- [x] **Step 4:** Create `vitest.config.ts` using `defineConfig({ test: { exclude: [...configDefaults.exclude, "apps/**"] } })`. If baseline counts show `render/**` tests were not previously collected, keep them excluded the same way; the goal is identical counts.
- [x] **Step 5:** Add `"apps"` to `tsconfig.json` `exclude`; add the eslint ignores; update `.gitignore`.
- [x] **Step 6:** Verify: `npx vitest run` shows the same test counts as the baseline (plus `secrets.test.ts`); `npm run lint` and `npx tsc --noEmit` clean.
- [ ] **Step 7:** Commit: `git add vitest.config.ts tsconfig.json eslint.config.mjs .gitignore src/secrets.test.ts docs/coordination/claude-status.md docs/coordination/decisions.md && git commit -m "[claude] E1: root tooling guard for apps/mobile (stand-in)"`

### Task 1.2: Move feed ordering to `packages/shared` [claude]

**Files:**
- Create: `packages/shared/src/feed.ts`, `packages/shared/src/feed.test.ts`, `packages/shared/src/index.ts`
- Modify: `src/components/reel/timeline.ts` (remove the moved code, re-export), `src/components/reel/timeline.test.ts` (remove the moved describe blocks)

**Interfaces:**
- Produces (`@shared/feed`, exact as today): `type FeedContext = { areas: string[]; liked: Set<string>; fulfilled: Set<string>; disliked?: Set<string>; now?: number }`; `type FeedRow` (id, creator_id, created_at, topic?, series?, series_index?, parent_reel_id?, genre?, style?); `scoreFeed<T extends FeedRow>(rows: T[], seen: Set<string>, context: FeedContext): Map<string, number>`; `seriesInOrder<T extends FeedRow>(list: T[]): T[]`; `withEarlierParts<T extends FeedRow>(target: T, all: T[], seen: Set<string>): T[]`; `orderFeed<T extends FeedRow>(rows: T[], seen: Set<string>, context?: FeedContext): T[]`.

- [x] **Step 1:** Move the `orderFeed`, `scoreFeed`, `seriesInOrder` and `withEarlierParts` tests out of `timeline.test.ts` into `packages/shared/src/feed.test.ts` (importing `./feed`), keeping every assertion verbatim. Add one new test: `it("deep link to Part 3 with Parts 1 and 2 unseen plays 1, 2, 3")` using `withEarlierParts` on rows with topics ending `/part-1..3`.
- [x] **Step 2:** Run `npx vitest run packages/shared`: expected FAIL (module `./feed` missing).
- [x] **Step 3:** Move the code and the `FeedContext`/`FeedRow` types, unchanged, to `packages/shared/src/feed.ts` (no React or `@/` imports). `index.ts` re-exports `./feed`. In `timeline.ts` replace the moved code with `export { orderFeed, scoreFeed, seriesInOrder, withEarlierParts } from "../../../packages/shared/src/feed"; export type { FeedContext } from "../../../packages/shared/src/feed";` (relative import, same pattern as `overlay-zones.ts`).
- [x] **Step 4:** Run `npx vitest run` (counts equal baseline plus the new test), `npx tsc --noEmit`, `npm run lint`, `npm run build`: all green.
- [ ] **Step 5:** Commit: `git add packages/shared src/components/reel/timeline.ts src/components/reel/timeline.test.ts && git commit -m "[claude] E1: move orderFeed and series ordering to packages/shared"`

### Task 1.3: Shared types, validation, overlay math [claude]

**Files:**
- Create: `packages/shared/src/{types,validation,overlay-zones}.ts` and tests `validation.test.ts`, `overlay-zones.test.ts`
- Modify: `packages/shared/src/index.ts`; `src/lib/supabase/invites.ts` (re-export `validInvite`), `src/components/reel/playable-content.ts` (re-export `isLabReel`), `src/components/reel/overlay-zones.ts` (import `zonePercent`, `Zone` from shared; `zoneStyle*` stay web-only); `src/components/data.tsx` (re-export `Category`, `Creator` types from shared; `DAILY_ASKS` from shared)

**Interfaces:**
- Produces: `type Category = { slug: string; label: string; description: string }`; `type Creator = { id: string; display_name: string; handle: string; bio: string; avatar_url: string | null }`; `type GlossaryEntry = { term: string; full: string; note?: string }`; `type MobileReel = { id; creator_id; title; topic; tags: string[]; series: string | null; series_index: number | null; created_at: string; video_url: string; poster_url: string | null; glossary: GlossaryEntry[] | null; parent_reel_id: string | null; genre: string | null; style: string | null; expires_at: string | null }`; `validInvite(invite, now?)` (same logic as web); `isLabReel(reel: { topic: string }): boolean` (regex `/^(lab|lab-v3)\//`); `DAILY_ASKS = 3`; `isValidSlug(s: string): boolean` (`/^[a-z0-9-]{2,40}$/`); `Zone`, `zonePercent(zone, video?)` (same rounding as web).

- [x] **Step 1:** Write tests: copy the `validInvite` cases from `src/lib/supabase/invites.test.ts` and the `zonePercent` assertions from `overlay-zones.test.ts` (expected values `left: 61.1111, top: 0, width: 38.8889, height: 8.5938, bottom: 91.4063`) into the shared tests; add `isLabReel("lab/x") === true`, `isLabReel("lab-v3/x") === true`, `isLabReel("os/x") === false`, `isValidSlug("a")===false`, `isValidSlug("tech-news")===true`.
- [x] **Step 2:** Run `npx vitest run packages/shared`: expected FAIL.
- [x] **Step 3:** Implement the files by moving the existing function bodies; web files keep their exports through re-exports so no web import changes. `MobileReel.expires_at`: first run `grep -rn expires_at supabase/migrations`; if `reels` has no such column, document in `types.ts` that it is selected as `script->>expires_at`.
- [x] **Step 4:** Run `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`: all green, web test count unchanged apart from moved tests.
- [ ] **Step 5:** Commit with `git add packages/shared src/lib/supabase/invites.ts src/components/reel/playable-content.ts src/components/reel/overlay-zones.ts src/components/data.tsx`; message `[claude] E1: shared types, validation, overlay math`.

### Task 1.4: Streak RPC (migration 0012) [claude]

**Files:**
- Create: `supabase/migrations/0012_streak.sql`, `supabase/tests/0012_streak.sql`, `packages/shared/src/streak.ts`, `packages/shared/src/streak.test.ts`

**Interfaces:**
- Produces (SQL): `public.learning_streak(tz text default 'UTC') returns integer`, `security invoker`, granted to `authenticated`, reads only `public.views` rows of `auth.uid()`. Produces (TS): `computeStreak(seenAt: string[], today: Date, tz: string): number`.
- Definition: the count of consecutive local calendar days, ending today (or ending yesterday if nothing seen today yet), on which the user has at least one `views` row.

- [x] **Step 1:** Write `streak.test.ts`: `[]` returns 0; seen today only returns 1; today and yesterday returns 2; yesterday and the day before with nothing today returns 2 (streak alive until local midnight); a gap returns the run ending at the latest day only if that day is today or yesterday else 0; `tz = "Asia/Kolkata"` puts `2026-11-01T19:00:00Z` on Nov 2 local.
- [x] **Step 2:** Run `npx vitest run packages/shared/src/streak.test.ts`: FAIL.
- [x] **Step 3:** Implement `computeStreak` using `Intl.DateTimeFormat("en-CA", { timeZone })` to get local `YYYY-MM-DD` keys.
- [x] **Step 4:** Run the test: PASS.
- [x] **Step 5:** Write `0012_streak.sql`: `create index if not exists views_user_seen_idx on public.views (user_id, seen_at desc);` plus the function (gaps-and-islands over distinct `(seen_at at time zone tz)::date`, same definition as above; validate `tz` against `pg_timezone_names` and raise `22023` when unknown). Write `supabase/tests/0012_streak.sql`: inside `begin; ... rollback;` insert a temp `auth.users` row and `views` rows for the six cases above, `set local role authenticated` with `request.jwt.claims` set to that user, `do $$ ... assert ... $$;` on each case.
- [ ] **Step 6 (PROD, needs owner approval or allow rule):** `set -a; . ./.env.local; set +a; npx supabase db push --linked -p "$SUPABASE_DB_PASSWORD"` then `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0012_streak.sql`: expected ends with `ROLLBACK`, no error. If approval is missing write "waiting for OWNER approval: db push 0012" in `claude-status.md` and continue.
- [ ] **Step 7:** Commit `git add supabase/migrations/0012_streak.sql supabase/tests/0012_streak.sql packages/shared/src/streak*.ts`; message `[claude] E1: learning_streak RPC over views`.

### Task 1.5: Web streak chip [codex]

Queue: `30-web-streak.md`. Needs: Task 1.4 committed and applied.

```
GOAL: Show the learning streak on the web profile area using the existing RPC.
READ FIRST: COORDINATION.md, docs/coordination/decisions.md (no emojis rule), src/components/data.tsx, src/app/profiles/page.tsx, packages/shared/src/streak.ts.
MODIFY ONLY: src/components/data.tsx (add `streak: number` to context, loaded with `browserDb().rpc("learning_streak", { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })`, best-effort: a failed call yields 0 and never blocks the feed), src/app/profiles/page.tsx (a small "N day streak" line with a lucide icon, hidden when 0), src/app/globals.css (styles).
DO NOT TOUCH: supabase/**, packages/shared/**, src/app/api/**, any other page.
ACCEPTANCE: add src/components/streak-label.test.ts (pure helper `streakLabel(n)`: 0 returns "", 1 returns "1 day streak", 5 returns "5 day streak"); npm test, npm run lint, npm run build all pass; src/no-emoji.test.ts passes.
```

# Phase E2: App shell and auth

Deliverable: signed-in member sees four empty tabs on an Android dev build over ADB; owner bootstrap works; invite and onboarding gates behave like web.

### Task 2.1: Scaffold `apps/mobile` [claude] (stand-in; needs O3 for the device check)

**Files:**
- Create: `apps/mobile/**` (Expo project), `apps/mobile/.npmrc` (`save-exact=true`), `apps/mobile/app.config.ts`, `apps/mobile/metro.config.js`, `apps/mobile/tsconfig.json`, `apps/mobile/eas.json`, `apps/mobile/.env.example`, `apps/mobile/jest.config.js`, `apps/mobile/src/config.test.ts`

**Interfaces:**
- Produces: `app.config.ts` exporting config with `name: "CodeInsta"`, `slug: "codeinsta"`, `scheme: "codeinsta"`, `ios.bundleIdentifier` and `android.package` both `dev.vjspranav.codeinsta`, `newArchEnabled: true`, `extra` reading `EXPO_PUBLIC_*`. tsconfig `paths: { "@shared/*": ["../../packages/shared/src/*"], "@/*": ["./src/*"] }`; Metro `watchFolders: [path.resolve(__dirname, "../../packages/shared")]` and `resolver.extraNodeModules` mapping `@shared`.

- [ ] **Step 1:** Pin: `npm view expo version`; scaffold with `npx create-expo-app@<that version> apps/mobile --template blank-typescript --no-install`, then `cd apps/mobile && npm i -E`; use `npx expo install` for every Expo-managed package (expo-router, expo-video, expo-image, expo-secure-store, expo-crypto, expo-haptics, expo-notifications, expo-linking, expo-updates, expo-background-task, react-native-reanimated, react-native-gesture-handler, react-native-safe-area-context, react-native-screens, @shopify/flash-list) and `npm i -E` for `@supabase/supabase-js`, `@tanstack/react-query`, `lucide-react-native`, `react-native-svg`, `@react-native-google-signin/google-signin`, devDeps `jest-expo`, `jest`, `@testing-library/react-native`, `@types/jest`. Confirm the Google package supports a `nonce` option on Android Credential Manager and iOS; if it does not, note it in `claude-status.md` and use `react-native-credential-manager` for Android instead (same `getIdToken(nonceHash)` wrapper in Task 2.5).
- [ ] **Step 2:** Write the failing `src/config.test.ts`: (a) every dependency version in `package.json` matches `/^\d+\.\d+\.\d+(-[\w.]+)?$/` (no `^`, `~`, `latest`, `*`); (b) the resolved `app.config.ts` has the package/bundle ID, scheme and `newArchEnabled === true`; (c) `eas.json` has profiles `development`, `preview`, `production` with channels `development`, `preview`, `production`.
- [ ] **Step 3:** Run `cd apps/mobile && npx jest src/config.test.ts`: FAIL until the config exists.
- [ ] **Step 4:** Write the config files per the Interfaces block; `app.config.ts` also sets `plugins` for `expo-router`, `expo-secure-store`, `expo-video`, `expo-notifications` (Android icon and color later) and `@react-native-google-signin/google-signin` with `iosUrlScheme` from `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`; `android.googleServicesFile` from `GOOGLE_SERVICES_JSON` when set.
- [ ] **Step 5:** Verify: `npx jest src/config.test.ts` PASS; `npx tsc --noEmit` clean; `npx expo-doctor` reports no failed checks; from the repo root `npm test && npm run lint && npm run build` still green (Task 1.1 guards).
- [ ] **Step 6 (OWNER gate O3):** `npx expo prebuild --platform android`, then `npx expo run:android --device` with the phone connected: the blank app opens on the phone. Record in `claude-status.md`.
- [ ] **Step 7:** Commit `git add apps/mobile docs/coordination/claude-status.md` (excluding `android/`, `ios/`, `.env.local` via `.gitignore`); message `[claude] E2: scaffold apps/mobile (Expo SDK <version>)`.

### Task 2.2: Tokens, test IDs, no-emoji test [claude]

**Files:**
- Create: `apps/mobile/src/theme/tokens.ts`, `tokens.test.ts`, `apps/mobile/src/testids.ts`, `apps/mobile/src/no-emoji.test.ts`

**Interfaces:**
- Produces `tokens`: `{ color: { paper, ink, inkMuted, line, accent, accentInk, danger, scrim }, space: { 1..8 }, radius: { sm, md, lg }, type: { title, body, caption, mono } }`. Placeholder values: paper `#F7F4EC`, ink `#1B1A17`, accent `#E4572E`, accentInk `#FFFFFF`; all neutral placeholders that the brand pick (D2) replaces by editing this one file. Exports `contrast(fg: string, bg: string): number`.
- Produces `TID` (string constants): `login-google`, `login-email`, `login-password`, `login-submit`, `join-code`, `join-submit`, `tab-feed`, `tab-explore`, `tab-inbox`, `tab-profiles`, `reel-page` (prefix, `reel-page-<index>`), `reel-like`, `reel-dislike`, `reel-ask`, `reel-sound`, `reel-pause`, `reel-undo`, `reel-glossary`, `reel-share`, `reel-next-part`, `ask-input`, `ask-send`, `inbox-thread-<creatorId>`, `dm-input`, `dm-send`, `request-input`, `request-send`, `review-approve`, `review-reject`, `pending-badge`, `streak-chip`.

- [ ] **Step 1:** Write `tokens.test.ts`: `contrast(ink, paper) >= 7`, `contrast(accentInk, accent) >= 4.5`, `contrast(inkMuted, paper) >= 4.5`; and `testids.test.ts`: all values unique, kebab-case.
- [ ] **Step 2:** Write `no-emoji.test.ts` using the same `EMOJI` regex as `src/no-emoji.test.ts`; scan `apps/mobile/{app,src,modules,plugins,native,targets,assets}` for `.ts .tsx .json .kt .swift .xml .strings .js` and `app.config.ts`; assert no hits (exclude itself).
- [ ] **Step 3:** Run `npx jest src/theme src/testids src/no-emoji`: FAIL (files missing), then implement tokens and `TID`; rerun: PASS.
- [ ] **Step 4:** Commit `git add apps/mobile/src`; message `[claude] E2: token layer, test IDs, no-emoji test`.

### Task 2.3: Supabase client and secure session storage [claude]

**Files:**
- Create: `apps/mobile/src/lib/secure-storage.ts`, `secure-storage.test.ts`, `src/lib/env.ts`, `src/lib/supabase.ts`

**Interfaces:**
- Produces: `secureStorage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }` that chunks values into 1800-byte pieces under keys `<k>.0..n` plus `<k>.n` (SecureStore's limit is about 2 KB); `env: { supabaseUrl, supabaseAnonKey, googleWebClientId, googleIosClientId }` (throws a clear message when `EXPO_PUBLIC_SUPABASE_URL` or the anon key is missing); `db: SupabaseClient` (`auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }`) and `registerAppStateRefresh()` that calls `db.auth.startAutoRefresh()` on app foreground and `stopAutoRefresh()` on background.

- [ ] **Step 1:** Test (mocked `expo-secure-store` as a Map): `setItem` of a 5000-char value then `getItem` returns it; `setItem` shorter value afterwards leaves no stale chunks (`removeItem` clears all); `getItem` of a missing key returns `null`.
- [ ] **Step 2:** Run `npx jest src/lib/secure-storage.test.ts`: FAIL. Implement. Run: PASS.
- [ ] **Step 3:** Write `env.ts` and `supabase.ts`; `apps/mobile/.env.example` lists names only (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`, `EXPO_PUBLIC_API_BASE=https://codeinsta.vjspranav.dev`). The anon key is public by design; the service key must never appear in `apps/mobile`.
- [ ] **Step 4:** `npx tsc --noEmit`; commit `git add apps/mobile/src/lib apps/mobile/.env.example`; message `[claude] E2: supabase client with secure session storage`.

### Task 2.4: Owner bootstrap endpoint for native sign-in [claude]

**Files:**
- Create: `src/app/api/mobile/bootstrap/route.ts`, `src/app/api/mobile/bootstrap/route.test.ts`
- Record ownership of `src/app/api/mobile/**` as Claude's in `claude-status.md`.

**Interfaces:**
- Produces: `POST /api/mobile/bootstrap` with header `Authorization: Bearer <supabase access token>`; creates a user-scoped client with that header, calls `db.auth.getUser()`, then `bootstrapOwner(db, user)` (same allowlist plus Google-provider rule as the web `/auth/google`). Returns `200 { role: "owner" | "member" | null }` (role from `members`, `null` if no row), `401` on a missing or invalid token. Always `Cache-Control: no-store`. Never returns the token or provider details.

- [ ] **Step 1:** Test (mock `@supabase/supabase-js`, `@/lib/supabase/membership`): no header returns 401; invalid token returns 401; valid owner token calls `bootstrapOwner` once and returns `{ role: "owner" }` once the members row is re-read; a non-allowlisted Google user returns `{ role: null }` without throwing; a thrown `bootstrapOwner` returns 500 with a generic body.
- [ ] **Step 2:** Run `npx vitest run src/app/api/mobile`: FAIL. Implement. PASS.
- [ ] **Step 3:** `npm test && npm run lint && npm run build` green. Commit `git add src/app/api/mobile docs/coordination/claude-status.md`; message `[claude] E2: mobile owner bootstrap endpoint`.
- [ ] **Step 4 (PROD, owner approval):** web deploy per RUNBOOK Commands; then `curl -s -o /dev/null -w "%{http_code}" -X POST https://codeinsta.vjspranav.dev/api/mobile/bootstrap` prints `401`.

### Task 2.5: Native Google sign-in, email auth, membership state [claude] (device check needs O1, O2)

**Files:**
- Create: `apps/mobile/src/auth/{nonce,google,bootstrap,useAuth}.ts(x)` and tests `nonce.test.ts`, `google.test.ts`, `useAuth.test.tsx`

**Interfaces:**
- Produces: `makeNonce(): Promise<{ raw: string; hashed: string }>` (raw = 64 hex chars from 32 random bytes via expo-crypto, hashed = SHA-256 hex of raw); `signInWithGoogle(): Promise<{ ok: true } | { ok: false; reason: "cancelled" | "failed" }>` which gets an ID token for `googleWebClientId` with `hashed`, then `db.auth.signInWithIdToken({ provider: "google", token, nonce: raw })`, then `bootstrapOwner(accessToken)` (POST `${API_BASE}/api/mobile/bootstrap`, failures are non-fatal); `signInWithPassword(email, password)`, `signUpWithPassword(email, password)` (mirror `src/app/login/page.tsx` behavior and copy), `redeemInvite(code: string): Promise<string>` (empty string on success, else the same messages as `src/app/join/actions.ts`: "Enter your invite code.", "Could not redeem your invite. Please retry.", "This invite is invalid, expired, or fully used."), `signOut()`.
- Produces `useAuth(): { status: "loading" | "signedOut" | "needsInvite" | "needsOnboarding" | "ready"; user: User | null; role: "owner" | "member" | null; refresh(): Promise<void>; signInWithGoogle; signInWithPassword; signUpWithPassword; redeemInvite; signOut }` in an `AuthProvider`. Status rules: no session means `signedOut`; session without a `members` row means `needsInvite`; member with `user_interests.onboarded` false means `needsOnboarding` (a failed interests lookup counts as onboarded, like web); else `ready`. A failed token refresh (`TOKEN_REFRESHED` absent, `SIGNED_OUT` event) moves to `signedOut`.

- [ ] **Step 1:** Tests: `nonce.test.ts` (raw matches `/^[a-f0-9]{64}$/`, `hashed` equals `crypto.createHash("sha256").update(raw).digest("hex")`, two calls differ). `google.test.ts` with mocked native module and `db`: success calls `signInWithIdToken` with `{ provider: "google", token: "tok", nonce: raw }` and the token passed to Google was `hashed`; user cancel returns `{ ok:false, reason:"cancelled" }`; a Supabase error returns `failed` and the thrown or logged strings never contain `tok` or `raw` (spy on `console.*`); bootstrap failure still returns ok. `useAuth.test.tsx`: the four status transitions above plus session loss.
- [ ] **Step 2:** Run `npx jest src/auth`: FAIL. Implement. PASS.
- [ ] **Step 3:** `npx tsc --noEmit`. Commit `git add apps/mobile/src/auth`; message `[claude] E2: native auth, nonce flow, membership state`.
- [ ] **Step 4 (OWNER gates O1, O2):** after Task 2.7 lands, sign in with Google on the phone: reaches `ready` as owner; `select role from members where email = ...` shows `owner`. Record in status.

### Task 2.6: Library queries and feed hook [claude]

**Files:**
- Create: `apps/mobile/src/data/{queries,library}.ts` and tests `queries.test.ts`, `library.test.ts`; `apps/mobile/src/lib/queryClient.ts`

**Interfaces:**
- Produces `REEL_COLUMNS` (string) = `id,creator_id,title,topic,tags,series,series_index,created_at,video_url,glossary,parent_reel_id,genre,style,poster_url:script->>poster_url,expires_at:script->>expires_at` (adjust `expires_at` per Task 1.3 Step 3). It never selects the `script` jsonb whole.
- `fetchLibrary(userId: string): Promise<Library>` where `Library = { reels: MobileReel[]; creators: Creator[]; categories: Category[]; liked: Set<string>; disliked: Set<string>; seen: Set<string>; areas: string[]; onboarded: boolean; fulfilled: Set<string> }`; runs the same parallel selects as web `data.tsx` (`reels` with `.is("archived_at", null).order("created_at", { ascending: false })`, `creators`, `likes`, `views`, `user_interests`, `topic_requests` done, `categories`, `dislikes`), drops lab reels (`isLabReel`), reels with no `video_url`, and reels whose `expires_at` is past.
- `useLibrary(): { library: Library | null; loading: boolean; error: string; reload(): void }` over TanStack Query (stale time 5 min, refetch on app foreground after 5 min, like web).
- `useFeed(): MobileReel[]` returns `orderFeed(reels, seen, { areas, liked, fulfilled, disliked })` from `@shared/feed`, memoized.

- [ ] **Step 1:** Tests (mocked `db`): `REEL_COLUMNS` contains `poster_url:script->>poster_url` and no bare `script`; rows with `video_url: null`, topics `lab/x` and `lab-v3/y`, and a past `expires_at` are dropped; archived filter is applied (`.is("archived_at", null)` called); a failed interests query yields `onboarded: true` and `areas: []` (web parity); `useFeed` output equals `orderFeed(...)` for a fixture (series Part 1 before Part 2).
- [ ] **Step 2:** Run `npx jest src/data/queries.test.ts src/data/library.test.ts`: FAIL. Implement. PASS.
- [ ] **Step 3:** Commit `git add apps/mobile/src/data apps/mobile/src/lib/queryClient.ts`; message `[claude] E2: library queries and ordered feed hook`.

### Task 2.7: App shell, tabs, auth gate [codex]

Queue: `31-mobile-shell.md`. Needs: Tasks 2.2, 2.5, 2.6 committed.

```
GOAL: expo-router shell for apps/mobile with auth gating and four tabs.
READ FIRST: COORDINATION.md, docs/coordination/decisions.md (no emojis, full-bleed), docs/superpowers/specs/2026-11-01-mobile-apps-design.md, apps/mobile/src/theme/tokens.ts, apps/mobile/src/testids.ts, apps/mobile/src/auth/useAuth.tsx, src/app/login/page.tsx, src/app/join/page.tsx, src/app/onboarding/page.tsx, src/components/interests.tsx (copy and behavior to mirror).
CREATE: apps/mobile/app/_layout.tsx (providers: AuthProvider, QueryClientProvider, SafeAreaProvider, GestureHandlerRootView; splash held until useAuth().status != "loading"; redirects: signedOut -> /login, needsInvite -> /join, needsOnboarding -> /onboarding, ready -> /(tabs)), apps/mobile/app/(tabs)/_layout.tsx (bottom tabs Feed, Explore, Inbox, Profiles with lucide-react-native icons and testIDs TID["tab-feed"] etc.), placeholder screens apps/mobile/app/(tabs)/{index,explore,inbox,profiles}.tsx rendering a titled empty state, apps/mobile/app/login.tsx (Google button TID["login-google"], email and password fields, submit, create-account toggle, calling useAuth methods; copy from the web login page), apps/mobile/app/join.tsx (invite code, TID["join-code"], TID["join-submit"], messages returned by redeemInvite), apps/mobile/app/onboarding.tsx (interest chips from library categories, saved via `saveInterests` imported from apps/mobile/src/data/interests.ts if present, else a TODO-free stub that calls db.from("user_interests").upsert({ user_id, areas, onboarded: true }, { onConflict: "user_id" })), apps/mobile/src/ui/{Screen,Button,TextField,EmptyState}.tsx using only tokens (no hex literals outside tokens.ts), tests next to each file with @testing-library/react-native.
DO NOT TOUCH: anything outside apps/mobile/app/** and apps/mobile/src/ui/**; no new dependencies (ask in docs/coordination/codex-status.md instead); no emojis, gradients, glows, glassmorphism.
ACCEPTANCE (jest, from apps/mobile): signedOut renders the login screen; Google button press calls signInWithGoogle once; join shows the returned error text; needsOnboarding redirects to /onboarding; ready renders four tabs with the expected testIDs; `npx jest` and `npx tsc --noEmit` pass; src/no-emoji.test.ts passes.
VERIFY: cd apps/mobile && npx jest && npx tsc --noEmit
```

### Task 2.8: Phase E2 device check [claude]

- [ ] **Step 1:** `cd apps/mobile && npx expo run:android --device` on the Flip 8 (after O3). Expected: login, Google sign-in (after O1), tabs visible.
- [ ] **Step 2:** Invite flow: `npm run invite -- create --uses 1 --note "e2 test"` at the repo root, sign out, sign up a second throwaway email on the phone, redeem the code: reaches onboarding.
- [ ] **Step 3:** Write results to `claude-status.md`; tick RUNBOOK E2 with the date. Commit `git add docs/RUNBOOK.md docs/coordination/claude-status.md`; message `[claude] E2: shell and auth verified on device`.

# Phase E3: Feed with preload and performance targets

Deliverable: vertical pager, preload 2 ahead, full-bleed video with zone-placed controls, all feed gestures; perf targets measured.

### Task 3.1: Full-bleed layout from overlay zones [claude]

**Files:**
- Create: `apps/mobile/src/feed/layout.ts`, `layout.test.ts`

**Interfaces:**
- Produces: `videoBox(screen: { width: number; height: number }): { width: number; height: number; top: number }` (video width equals screen width; height = width * 16 / 9; `top` centers it when the screen is taller, or crops from the center when shorter); `zoneRect(name: "topControls" | "rightRail" | "bottomMeta", box: ReturnType<typeof videoBox>): { left: number; top: number; width: number; height: number }` using `zonePercent` from `@shared/overlay-zones` and `packages/shared/overlay-zones.json`.

- [ ] **Step 1:** Tests with screen 393x852 (box width 393, height 698.67): `zoneRect("rightRail", box)` left = 393 * 610/720, width = 393 * 110/720; zone rects stay inside the box; screen 360x640 (shorter than 16:9) crops symmetrically and zones stay inside the visible area (clamped).
- [ ] **Step 2:** Run `npx jest src/feed/layout.test.ts`: FAIL. Implement. PASS. Commit `git add apps/mobile/src/feed/layout*`; message `[claude] E3: zone-based full-bleed layout`.

### Task 3.2: Preload window, player pool, `ReelVideo` [claude]

**Files:**
- Create: `apps/mobile/src/feed/{preload,playerPool,playback}.ts`, `ReelVideo.tsx`, tests `preload.test.ts`, `playerPool.test.ts`, `playback.test.ts`, `ReelVideo.test.tsx`

**Interfaces:**
- Produces: `preloadWindow(active: number, length: number, ahead = 2, behind = 1): number[]` (indices to keep warm, clamped to `[0, length)`, ascending); `slotFor(index: number, poolSize = 3): number` (`index % poolSize`, so a slot is reused only when its reel is outside the window); `PlayerPool` class with `assign(index, source): { slot: number; replaced: boolean }`, never more than 3 live players; `playbackState({ active: boolean; soundUnlocked: boolean; userPaused: boolean; appActive: boolean }): { playing: boolean; muted: boolean }` (port the rules and test cases of `src/components/reel/video-playback.ts` / `video-playback.test.ts`: off-screen pauses, muted until the first tap unlocks sound, user pause wins, app in background pauses).
- `ReelVideo` props: `{ source: string; poster: string | null; active: boolean; slot: number; box: ReturnType<typeof videoBox>; soundUnlocked: boolean; userPaused: boolean; onFirstFrame(): void; onEnd(): void; onError(): void }`. Uses `expo-video` `useVideoPlayer(source, ...)` with `useCaching: true` where the SDK supports it, forward-buffer options set for Android and iOS, `expo-image` poster underneath that stays until `onFirstFrame` (no white flash), and on error shows a Retry button (`TID["reel-retry"]` appended to `TID`), never a spinner.

- [ ] **Step 1:** Tests: `preloadWindow(0, 1)` equals `[0]`; `preloadWindow(0, 0)` equals `[]`; `preloadWindow(5, 6)` equals `[4, 5]`; `preloadWindow(3, 20)` equals `[2, 3, 4, 5]`; pool never exceeds 3 slots across 100 random moves; `playbackState` cases ported from web; `ReelVideo` (mocked expo-video) shows the poster until `onFirstFrame`, shows Retry after `onError`, pauses when `active` turns false.
- [ ] **Step 2:** Run `npx jest src/feed`: FAIL. Implement the pure modules, then `ReelVideo`. PASS.
- [ ] **Step 3:** `npx tsc --noEmit`; commit `git add apps/mobile/src/feed apps/mobile/src/testids.ts`; message `[claude] E3: preload window, player pool, ReelVideo`.

### Task 3.3: Feed session, reactions, asks, views [claude]

**Files:**
- Create: `apps/mobile/src/data/feedSession.ts`, `asks.ts`, tests `feedSession.test.ts`, `asks.test.ts`

**Interfaces:**
- Produces `useFeedSession(entryReelId?: string)`: `{ items: MobileReel[]; liked: Set<string>; disliked: Set<string>; like(id: string, onlyLike?: boolean): Promise<void>; dislike(id: string): Promise<string>; markSeen(id: string): Promise<void>; streak: number; error: string }`. `items` = `orderFeed` output; when `entryReelId` is set, `withEarlierParts(target, all, seen)` leads the list (target then the rest without duplicates). Semantics port `data.tsx` exactly: `like` toggles `likes` insert or delete, treats Postgres error `23505` as success, rolls back and sets an error message otherwise; `dislike` is optimistic with a per-id pending lock returning `"Please wait for your previous change."`, rollback and `"Could not save your preference. Try again."` on failure; `markSeen` inserts into `views` once per id (treat `23505` as success). Haptic callbacks are injected (`onHaptic(kind: "like" | "dislike")`), so the module stays testable. `streak` from `db.rpc("learning_streak", { tz })`, `0` on failure.
- `asks.ts`: `asksLeft(userId: string, isOwner: boolean): Promise<number | null>` (`null` for owner; `DAILY_ASKS` minus feedback rows in the last 24 h otherwise); `askQuestion(input: { reelId: string | null; creatorId: string; body: string; wants: "dm" | "reel" }): Promise<string>` inserting into `feedback` with `kind: "question"` exactly as `src/components/reel/feedback.tsx` does (read it first and copy the column set); returns `""` on success or the web error copy.

- [ ] **Step 1:** Tests (mocked `db`): like then unlike issues insert then delete; like with `23505` keeps state liked; failed like restores state and sets error; double dislike while pending returns the wait message; dislike failure rolls back; `markSeen` called twice inserts once; `entryReelId` for Part 3 with Parts 1 and 2 unseen yields `[p1, p2, p3, ...]`; `asksLeft` returns 3, then 0 after three recent rows; owner returns `null`.
- [ ] **Step 2:** Run `npx jest src/data/feedSession.test.ts src/data/asks.test.ts`: FAIL. Implement. PASS.
- [ ] **Step 3:** Commit `git add apps/mobile/src/data/feedSession* apps/mobile/src/data/asks*`; message `[claude] E3: feed session, reactions, asks`.

### Task 3.4: Feed screen, gestures, overlays [codex]

Queue: `32-mobile-feed-screen.md`. Needs: Tasks 2.7, 3.1, 3.2, 3.3 committed.

```
GOAL: The Feed tab: a full-bleed vertical pager of reels with floating controls.
READ FIRST: COORDINATION.md, decisions.md (full-bleed overlay zones, series order, no emojis), packages/shared/overlay-zones.json, apps/mobile/src/feed/*.ts(x), apps/mobile/src/data/feedSession.ts, apps/mobile/src/testids.ts, src/components/reel/overlay.tsx and feed.tsx (behavior and copy to mirror).
CREATE/MODIFY: apps/mobile/app/(tabs)/index.tsx (FlashList v2 or a paged pager, one reel per screen, snapToInterval = screen height, estimatedItemSize set, windowSize small, removeClippedSubviews; renders <ReelVideo> only for indices in preloadWindow(active, items.length), slot = slotFor(index); the posters of the next 2 reels prefetched with expo-image Image.prefetch), apps/mobile/app/reel/[id].tsx (deep link `codeinsta://reel/<id>`: same screen with useFeedSession(entryId)), apps/mobile/src/ui/feed/{ReelOverlay,ActionRail,TopControls,BottomMeta,ProgressBar,NextPartCard,Toast}.tsx. Place the controls with zoneRect() from apps/mobile/src/feed/layout.ts: topControls (sound, pause), rightRail (like, ask, not for me; lucide icons), bottomMeta (creator handle, title); a thin progress bar at the very bottom. Gestures (react-native-gesture-handler + Reanimated, UI-thread worklets): single tap toggles pause and, on the first tap ever, unlocks sound (soundUnlocked state); double tap likes (onlyLike = true) with expo-haptics impact and a drawn heart pulse; long press on a reel marks "Not for me" with haptics and an Undo toast (TID["reel-undo"]) lasting 4 s that calls dislike() again. The last page of a series part shows NextPartCard (TID["reel-next-part"]) when the next index exists. Empty library shows EmptyState. Use TID constants for every control; tokens only; no hex literals.
DO NOT TOUCH: apps/mobile/src/feed/**, src/data/**, src/auth/**, packages/**, supabase/**, any config. If a data function is missing, record it in docs/coordination/codex-status.md and stop that part.
ACCEPTANCE (jest + RNTL, mocked useFeedSession and ReelVideo): pager mounts at most 4 ReelVideo for any active index; double tap calls like(id, true) once and haptic once; long press calls dislike(id) and shows the toast; Undo calls dislike(id) again; first tap sets soundUnlocked; controls render inside their zoneRects; empty items shows the empty state; no emoji (npx jest src/no-emoji.test.ts).
VERIFY: cd apps/mobile && npx jest && npx tsc --noEmit
```

### Task 3.5: Ask, glossary, share sheets [codex]

Queue: `33-mobile-feed-sheets.md`. Needs: Task 3.4 committed, Task 3.3.

```
GOAL: Bottom sheets opened from the feed: ask, glossary, share.
READ FIRST: COORDINATION.md, decisions.md, apps/mobile/src/data/asks.ts, apps/mobile/src/testids.ts, src/components/reel/feedback.tsx and the glossary UI in src/components/reel/ (copy and limits to mirror).
CREATE: apps/mobile/src/ui/sheets/{AskSheet,GlossarySheet,ShareAction}.tsx and tests; wire them into apps/mobile/app/(tabs)/index.tsx and apps/mobile/app/reel/[id].tsx ONLY through the existing action rail callbacks (add the three handlers; do not restructure the pager). AskSheet: text input (TID["ask-input"]), send (TID["ask-send"]), shows "N questions left today" for members (asksLeft), nothing for the owner, error copy from askQuestion, closes on success. GlossarySheet (TID["reel-glossary"]): lists the reel's glossary entries (term, full, note). ShareAction (TID["reel-share"]): React Native Share.share({ message: `${title} https://codeinsta.vjspranav.dev/reel/${id}` }).
DO NOT TOUCH: src/data/**, src/feed/**, packages/**, supabase/**.
ACCEPTANCE: send is disabled for empty text; a member with 0 asks left sees the limit message and cannot send; owner never sees a counter; glossary renders every entry; share calls Share.share once with the reel URL; no emoji.
VERIFY: cd apps/mobile && npx jest && npx tsc --noEmit
```

### Task 3.6: Performance probe and measurement scripts [claude]

**Files:**
- Create: `apps/mobile/src/perf/probe.ts`, `probe.test.ts`, `apps/mobile/perf/{android-perf.sh,parse-perf.ts,parse-perf.test.ts,ios-perf.md}`

**Interfaces:**
- Produces `perf.mark(name: string): void`, `perf.measure(name: string, from: string): number` and `perf.log(name: string, ms: number): void` printing `CI_PERF <name> <ms>` only when `process.env.EXPO_PUBLIC_PERF === "1"` (no-op otherwise). Hooks (added by Claude to `ReelVideo.tsx` and the pager's `onViewableItemsChanged` through the callback props, not by editing Codex's screen): `app_start` (JS bundle start) to `first_frame_playing` (first `onFirstFrame` of the first reel); `swipe_to_play` from page change to `playing` for the new active reel.
- `parse-perf.ts <logcat.txt>`: prints p50 and p95 per metric; exits non-zero when `cold_start_to_first_frame` p50 >= 1500, `swipe_to_play` p95 >= 150, or janky frame percentage (from a `JANKY <pct>` line) > 3.
- `android-perf.sh`: (1) `adb shell am force-stop dev.vjspranav.codeinsta`; (2) 10 times: `adb shell am start -W -n dev.vjspranav.codeinsta/.MainActivity` and capture `TotalTime`, then logcat `ReactNativeJS` for `CI_PERF first_frame_playing`; (3) `adb shell dumpsys gfxinfo dev.vjspranav.codeinsta reset`, then 30 swipes with `adb shell input swipe 540 1800 540 400 120` spaced 1.2 s, then `adb shell dumpsys gfxinfo dev.vjspranav.codeinsta` and extract "Janky frames" percent and 95th percentile frame time; writes `perf/out/<device>-<date>.txt`.
- `ios-perf.md`: Instruments, template "Animation Hitches", launch the release build on the iPhone, swipe 30 reels; pass when hitch time ratio is below 5 ms per second; cold start measured with the same `CI_PERF` lines via Console (Xcode, Devices, Open Console, filter `CI_PERF`).

- [ ] **Step 1:** Tests: `probe.test.ts` (no output when the flag is off; `measure` returns elapsed ms with a fake clock); `parse-perf.test.ts` (fixture logs: passing numbers exit 0; swipe p95 of 180 exits 1; jank 4.2 exits 1).
- [ ] **Step 2:** Run `npx jest src/perf perf/parse-perf.test.ts`: FAIL. Implement. PASS.
- [ ] **Step 3:** Commit `git add apps/mobile/src/perf apps/mobile/perf`; message `[claude] E3: performance probe and Android/iOS measurement scripts`.

### Task 3.7: Performance pass [claude] (device or emulator)

- [ ] **Step 1:** Build a release-like variant with the probe on: `cd apps/mobile && EXPO_PUBLIC_PERF=1 npx expo run:android --variant release` on the Android emulator first (`emulator -avd <name> -no-snapshot`), then the Flip 8 (O3).
- [ ] **Step 2:** Run `apps/mobile/perf/android-perf.sh`, then `npx tsx apps/mobile/perf/parse-perf.ts <out file>`. Expected exit 0 on the Flip 8. If a target is missed: cold start, reduce JS bundle with Hermes bytecode (default) and defer non-feed imports; swipe latency, raise forward buffer or the pool window; jank, move work to Reanimated worklets and drop re-renders. Re-measure after each change.
- [ ] **Step 3:** Record numbers in `docs/mobile/perf-results.md` (date, device, p50, p95, jank). iPhone numbers are added in Task 6.1. Commit `git add docs/mobile/perf-results.md apps/mobile/src`; message `[claude] E3: feed meets performance targets on <device>`. Tick RUNBOOK E3 after both devices pass.

# Phase E4: Every other screen, plus notifications

Deliverable: parity with web features plus push. Data functions are Claude's and land first; Codex screens consume them.

### Task 4.1: Explore and profiles data [claude]

**Files:**
- Create: `apps/mobile/src/data/{explore,profiles}.ts` and tests

**Interfaces:**
- Produces: `exploreSections(library: Library): { category: Category; reels: MobileReel[] }[]` (groups by `topic.split("/")[0]` matching a category slug, newest first, empty categories omitted); `searchReels(library: Library, query: string): MobileReel[]` (case-insensitive over title, tags, topic; empty query returns `[]`); `creatorReels(library: Library, creatorId: string): MobileReel[]` (series in order via `seriesInOrder`); `useProfileStats(creatorId)` not needed (derive from the library).

- [ ] **Step 1:** Tests: grouping, omission of empty categories, search by tag, series order inside a creator page (Part 1 before Part 2), lab and archived reels absent (they were dropped upstream; assert fixture parity).
- [ ] **Step 2:** FAIL, implement, PASS (`npx jest src/data/explore.test.ts src/data/profiles.test.ts`). Commit `[claude] E4: explore and profile data`.

### Task 4.2: Inbox, DMs, unread [claude]

**Files:** Create `apps/mobile/src/data/inbox.ts`, `inbox.test.ts`

**Interfaces:**
- Produces: `fetchThreads(userId: string): Promise<Thread[]>` (`Thread = { creatorId: string; lastBody: string; lastAt: string; unread: number; messages: Message[] }`, grouped from `messages` by `creator_id`, newest thread first); `sendMessage(userId: string, creatorId: string, body: string, feedbackId?: string): Promise<string>` inserting `{ user_id, creator_id, sender: "user", body_md }` (empty string on success, web error copy otherwise; trims, rejects empty); `markThreadRead(userId, creatorId): Promise<void>` sets `read_at` on creator messages; `useUnreadCount(): number`.

- [ ] **Step 1:** Tests: grouping and unread counts, trim and empty rejection, mark read updates only `sender = "creator"` rows.
- [ ] **Step 2:** FAIL, implement (read `src/app/inbox/page.tsx` and `src/components/inbox.tsx` first for the exact columns and copy), PASS. Commit `[claude] E4: inbox and DM data`.

### Task 4.3: Requests, owner review, invites, interests [claude]

**Files:** Create `apps/mobile/src/data/{requests,owner,interests}.ts` and tests

**Interfaces:**
- Produces: `submitRequest(userId: string, area: string, text: string): Promise<string>` (insert into `topic_requests`; surfaces trigger errors such as the pending cap as friendly copy matching `src/components/` request UI); `myRequests(userId)`; `pendingCount(): Promise<number>` (`topic_requests` count where `status = 'pending'`, head request, owner only); `listPending()`; `reviewRequest(input: { requestId: string; decision: "new_category" | "existing" | "reject"; slug?: string; label?: string; description?: string }): Promise<string>` calling `db.rpc("review_topic_request", { request_id, decision, slug, label, description })` with `isValidSlug` checked client-side first; `createInvite(input: { uses: number; days?: number; note?: string }): Promise<string>` (insert into `invites`, owner RLS decides; code = 10 uppercase hex chars like `scripts/invite.ts`); `listInvites()`; `saveInterests(userId: string, areas: string[]): Promise<string>` (upsert like web, `onConflict: "user_id"`).

- [ ] **Step 1:** Tests: invalid slug rejected before any RPC call; RPC parameter names exact (`request_id`, `decision`, `slug`, `label`, `description`); `pendingCount` returns 0 on error; invite code matches `/^[A-F0-9]{10}$/`; `saveInterests` error copy; request text is stored as given (member text is data, never interpreted).
- [ ] **Step 2:** FAIL, implement, PASS. Commit `[claude] E4: requests, owner review, invites, interests data`.

### Task 4.4: Explore, profiles, creator pages [codex]

Queue: `34-mobile-explore-profiles.md`. Needs: Tasks 4.1, 2.7.

```
GOAL: Explore and Profiles tabs plus creator pages.
READ FIRST: COORDINATION.md, decisions.md, apps/mobile/src/data/{explore,profiles,library}.ts, src/app/explore/*, src/app/profiles/page.tsx, src/app/c/[creator]/page.tsx, src/components/catalog.tsx, apps/mobile/src/testids.ts.
CREATE: apps/mobile/app/(tabs)/explore.tsx (search field, category sections as horizontal rails of reel tiles with poster, title, creator), apps/mobile/app/(tabs)/profiles.tsx (creator list, streak chip TID["streak-chip"] from useFeedSession().streak hidden when 0), apps/mobile/app/c/[creator].tsx (bio, reel grid in series order from creatorReels), apps/mobile/src/ui/{ReelTile,CreatorRow,SectionHeader}.tsx and tests. Tapping a tile opens apps/mobile/app/reel/[id].tsx.
DO NOT TOUCH: src/data/**, src/feed/**, other screens, packages/**.
ACCEPTANCE: search filters tiles; empty search state; grid shows Part 1 before Part 2; tiles use expo-image with the poster; no emoji; tokens only.
VERIFY: cd apps/mobile && npx jest && npx tsc --noEmit
```

### Task 4.5: Inbox screens [codex]

Queue: `35-mobile-inbox.md`. Needs: Task 4.2.

```
GOAL: Inbox tab with creator threads and DM composer.
READ FIRST: COORDINATION.md, decisions.md, apps/mobile/src/data/inbox.ts, src/app/inbox/page.tsx, src/components/inbox.tsx, apps/mobile/src/testids.ts.
CREATE: apps/mobile/app/(tabs)/inbox.tsx (thread list with unread dots, TID[`inbox-thread-${creatorId}`]), apps/mobile/app/inbox/[creator].tsx (message bubbles, composer TID["dm-input"] and TID["dm-send"], marks the thread read on open via markThreadRead), apps/mobile/src/ui/{ThreadRow,MessageBubble,Composer}.tsx and tests; show an unread badge on the Inbox tab icon (edit apps/mobile/app/(tabs)/_layout.tsx only to add the badge).
DO NOT TOUCH: src/data/**, packages/**.
ACCEPTANCE: unread rows show a dot, opening clears it (markThreadRead called once); send disabled for empty/whitespace; failed send keeps the text and shows the error; keyboard avoids the composer; no emoji.
VERIFY: cd apps/mobile && npx jest && npx tsc --noEmit
```

### Task 4.6: Requests, interests, owner review, invites, About, Privacy, Settings [codex]

Queue: `36-mobile-requests-owner.md`. Needs: Task 4.3.

```
GOAL: Remaining screens for parity with the web app.
READ FIRST: COORDINATION.md, decisions.md, apps/mobile/src/data/{requests,owner,interests}.ts, src/app/interests/*, src/app/admin/requests/page.tsx, src/components/{interests,review-requests,invites}.tsx, src/app/about/page.tsx, src/app/privacy/page.tsx, apps/mobile/src/testids.ts.
CREATE: apps/mobile/app/requests.tsx (ask for a topic: area picker + text TID["request-input"], TID["request-send"], list of my requests with status), apps/mobile/app/interests.tsx (edit interests), apps/mobile/app/admin/requests.tsx (owner only: pending list, Approve as new category / into existing / Reject using reviewRequest; TID["review-approve"], TID["review-reject"]), apps/mobile/app/admin/invites.tsx (owner only: create invite with uses/days/note, list, copy code), apps/mobile/app/about.tsx and privacy.tsx (copy taken verbatim from the web pages, converted to native Text; no emojis), apps/mobile/app/settings.tsx (sign out, notification toggle calling registerPush/unregisterPush from apps/mobile/src/push/register.ts if present, app version). Owner entry points appear only when useAuth().role === "owner"; show the pending count badge TID["pending-badge"] on the owner entry using pendingCount() refreshed on focus.
DO NOT TOUCH: src/data/**, src/auth/**, packages/**.
ACCEPTANCE: non-owner cannot reach /admin/* (redirect to tabs); approve calls reviewRequest with the exact decision; a slug that fails isValidSlug shows an inline error and makes no call; request send respects the returned friendly error; About and Privacy text equals the web text; no emoji.
VERIFY: cd apps/mobile && npx jest && npx tsc --noEmit
```

### Task 4.7: Push backend, migration 0013 and edge function [claude]

**Files:**
- Create: `supabase/migrations/0013_push_tokens.sql`, `supabase/functions/push/{index.ts,message.ts,message.test.ts}`

**Interfaces:**
- SQL: `public.push_tokens (user_id uuid references auth.users on delete cascade, token text, platform text check (platform in ('android','ios')), updated_at timestamptz default now(), primary key (user_id, token))`, RLS own-row select/insert/update/delete (`user_id = (select auth.uid()) and public.is_member()`); trigger functions `public.notify_creator_message()` (after insert on `messages` when `sender = 'creator'`) and `public.notify_request_status()` (after update of `status` on `topic_requests` when new status in `('approved','done')` and changed) that call `net.http_post` (pg_net) to `<project>.functions.supabase.co/push` with header `x-push-secret` read from `vault.decrypted_secrets` name `push_secret`, body `{ "kind": "creator_message" | "request_status", "user_id": "...", "creator_id": "...", "status": "..." }`. Bodies carry ids and statuses only, never text.
- TS (`message.ts`, pure): `buildPush(event: PushEvent, tokens: string[]): ExpoMessage[]` with copy: creator message returns title `"<Creator display name> replied"`, body `"Open your inbox to read it."`, `data: { route: "/inbox/<creatorId>" }`; approved returns title `"Topic approved"`, body `"A creator is working on your request."`, `data: { route: "/requests" }`; done returns title `"Your topic is ready"`, body `"Your requested reel is in your feed."`, `data: { route: "/" }`. `shouldDeleteToken(receipt)` is true for `DeviceNotRegistered`. `index.ts`: verifies `x-push-secret` (constant-time), reads tokens with the service role, posts chunks of 100 to `https://exp.host/--/api/v2/push/send`, deletes dead tokens.

- [ ] **Step 1:** Write `message.test.ts` (run with root vitest): copy strings equal the values above; no string contains the message body field even when the event object carries one (`{..., body: "secret text"}`); no emoji (reuse the regex); chunking at 100; `shouldDeleteToken({ details: { error: "DeviceNotRegistered" } })` true.
- [ ] **Step 2:** Run `npx vitest run supabase/functions`: FAIL. Implement `message.ts`, `index.ts`, then the migration. PASS.
- [ ] **Step 3 (PROD, owner approval or allow rule):** `npx supabase db push --linked -p "$SUPABASE_DB_PASSWORD"`; then `npx supabase functions deploy push --no-verify-jwt`; then `npx supabase secrets set PUSH_SECRET=<random 32 bytes hex>` and create the same value as Vault secret `push_secret` (SQL: `select vault.create_secret('<value>', 'push_secret');`). Never `supabase config push`. Without approval write "waiting for OWNER approval: db push 0013 and functions deploy push" in `claude-status.md`.
- [ ] **Step 4:** Smoke (after Step 3): `curl -s -o /dev/null -w "%{http_code}" -X POST https://<ref>.functions.supabase.co/push` prints `401`.
- [ ] **Step 5:** Commit `git add supabase/migrations/0013_push_tokens.sql supabase/functions`; message `[claude] E4: push tokens, notification triggers, push edge function`.

### Task 4.8: Mobile push registration and routing [claude] (Android verification needs O5)

**Files:**
- Create: `apps/mobile/src/push/{register.ts,routing.ts}` and tests

**Interfaces:**
- Produces: `registerPush(userId: string): Promise<"registered" | "denied" | "unsupported">` (asks permission only after sign-in, gets the Expo token with the EAS project ID from `app.config.ts` extra, upserts `{ user_id, token, platform }`; any thrown error, including iOS without the push entitlement on a free Apple ID, returns `"unsupported"` and never throws); `unregisterPush(userId: string): Promise<void>` (deletes this device's row; called by `signOut`); `routeFromNotification(data: unknown): string | null` (accepts only routes `/`, `/requests`, `/inbox/<id matching [a-z0-9-]+>`; anything else returns `null`, so a hostile payload cannot navigate elsewhere).

- [ ] **Step 1:** Tests: denied permission returns `"denied"` and writes nothing; token fetch that throws returns `"unsupported"`; `unregisterPush` deletes by `(user_id, token)`; `routeFromNotification({ route: "/inbox/claude" })` returns the route, `"/admin/requests"` and `"https://evil.test"` return `null`.
- [ ] **Step 2:** FAIL, implement, PASS. Wire `unregisterPush` into `signOut` in `src/auth` and add a test there. Commit `[claude] E4: push registration and safe routing`.
- [ ] **Step 3 (OWNER gate O5):** on the Flip 8, ask the owner account a question, run `npm run agent -- messages` reply flow or insert a creator message with the service role; the notification arrives and tapping opens `/inbox/<creator>`.

# Phase E5: Widgets

Deliverable: Android Glance widget (home, lock screen, Flip 8 cover screen) and iOS WidgetKit widget (lock, home) showing newest reel, headline, streak.

### Task 5.1: Widget snapshot in shared [claude]

**Files:** Create `packages/shared/src/widget-snapshot.ts`, `widget-snapshot.test.ts`

**Interfaces:**
- Produces: `type WidgetSnapshot = { v: 1; updatedAt: string; streak: number; newest: { id: string; title: string; creator: string; category: string; deepLink: string } | null; headline: { id: string; title: string; deepLink: string } | null }`; `buildSnapshot(reels: MobileReel[], creators: Creator[], categories: Category[], streak: number, now: Date): WidgetSnapshot` (newest = most recent non-lab reel by `created_at`; headline = most recent reel whose topic category is `frontier` or `tech-news` and not expired; titles truncated to 80 chars ending in `…` (U+2026, not an emoji); deep link `codeinsta://reel/<id>`); `parseSnapshot(raw: string | null): WidgetSnapshot | null` (returns `null` for null, invalid JSON, or `v` other than 1).

- [ ] **Step 1:** Tests: no reels returns `{ newest: null, headline: null, streak }`; newest ignores lab reels; headline picks `tech-news` over an older `frontier`; an expired news reel is skipped; a 200-char title truncates to 80; deep link equals `codeinsta://reel/<id>`; `parseSnapshot(null)`, `parseSnapshot("{")`, `parseSnapshot('{"v":2}')` all return `null`; no field contains an emoji.
- [ ] **Step 2:** `npx vitest run packages/shared/src/widget-snapshot.test.ts`: FAIL, implement, PASS. Commit `[claude] E5: widget snapshot builder`.

### Task 5.2: Snapshot bridge and background refresh [claude]

**Files:** Create `apps/mobile/modules/widget-bridge/**` (Expo local module: `index.ts`, Android Kotlin, iOS Swift), `apps/mobile/src/widgets/{sync.ts,sync.test.ts}`

**Interfaces:**
- Module: `setSnapshot(json: string): void` (Android: SharedPreferences `codeinsta_widget` key `snapshot`, then `AppWidgetManager.notifyAppWidgetViewDataChanged`/provider update broadcast; iOS: `UserDefaults(suiteName: "group.dev.vjspranav.codeinsta")` key `snapshot`, then `WidgetCenter.shared.reloadAllTimelines()`), `clearSnapshot(): void`.
- `syncWidgetSnapshot(library: Library, streak: number): void` builds and writes via `buildSnapshot`; `clearWidgetSnapshot(): void`; `registerWidgetRefresh(): Promise<void>` registers an `expo-background-task` (WorkManager on Android, BGTaskScheduler on iOS) at the minimum interval that fetches `fetchLibrary` plus the streak and calls `syncWidgetSnapshot`; the task does nothing when there is no session. Called: after every successful library load, and the sign-out path calls `clearWidgetSnapshot`.

- [ ] **Step 1:** Tests (mock the module): library load writes JSON that `parseSnapshot` accepts; sign-out calls `clearSnapshot` exactly once; background task without a session writes nothing and clears the snapshot; module failure (throws) never breaks the feed.
- [ ] **Step 2:** FAIL, implement. PASS. Commit `[claude] E5: widget bridge and background refresh`.

### Task 5.3: Android Glance widget plumbing, Samsung cover metadata [claude]

**Files:** Create `apps/mobile/plugins/with-android-widget/{index.ts,index.test.ts}`, `apps/mobile/native/android/widget/{CodeInstaWidget.kt,CodeInstaWidgetReceiver.kt,SnapshotReader.kt}`, `res/xml/codeinsta_widget_info.xml`, `res/xml/codeinsta_widget_cover_info.xml`; Modify `apps/mobile/app.config.ts` (plugin entry).

**Interfaces:**
- Plugin (config plugin) adds Glance dependencies (pin `androidx.glance:glance-appwidget` at implementation) to `android/app/build.gradle`, copies the Kotlin and XML sources, and adds to `AndroidManifest.xml` two receivers: `.widget.CodeInstaWidgetReceiver` (action `android.appwidget.action.APPWIDGET_UPDATE`, `<meta-data android:name="android.appwidget.provider" android:resource="@xml/codeinsta_widget_info" />`) and a cover-screen variant. `codeinsta_widget_info.xml`: `android:minWidth="110dp"`, `android:minHeight="40dp"`, `android:targetCellWidth="2"`, `android:targetCellHeight="1"`, `android:resizeMode="horizontal|vertical"`, `android:widgetCategory="home_screen|keyguard"`, `android:updatePeriodMillis="0"` (updates come from the app snapshot). Samsung cover-screen: add the Samsung-documented receiver metadata for FlexWindow cover widgets. The exact attribute and meta-data names must be taken from Samsung Developers' "Cover Screen widget" documentation at implementation time and recorded verbatim in `claude-status.md`; do not guess them.
- Kotlin: `SnapshotReader.read(context): Snapshot?` parses the JSON in SharedPreferences (returns `null` for missing or bad JSON; the widget then shows "Open CodeInsta to get started" or "Nothing new yet"); the Glance content wraps the whole widget in `actionStartActivity` with the snapshot's `deepLink` (`Intent.ACTION_VIEW`, data `codeinsta://reel/<id>`).

- [ ] **Step 1:** Write `index.test.ts` against a fixture manifest and gradle file: after the plugin runs the manifest contains both receivers, the provider meta-data, and the Samsung metadata; running the plugin twice does not duplicate entries; the Kotlin and XML files are copied; the no-emoji test (Task 2.2) still passes over `native/`.
- [ ] **Step 2:** FAIL, implement, PASS. Add the plugin to `app.config.ts`.
- [ ] **Step 3:** Verify build: `cd apps/mobile && npx expo prebuild --platform android --clean && cd android && ./gradlew :app:assembleDebug`: expected `BUILD SUCCESSFUL`.
- [ ] **Step 4:** Commit `git add apps/mobile/plugins apps/mobile/native apps/mobile/app.config.ts`; message `[claude] E5: Android Glance widget plumbing and cover-screen metadata`.

### Task 5.4: Android widget visual design [codex]

Queue: `37-android-widget-ui.md`. Needs: Task 5.3 committed.

```
GOAL: Design the Glance layouts for the CodeInsta widget.
READ FIRST: COORDINATION.md, decisions.md (no emojis; brand tokens are placeholders until D2), apps/mobile/src/theme/tokens.ts (colors to mirror in native resources), packages/shared/src/widget-snapshot.ts (fields), apps/mobile/native/android/widget/*.kt.
MODIFY ONLY: apps/mobile/native/android/widget/CodeInstaWidget.kt (Glance composables only; keep SnapshotReader and the click action) and apps/mobile/native/android/widget/res/values/{widget_colors,widget_strings}.xml (create). Three sizes via LocalSize/SizeMode.Responsive: small (cover screen, 2x1: newest title one line, creator + category), medium (title two lines, creator, category, headline row, streak "N day streak"), large optional. Colors from tokens (paper background, ink text, accent for the streak number), light and dark. No gradients, glows, or emoji; plain text and a drawn accent bar only. Empty states: no snapshot -> "Open CodeInsta to get started"; snapshot with no reels -> "Nothing new yet".
DO NOT TOUCH: plugin, bridge, app.config.ts, any TypeScript outside the widget folder.
ACCEPTANCE: `cd apps/mobile && npx expo prebuild --platform android --clean && cd android && ./gradlew :app:assembleDebug` succeeds; apps/mobile `npx jest src/no-emoji.test.ts` passes; the three states (full, headline missing, empty) are listed with screenshots notes in docs/coordination/codex-status.md.
```

### Task 5.5: iOS WidgetKit target [claude]

**Files:** Create `apps/mobile/targets/widget/{expo-target.config.js,Provider.swift,SnapshotReader.swift,WidgetViews.swift,CodeInstaWidget.swift}` (via `expo-apple-targets`, pin at implementation); Modify `apps/mobile/app.config.ts` (`ios.entitlements` App Group `group.dev.vjspranav.codeinsta`, plugin entry).

**Interfaces:**
- Target config: type `widget`, bundle identifier `dev.vjspranav.codeinsta.widget`, entitlements `com.apple.security.application-groups: ["group.dev.vjspranav.codeinsta"]`, deployment target matching the app. Swift: `SnapshotReader.read() -> Snapshot?` (`UserDefaults(suiteName:)`, `nil` on missing or bad JSON, no crash); `TimelineProvider` returns one entry now and refreshes after 30 minutes; supported families `systemSmall`, `systemMedium`, `accessoryRectangular`, `accessoryInline`; `widgetURL(URL(string: snapshot.newest.deepLink))`. Placeholder layout only (title, creator, category, streak); the final look comes in Task 5.6.

- [ ] **Step 1:** Write a config test `apps/mobile/targets/widget/config.test.ts` asserting the target bundle ID and App Group string equal the Global Constraints values.
- [ ] **Step 2:** FAIL, implement, PASS.
- [ ] **Step 3:** Verify: `cd apps/mobile && npx expo prebuild --platform ios --clean && xcodebuild -workspace ios/CodeInsta.xcworkspace -scheme CodeInsta -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build`: `BUILD SUCCEEDED` and the products contain `PlugIns/widget.appex`. Deep link check: `xcrun simctl openurl booted codeinsta://reel/<id>` opens that reel.
- [ ] **Step 4:** Commit `git add apps/mobile/targets apps/mobile/app.config.ts`; message `[claude] E5: iOS WidgetKit target`.
- [ ] **Risk note:** App Groups under a free Apple ID can fail to provision. If device install in Task 6.1 shows the widget cannot read the snapshot, record it in `claude-status.md`; the widget must keep showing its empty state, and the fallback is to ship the widget only after the owner buys the $99 account.

### Task 5.6: iOS widget visual design [codex]

Queue: `38-ios-widget-ui.md`. Needs: Task 5.5 committed.

```
GOAL: Final SwiftUI layouts for the iOS CodeInsta widget.
READ FIRST: COORDINATION.md, decisions.md (no emojis), apps/mobile/src/theme/tokens.ts, packages/shared/src/widget-snapshot.ts, apps/mobile/targets/widget/*.swift.
MODIFY ONLY: apps/mobile/targets/widget/WidgetViews.swift (and assets inside apps/mobile/targets/widget/ if needed). Families: systemSmall (newest title up to 3 lines, creator), systemMedium (newest title, creator, category, headline row, streak), accessoryRectangular (title two lines + streak), accessoryInline (single line "N day streak: <title>" truncated). Colors from tokens (paper, ink, accent), light and dark, containerBackground API. No gradients, glows, emoji, SF Symbols are fine. Empty states: no snapshot -> "Open CodeInsta to get started"; no reels -> "Nothing new yet".
DO NOT TOUCH: Provider.swift, SnapshotReader.swift, expo-target.config.js, app.config.ts, TypeScript.
ACCEPTANCE: xcodebuild simulator build succeeds (command in the target's task); apps/mobile `npx jest src/no-emoji.test.ts` passes; SwiftUI previews for the 4 families and 2 empty states exist in WidgetViews.swift.
```

### Task 5.7: Widget device verification [claude] + OWNER

- [ ] **Step 1 (Android, OWNER on the Flip 8):** Home screen: long-press the wallpaper, Widgets, CodeInsta, add. Lock screen: Settings, Lock screen, Widgets, add CodeInsta (One UI shows eligible widgets). Cover screen: Settings, Cover screen, Widgets, enable CodeInsta (the widget only appears if the Samsung metadata from Task 5.3 is correct).
- [ ] **Step 2:** `adb shell am start -a android.intent.action.VIEW -d "codeinsta://reel/<id>" dev.vjspranav.codeinsta` opens that reel. Tap the widget: opens the newest reel.
- [ ] **Step 3:** Sign out in the app: the widget shows "Open CodeInsta to get started" within one update. Record all results in `claude-status.md`; tick RUNBOOK E5 after iOS (Task 6.1 Step 4) as well.

# Phase E6: iOS build, SideStore, OTA

Deliverable: a signed IPA the owner installs through SideStore; OTA updates for both platforms.

### Task 6.1: iOS release build and IPA [claude] (needs O4 and Xcode signed into the Apple ID)

**Files:** Create `scripts/mobile/build-ipa.sh`; Modify `apps/mobile/app.config.ts` (`ios.appleTeamId` from env `APPLE_TEAM_ID`)

**Interfaces:**
- `scripts/mobile/build-ipa.sh`: `npx expo prebuild --platform ios --clean`; `xcodebuild archive -workspace ios/CodeInsta.xcworkspace -scheme CodeInsta -configuration Release -sdk iphoneos -archivePath build/CodeInsta.xcarchive CODE_SIGNING_ALLOWED=NO`; copies the `.app` into `Payload/` and zips to `build/CodeInsta.ipa` (SideStore re-signs). Prints the IPA path and size. Fails when the `.app` lacks `PlugIns/widget.appex`.

- [ ] **Step 1:** Run `bash scripts/mobile/build-ipa.sh` (first time may take 10+ minutes). Expected: ends with the IPA path.
- [ ] **Step 2:** `unzip -l apps/mobile/build/CodeInsta.ipa | grep -E "Payload/CodeInsta.app/Info.plist|PlugIns/widget.appex"`: both listed.
- [ ] **Step 3 (OWNER):** Install via SideStore (O4 step 7). Expected: app launches, Google sign-in works (O2), push registration silently skipped, widget added and showing data or the empty state.
- [ ] **Step 4:** Run the iPhone half of Task 3.7 (Instruments Animation Hitches, `CI_PERF` console lines, from `apps/mobile/perf/ios-perf.md`) and append the numbers to `docs/mobile/perf-results.md`; tick RUNBOOK E3 and E5 if both platforms pass.
- [ ] **Step 5:** Commit `git add scripts/mobile apps/mobile/app.config.ts docs/mobile/perf-results.md`; message `[claude] E6: iOS IPA build for SideStore`.

### Task 6.2: OTA channel for both platforms [claude] (needs O6)

**Files:** Modify `apps/mobile/app.config.ts` (`updates.url`, `runtimeVersion: { policy: "fingerprint" }`), `apps/mobile/eas.json` (channels), `apps/mobile/src/config.test.ts`

**Interfaces:**
- Consumes the EAS project ID from O6 via `EAS_PROJECT_ID`. Produces: `updates.url = https://u.expo.dev/<projectId>`, `updates.checkAutomatically = "ON_LOAD"`, `runtimeVersion.policy = "fingerprint"`; `eas.json` production profile `channel: "production"`.

- [ ] **Step 1:** Extend `config.test.ts`: `updates.url` starts with `https://u.expo.dev/`; `runtimeVersion` is set; production channel equals `production`.
- [ ] **Step 2:** FAIL, implement, PASS.
- [ ] **Step 3:** Build a release APK and the IPA with the config, install both, then change a visible string and run `cd apps/mobile && npx eas-cli update --branch production --message "ota check"`. Relaunch the app twice: the new string appears. Expected on both platforms; record in `claude-status.md`.
- [ ] **Step 4:** Commit `git add apps/mobile/app.config.ts apps/mobile/eas.json apps/mobile/src/config.test.ts`; message `[claude] E6: EAS Update channel`.

### Task 6.3: Distribution docs [claude]

**Files:** Create `docs/mobile/README.md`

- [ ] **Step 1:** Write the doc: Android (debug and release commands, `adb install -r`), iOS free-Apple-ID path (SideStore, 7-day refresh, 3 app and 10 App ID limits, no push), the paid $99 path (Apple Developer Program: enroll, change `APPLE_TEAM_ID`, enable Push and App Groups capabilities, `eas build -p ios --profile production`, TestFlight or direct install, push works), OTA (`eas update --branch production`, when a native change needs a new build: anything touching `plugins/`, `modules/`, `targets/`, `native/` or dependency versions), no emojis, no secrets.
- [ ] **Step 2:** Run `npx vitest run src/no-emoji.test.ts` (extend its scan to include `docs/mobile` if that is cheap) and commit `git add docs/mobile/README.md`; message `[claude] E6: mobile distribution docs`. Tick RUNBOOK E6.

# Phase E7: Maestro end-to-end gate and install

Deliverable: nothing reaches the owner's phone unless the flows pass on an Android emulator and iOS simulator.

### Task 7.1: Maestro tooling and emulators (OWNER approves installs) [claude]

- [ ] **Step 1 (OWNER approval for installs):** `brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro` (needs Java, present at `/usr/bin/java`); verify `maestro --version`.
- [ ] **Step 2:** Android emulator: `~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager "system-images;android-35;google_apis;arm64-v8a" "emulator" "platform-tools"` (use the API level the pinned Expo SDK targets), then `avdmanager create avd -n codeinsta-e2e -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_8`. iOS simulator: `xcrun simctl list devices available | grep "iPhone"`, create with `xcrun simctl create codeinsta-e2e "iPhone 17 Pro"` (use an available type).
- [ ] **Step 3:** Record versions in `claude-status.md`. Nothing to commit.

### Task 7.2: Test member and cleanup scripts [claude]

**Files:** Create `scripts/mobile-test-user.ts`, `scripts/mobile-test-user.test.ts`, `scripts/mobile-test-cleanup.ts`

**Interfaces:**
- `mobile-test-user.ts create`: with the service role, creates (or reuses) the member whose address is `MAESTRO_EMAIL` from `.env.local` (the owner sets it to an inbox they control, never an owner address), generates a random password if `MAESTRO_PASSWORD` is unset, writes both to `.env.local` (never prints them, never tracked), inserts `members` row `role: "member"`, `user_interests` onboarded. `cleanup`: deletes that user's `feedback`, `messages`, `likes`, `dislikes`, `views`, `topic_requests` rows (never the user or any other user's data, and refuses to run if the target email is in `ALLOWED_EMAILS`).
- Pure helper `assertSafeTarget(email: string, allowed: string): void` throws when the email is an owner address or empty.

- [ ] **Step 1:** Tests: `assertSafeTarget` throws for an allowlisted owner email and for an empty string, passes for a different address; the script's output (captured) never contains the password.
- [ ] **Step 2:** FAIL, implement, PASS. **Step 3 (PROD, owner approval):** `set -a; . ./.env.local; set +a; npx tsx scripts/mobile-test-user.ts create`: exits 0 and `.env.local` has the two variables.
- [ ] **Step 4:** Commit `git add scripts/mobile-test-user*.ts scripts/mobile-test-cleanup.ts`; message `[claude] E7: Maestro test member and cleanup`.

### Task 7.3: Maestro flows [claude]

**Files:** Create `apps/mobile/.maestro/{sign-in,swipe-10,like,dislike-undo,ask,widget-deeplink}.yaml`, `apps/mobile/.maestro/run-gate.sh`, `apps/mobile/.maestro/README.md`

**Interfaces:** every flow uses `appId: dev.vjspranav.codeinsta` and `tapOn: id: <TID>` / `assertVisible: id: <TID>` only (no coordinates except swipes). Credentials come from `${MAESTRO_EMAIL}` and `${MAESTRO_PASSWORD}` env. Flows:
- `sign-in`: `launchApp` with `clearState: true`, tap `login-email`, input email, tap `login-password`, input password, tap `login-submit`, assert `tab-feed`.
- `swipe-10`: from the feed assert `reel-page-0`; ten times `swipe` up (direction UP, duration 250 ms) and assert the next `reel-page-<n>` visible; fails if any `reel-retry` is visible.
- `like`: double tap center, assert the like control selected state (`reel-like` with `selected: true`); tap `reel-like` again to unlike.
- `dislike-undo`: `longPressOn` the video area, assert Undo toast `reel-undo`, tap it, assert the toast is gone and the reel is not marked.
- `ask`: tap `reel-ask`, input `[maestro-test] what is a page table?` into `ask-input`, tap `ask-send`, assert the sheet closes.
- `widget-deeplink`: `openLink: codeinsta://reel/${REEL_ID}`, assert `reel-page-0`.
- `run-gate.sh <android|ios>`: boots the emulator or simulator, installs the latest local build, runs `maestro test apps/mobile/.maestro/` with env vars loaded from `.env.local`, runs `scripts/mobile-test-cleanup.ts`, and on success writes `apps/mobile/.maestro/last-pass-<platform>.json` with `{ passedAt, buildSha256, gitRev }`. Requires at least 12 live reels (checked first through the public catalog read of the test member); otherwise it exits with "waiting for the library (RUNBOOK B1)".

- [ ] **Step 1:** Write the flows and script. Run `maestro test apps/mobile/.maestro/sign-in.yaml` against a build predating feature completion: expected FAIL at a missing id (proves the flow asserts something).
- [ ] **Step 2:** With the Phase E2-E4 build installed on the emulator: `bash apps/mobile/.maestro/run-gate.sh android`. Expected: all six flows pass, `last-pass-android.json` written.
- [ ] **Step 3:** Same for iOS simulator: `bash apps/mobile/.maestro/run-gate.sh ios`. Expected: pass.
- [ ] **Step 4:** Commit `git add apps/mobile/.maestro` (excluding `last-pass-*.json` via `.gitignore`); message `[claude] E7: Maestro flows and gate runner`.

### Task 7.4: Ship gate and install on the owner's phone [claude]

**Files:** Create `apps/mobile/scripts/ship-gate.ts`, `ship-gate.test.ts`; `scripts/mobile/ship-android.sh`; Modify `apps/mobile/app.config.ts` (release signing from `credentials/` via env), `.gitignore`

**Interfaces:**
- `ship-gate.ts`: `canShip(input: { pass: { passedAt: string; buildSha256: string } | null; apkSha256: string; now: Date; maxAgeHours?: number }): { ok: boolean; reason: string }` (default 24 h). `ok` only when a pass exists, is younger than the max age, and `buildSha256 === apkSha256`.
- `ship-android.sh`: builds the release APK signed with `credentials/codeinsta-release.keystore` (passwords from `ANDROID_KEYSTORE_PASSWORD` in `.env.local`), runs `ship-gate`, then `adb install -r <apk>` only when ok. If `adb devices` shows no `device`, prints the O3 steps.

- [ ] **Step 1:** Tests: no pass file returns not ok ("no passing Maestro run"); a pass older than 24 h returns not ok; mismatched hash returns not ok ("pass is for a different build"); fresh and matching returns ok.
- [ ] **Step 2:** FAIL, implement, PASS.
- [ ] **Step 3 (OWNER):** create the release keystore and register its SHA-1 (O1 step 1 release and steps 3 to 7).
- [ ] **Step 4:** `bash scripts/mobile/ship-android.sh`: with the gate satisfied it installs on the Flip 8; without a passing run it refuses and prints the reason.
- [ ] **Step 5:** Final acceptance on the phone: the Task 3.7 perf script passes for the release APK; widget on the cover screen shows data. Update `docs/mobile/perf-results.md`; commit `git add apps/mobile/scripts scripts/mobile apps/mobile/app.config.ts docs/mobile`; message `[claude] E7: ship gate and Android install`. Tick RUNBOOK E7 with the date.

---

## Self-Review (done)

- **Spec coverage:** goals 1 (E3 preload, targets, 3.6/3.7/6.1), 2 (haptics, share, notifications in 3.4, 3.5, 4.7, 4.8), 3 (widgets 5.1 to 5.7, Flip cover metadata 5.3), 4 (parity: feed, explore, profiles 4.4, inbox 4.5, ask 3.3/3.5, DMs 4.2, interests, requests, owner review with badge, invites, About, Privacy 4.6; member-to-member messaging is RUNBOOK F1, out of scope as the spec says), 5 (OTA 6.2), 6 (brand: tokens layer in 2.2, applied when D2 resolves, not blocking). Calls 1 (views plus RPC, Task 1.1 decision and 1.4), 2 (widget snapshot 5.1/5.2), 3 (shared scope 1.2/1.3), 4 (workspace layout 1.1, 2.1), 5 (2.4 push backend 4.7), 6 (2.2). Auth with nonce and owner bootstrap: 2.4, 2.5. Phases 1 to 7 map to RUNBOOK E1 to E7 as above. Maestro flows: sign-in, swipe 10, like, dislike plus undo, ask, widget deep link (7.3).
- **Deviation recorded:** `reel_views` replaced by the existing `views` table (identical shape, already RLS-protected and read by web) plus the streak RPC; flagged for owner override in Task 1.1.
- **Type consistency:** `MobileReel`, `Library`, `FeedContext`, `WidgetSnapshot`, `TID`, `useAuth` statuses are defined once (1.3, 2.6, 1.2, 5.1, 2.2, 2.5) and consumed by name; Codex briefs name the exact files and functions they use.
- **Open items the executor must resolve at implementation time, not guess:** exact Samsung cover-screen manifest metadata (5.3), whether the Google sign-in package accepts a `nonce` (2.1), whether `reels.expires_at` is a column (1.3), App Groups on a free Apple ID (5.5 risk note), the pinned version numbers.
