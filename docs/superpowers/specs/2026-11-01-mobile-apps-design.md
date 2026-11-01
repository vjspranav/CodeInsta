# CodeInsta mobile apps (Android + iOS) and brand refresh: design

Status: APPROVED by the owner, 2026-11-01 ("Approve spec"), including the orchestrator calls at the end.

## Intent
CodeInsta replaces doomscrolling with learning reels. The web app works but feels like a website, with a browser frame on Android and an AI-generic look (purple accent, sparkle logo). The owner wants a top-notch, app-native experience on both phones, kept in parallel with the web app, which stays for anyone without the app.

The delight lives in the content: the "I never knew that" moment. The app's job is to get out of the way: instant, smooth, always ready.

## Goals
1. **Fast and smooth.** Swiping to the next reel never waits: the next 2 reels are preloaded (video buffered, poster decoded), with 60 fps scrolling and native video players (ExoPlayer on Android, AVPlayer on iOS). Targets: cold start to first frame playing < 1.5 s on a recent phone; swipe to the next reel playing < 150 ms when preloaded.
2. **Feels native.**
   - Full screen with no browser frame; system back and gestures; haptics on like and dislike.
   - The share sheet ("send this reel").
   - Notifications when a creator answers your question or approves a topic request.
3. **Glanceable daily widget.** An Android home and lock screen widget that also works on the **Galaxy Z Flip 8 cover screen**, plus an iOS lock and home screen widget (WidgetKit). It shows a "daily news" glance: today's newest reel (title, creator, category) with a tap that opens it, a frontier or tech-news headline when there is one, and the learning streak.
4. **Same product everywhere.** Every web feature works in the apps:
   - feed, explore, profiles, creator pages;
   - like, "Not for me", ask (owner unlimited, members 3/day), owner DMs;
   - interests, topic requests, owner review with the pending badge;
   - invites, About, Privacy.
   Member-to-member messaging lands on all three platforms together when it is built (decided: after launch).
5. **Updates without reinstalling:** JS/asset changes ship over the air (EAS Update). Only native changes need a new build.
6. **Brand refresh, shared by web, apps and the reel videos:** a real logo mark; one warm, distinctive accent (from the reel paper #F7F4EC and the orange #E4572E family the owner liked) replacing the purple; type and icon rules; app icon plus adaptive icon, splash, and widget styling.

## Non-goals (for now)
- Play Store / App Store publishing. Distribution is personal: an Android APK over ADB or a download link; iOS via a free Apple ID with SideStore auto-refresh, or a paid developer account if the owner buys one later.
- Offline downloads of whole series (only the preload cache).
- Tablet- or landscape-specific layouts.

## Anti-goals (would make this a failure even if it "works")
- Feeling like a web view: janky swipes, white flashes, spinners between reels.
- Visual drift between web and apps: one design system.
- AI-generic visuals: gradients, glows, neon, glassmorphism, emoji-as-UI.
- Any security regression: member text never reaches the AI creators, owner powers still need the Google identity, RLS stays the boundary.

## Constraints
- Backend: no breaking changes. Additive tables and functions are allowed (Claude-owned migrations). Supabase (Postgres, Auth, Storage, RLS), the same tables and RPCs, and the agent API. The apps talk to Supabase directly with the anon key plus the user's session, exactly as the web client does.
- **Auth:**
  - Google sign-in natively: Android Credential Manager / iOS Google Sign-In, giving an ID token, then Supabase `signInWithIdToken` with nonce.
  - Email/password stays.
  - Invite-only membership and owner bootstrap behave exactly as on the web (`redeem_invite`, owner = allowlisted email + Google identity).
  - New Google OAuth client IDs are needed for Android (package + SHA-1) and iOS (bundle ID). These are owner steps, documented in the runbook.
- **Package and bundle ID:** `dev.vjspranav.codeinsta` (my call).
- **Stack:** Expo SDK (latest stable at build time, New Architecture), TypeScript, expo-router, expo-video, FlashList v2 or a paged pager for the vertical feed, Reanimated, expo-haptics, expo-notifications, and EAS Build/Update (local builds allowed: `eas build --local` / `npx expo run:android`).
  - Widgets are native: Android Jetpack Glance via an Expo config plugin or module (with the Samsung cover-screen metadata so it's selectable on the Flip's FlexWindow), and iOS WidgetKit (SwiftUI) via a target plugin (e.g. expo-apple-targets).
  - Widget data comes from a small read-only endpoint or the Supabase query cached by the app.
- **Shared code:** a `packages/shared` folder holds the types, the reel/feed ordering logic (`orderFeed`), validation and the Supabase query helpers, used by both web and mobile, so feed ranking is identical. Moving existing web code there must not change web behavior (tests must pass).
- **Location:** `apps/mobile/` in this repo. Workspace setup is a Codex-owned root tooling change: Codex does it, or Claude as a stand-in, recorded in the status files.

## The how, as decided
- **Expo for both platforms** (owner: "All expo is good"); three clients in parallel: web, Android, iOS.
- **Voice and video pipeline unchanged.** The apps play the same rendered MP4s (`video_url`) with poster frames. Legacy script-only reels are archived at launch, so the apps only need the video player.
- **Brand refresh first**, so the web, the apps and the videos share it from day one.

## Phases
1. **Brand:**
   - deliverable: logo mark (SVG), accent and neutral palette tokens, type pairing, icon set rules, app icon, adaptive icon, splash and widget style;
   - shown to the owner on a local page with 2–3 directions;
   - the picked one applied to the web app (tokens in globals.css) and deployed after owner OK.
2. **App shell and auth:** the Expo project, sign-in (Google + email), invite/join, onboarding and interests, plus the bottom tabs (Feed, Explore, Inbox, Profiles). Android dev build on the owner's phone over ADB.
3. **Feed:**
   - a vertical pager with expo-video, preloading the next 2 reels, the poster under the video, autoplay with sound after the first tap (the same unlock rule as web), and pause off-screen;
   - double-tap to like, long-press for "Not for me", ask sheet, share sheet, progress bar, series "Next part" card, glossary sheet;
   - performance pass against the targets above, measured on the Flip 8 and one iPhone.
4. **Everything else:** explore, creator pages, profiles, inbox and DMs, owner review, invites, About/Privacy, and notifications (Expo push plus a Supabase trigger or edge function for "answer posted" and "request approved").
5. **Widgets:** Android Glance (home, lock, Flip cover screen) and iOS WidgetKit (lock, home).
6. **iOS build and distribution:** a local Xcode build signed with a free Apple ID, SideStore for auto-refresh, and documentation of the $99 path. OTA channel set up for both platforms.
7. **QA gate for the apps:**
   - Maestro end-to-end flows (sign-in, swipe 10 reels, like, dislike + undo, ask, open a widget deep link) on an Android emulator and iOS simulator;
   - a frame-time check while swiping;
   - nothing ships to the owner's phone unless the flows pass.

## Left to the builder
- The exact component library (built in-house on the design tokens; no heavy UI kit).
- How preload is implemented (a player pool of 3 vs FlashList recycling) as long as the targets are met.
- Data caching (TanStack Query or a light custom cache) and the widget data source shape.
- Notification transport details.

## Calls made after the builder check (orchestrator's calls, owner may override)
1. **Streak and "seen" sync across devices:** a new `reel_views (user_id, reel_id, seen_at)` table with own-row RLS, plus an RPC that returns the streak. Web, apps and widgets all read it; localStorage stays only as an offline cache. This also feeds `orderFeed`'s `seen` input identically everywhere.
2. **Widget data:**
   - Reels are member-only under RLS, so widgets never call Supabase themselves and never use a public endpoint. The app writes a small widget snapshot (newest reel, newest frontier/tech-news reel as the headline, the streak) to shared storage: an iOS App Group, Android shared preferences/DataStore. It refreshes the snapshot on app use and via background fetch (WorkManager / BGAppRefresh).
   - The headline is the newest reel in the `frontier` or `tech-news` category.
3. **Shared code scope:** only types, validation and `orderFeed` (plus its tests) move to `packages/shared`. Web keeps its own server-side queries; mobile writes its own client queries. No refactor of web queries.
4. **Workspace layout:**
   - The web app stays at the repo root, unchanged. `apps/mobile` is its own package with its own `package.json` and lockfile; no root npm workspace, to avoid React/Next vs React Native version conflicts.
   - `packages/shared` is plain TypeScript with no React deps, consumed via path aliases (web tsconfig paths; mobile Metro `watchFolders` plus tsconfig paths).
   - Codex owns `apps/mobile`'s UI; the root tooling change is limited to tsconfig paths and is recorded as a stand-in if Claude does it.
5. **Notifications backend:** additive migration `push_tokens (user_id, token, platform, updated_at)` with own-row RLS, plus a Supabase database trigger or edge function that sends an Expo push when a creator message is inserted for a user or a topic request becomes approved/fulfilled. Claude owns it.
6. **Brand gating:** not blocking. The app shell is built on a design-token layer with neutral placeholder tokens; once the owner picks a direction (phase 1), its tokens drop in for web and mobile at once.
