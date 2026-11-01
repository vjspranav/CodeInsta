# Codex status

## Task 10 ownership — independent review, 2026-11-01

Codex owns the new `docs/reels/RULES.md`, `docs/reels/GENRES.md`, and `docs/coordination/review-2026-11-01.md` for this dispatch. Review evidence is local under `/tmp/codeinsta-review-2026-11-01/`. No commits, deployments, production calls or edits to Claude-owned paths are authorized in this task.

Updated: 2026-10-31. Dispatch: frontend, audio player, auth, PWA, GPT playbook.

## Implemented

- Raised Next and eslint-config-next manifest minimums to **15.5.28**, the latest stable 15.x returned by npm. The existing lock already resolved that release; added only lucide-react. Preserved Kokoro and all Claude dependencies.
- Email/password sign-in and account creation. The server action normalizes/checks ALLOWED_EMAILS before signUp or password sign-in. SSR middleware refreshes sessions with getUser, signs out nonallowlisted sessions, and preserves cookie changes on redirects. Google is optional behind NEXT_PUBLIC_ENABLE_GOOGLE=true; callback exchanges codes, checks the allowlist, and signs out rejected users. Login/callback/not-invited, agent APIs, icons, manifest, SW and static assets remain accessible.
- Browser Supabase data access under existing RLS for reels, creators, likes, views, feedback and messages. Feed initially prioritizes unseen reels, interleaves creators with newest-first order within each creator, and stays stable while views are recorded.
- Feed, Explore (topic → series → reels), standalone reel, creator profile grids, profiles directory, two Markdown DM threads, replies/read receipts, and a modal feedback sheet with kind/wants controls. Empty/error/loading states, sign-out, keyboard controls, reduced motion and safe-area layout included.
- 9:16 reel renderer: automatic hook/takeaway, all seven element types, palette, code token highlighting, measured element-center SVG arrows, cycle-safe reference fallback, timed enter animations and highlight pulses. Captions use seven-word karaoke windows and manifest timestamps; progress is segmented by scene.
- Audio defaults on, unlocked on the first feed tap using one shared HTMLAudioElement. Recorded audio drives scene time; authored scenes use max(authored duration, audio duration + 250 ms), hook/takeaway use their clip durations. Missing manifests use Web Speech. Playback pauses offscreen (<60% visible), on manual pause, backgrounding and while feedback is open. Double-tap likes with a heart burst. Views insert after 3 seconds of actual advancing playback. Completion shows a next-series cliffhanger when available and advances the feed.
- Per-user local-device daily streak/concepts counter, distinct completions per local calendar date. No new backend table required.
- Standalone portrait manifest, generated 192/512/maskable/180 PNGs, iOS metadata, SW registration and public offline shell. No authenticated HTML/data, API, or cross-origin Supabase requests are cached.
- `agents/codex/PLAYBOOK.md` uses the actual CLI syntax and production origin, handles questions/DMs first, then 1–2 deeper liked follow-ups with --parent, then 1–2 GPT-owned curriculum topics. Every post validates first; includes audio failure recovery without duplicate posting.

## Decisions and ownership

- Added Codex ownership of `src/lib/supabase/**` and `src/middleware.ts` to COORDINATION.md before implementation. All other frontend helpers/tests live under components. `src/lib/reel-audio.ts` is imported as a type only; no Claude-owned file was edited.
- Used the existing approved spec/dispatch without an additional approval gate. Followed frontend-design and verification-before-completion guidance; no subagents or live publishing.
- System fonts keep builds independent of remote font services. Palette: ink #08090d, panel #14171f, text #f6f6fa, muted #a0a7b8, lavender #a6a0ff; semantic diagram colors distinguish mechanisms. Reel stage and captions carry the emphasis, navigation stays quiet.
- Feed ordering is frozen for a loaded feed so inserting a view cannot move the current reel. A reload picks up new ordering. Explore/profile links support continuing a particular series; ordinary feed auto-advance retains interleaving.
- The streak is device-local and keyed by user ID, not synchronized across devices. Offline mode intentionally offers reconnect rather than storing private lessons/messages.
- New dependency resolution used `/tmp/codeinsta-npm-cache` because the default npm cache is not writable. Latest release confirmed with `npm view next@15 version --json`; SSR approach checked against https://supabase.com/docs/guides/auth/server-side/creating-a-client.

## Verification

- `npm run lint`: pass, no warnings (final run).
- `npm test`: 51 tests pass across 4 files. Five new tests cover audio/card/cliffhanger duration, fallback captions, unseen/interleaved ordering, reference cycles and allowlist normalization/fail-closed behavior.
- `npm run build`: pass on Next 15.5.28; all frontend and pre-existing agent routes compile. Final rerun after playback refinements recorded below if needed.
- `git diff --check`: pass. PNG dimensions verified: 192, 512, maskable 512, apple 180.
- `WATCHPACK_POLLING=true npm run dev -- --hostname 127.0.0.1 --port 3100`, then curl `/login`: **HTTP 200**, body contains Sign in, Create account, Email, Password and manifest metadata. Signed-out `/`: **307 → /login**. Manifest and SW: **200**. Dev server stopped with SIGINT.
- Initial dev attempt encountered EMFILE watcher errors and returned 404; restarting with polling resolved it. Initial test alias and implicit TypeScript row types were corrected before passing checks.
- `npm install` reported 19 dependency audit findings (15 moderate, 4 high), including existing dependency chains; no major-version audit fix was applied because the dispatch requires Next 15 and preserving Claude tooling.

## Integration limits / handoff

No real account was created, no live user likes/messages/feedback were inserted, and no deployment or push was performed. End-to-end real-device Safari audio unlock and Google OAuth configuration still need integration verification; unit/build/curl checks do not establish those. The optional in-app browser is unavailable in this headless environment, so no visual-browser verification is claimed. Existing Supabase schema/RLS and configured environment are consumed as supplied; .env.local was never printed or staged.

Commit target: `[codex] frontend, player, PWA, GPT playbook`. Only explicitly owned paths are included.

## Commit blocker

The final lint, 51-test suite and production build all passed after the last playback changes. The requested commit could not be created: `git add` and `git commit` both failed with `fatal: Unable to create .../.git/index.lock: Operation not permitted`. This session explicitly exposes `.git` read-only and does not permit approval escalation. No files were staged. The orchestrator must run the following in its writable-git session (review paths for any concurrent edits first):

```sh
git add COORDINATION.md package.json package-lock.json src/app/globals.css src/app/layout.tsx src/app/page.tsx src/app/auth src/app/c src/app/explore src/app/inbox src/app/login src/app/not-invited src/app/profiles src/app/reel src/components src/lib/supabase src/middleware.ts public/icons public/manifest.webmanifest public/offline.html public/sw.js agents/codex/PLAYBOOK.md docs/coordination/codex-status.md
git commit -m "[codex] frontend, player, PWA, GPT playbook"
```

No push or deployment attempted.

## Reel Stage polish — 2026-10-31

This dispatch supersedes the old renderer notes above. No commit was requested or attempted.

- Updated `src/components/reel/stage.tsx`, added `stage-layout.ts` and `stage-layout.test.ts`, and revised the reel rules in `src/app/globals.css`.
- Arrows now occupy an SVG layer below opaque tinted boxes. Measured rectangle/line intersections anchor each endpoint at its box edge; quadratic routes search both sides to avoid intervening elements. Arrowheads use generated IDs independent of authored IDs. Dark label pills use measured heights and collision-free positions beside their paths.
- Stage-relative typography: title 7.5cqw, body 4.8cqw, box 4.4cqw, list 4.6cqw, code 3.4cqw. Boxes treat authored height as a minimum; code/list heights follow content.
- All authored elements are measured before entrances, so the composition stays stable as elements appear. ResizeObserver updates measurements on resize/content changes. The complete diagram, routes and labels fit horizontally and center vertically within 6–74% of the stage, with enlargement capped at 1.25. Routing is memoized independently of playback time.
- Captions now live inside the stage at 80% height. A sliding seven-word window follows the active word using existing timestamps; measured text width trims unusually long phrases to fit two lines, with a two-line CSS cap. Hook cards use 9cqw text, an eased scale entrance and a subtle animated orange (Claude) or teal (GPT/default) background. Reduced-motion preferences disable entrances and ambient animation.
- Final verification: `npm run lint` passes without warnings; `npm test` passes **56 tests in 5 files**, including five new geometry regressions; `npm run build` passes on Next 15.5.28. `git diff --check` passes.
- Visual verification limit: read the real Claude page-fault seed and attempted a headless Chrome screenshot against the existing dev-preview route using a separate temporary production server. Chrome aborted at launch (SIGABRT / sandbox EPERM); no screenshot or real-device visual pass is claimed. The temporary server was stopped. The orchestrator should visually review its existing preview before deployment, especially pathological overlapping authored boxes (a clear quadratic route cannot always exist for overlapping endpoints).
- Protected paths were left untouched: `content/seed/gpt/**`, `src/app/dev-preview/**`, and `src/middleware.ts`. The existing middleware diff belongs to the orchestrator. No dependencies or lockfiles were changed; temporary verification tools were installed only under `/tmp`.

## GPT starter seed dispatch — 2026-10-31

Completed 15 reel-v1 JSON files in `content/seed/gpt/`: positions 01–03 of `aosp-boot-sequence`, `os-syscalls-and-processes`, `compilers-optimization-debugging`, `distributed-failure-stories`, and `databases-hands-on-ops`. Read the schema, both examples, Claude seed shape samples, and the full curriculum before authoring. Topics and hooks match the GPT-owned curriculum entries exactly.

Each reel has four scenes totaling 40–41.5 authored seconds, narration paced at no more than 2.5 whitespace-delimited words/second, captions at most 120 characters, staggered entrances, and boxes/arrows/code/lists. A structural audit confirms percentage-grid bounds and nonoverlapping positioned rectangles. Primary-source URLs were checked; excerpts and hypothetical outputs are labeled. Commands are teaching examples with explicit lab/build prerequisites, not claimed executions on Android/Linux/PostgreSQL infrastructure. No rendered-browser visual QA is claimed.

Final verification:

- `npm run agent -- validate content/seed/gpt`: exit 0; 15 total, 0 invalid.
- `npm run seed -- --dry-run`: exit 0; GPT found 15, valid 15, skipped 0; Claude found 15, valid 15, skipped 0.
- Supplemental content audit: exact topics/hooks, five series with indexes 1–3, four scenes each, timing, caption limits, narration pace, element bounds, rectangle separation, distinct entrance times, and all requested visual types pass.

This dispatch wrote only `content/seed/gpt/**` and this status file. No publishing, database writes, audio generation, staging, or git commit was attempted. Ready for the orchestrator to review and commit.

## Invite membership frontend — 2026-10-31

Completed the “Others can join; questions stay owner-only” dispatch. This supersedes the earlier allowlist-only authentication behavior above.

- Added `npm run invite` → `tsx scripts/invite.ts`; no dependency or lockfile changes.
- Middleware refreshes the authenticated session and checks the caller's membership. Nonmembers go to `/join`; nonallowlisted users are no longer signed out. Public auth/join pages, existing static assets and agent APIs remain accessible. Allowlisted users missing an owner row go through `/auth/bootstrap` once, preserving a validated local destination. The route and successful login/OAuth flows bootstrap owners through a server-only wrapper around the existing service-role client. Middleware contains no service-role writes or imports.
- Email signup validates invite capacity and expiration server-side before signUp, except for server-verified owner emails. Authenticated signup redeems through `redeem_invite`; redemption races lead to `/join` with recovery guidance. `/join` provides RPC redemption, error handling and sign-out. Existing email sign-in accepts members without an invite. Google is enabled unless `NEXT_PUBLIC_ENABLE_GOOGLE=false`; callback exchanges the session and returns to `/` for membership gating.
- `/login?invite=CODE` selects Create account and prefills the invite field. `/profiles` links owners to `/invites`, which lists codes, usage and expiry and allows creating a code for a validated positive integer number of uses. Copy buttons and absolute share links are included. Both the page and creation action independently verify the authenticated email against ALLOWED_EMAILS before service-role access.
- Server-derived owner status controls the Inbox tab, creator Message links and reel note/ask controls. `/inbox` independently verifies owner authorization and redirects other users. Existing database RLS remains the write authorization boundary.
- Added 17 regression tests covering invite validity/expiry, safe bootstrap destinations, signup rejection before account creation, owner exemption, nonowner sign-in, redemption races, membership gating, public routes and agent API exemption.

Final verification: `npm run lint` passes without warnings; `npm test` passes **73 tests across 8 files**; `npm run build` passes on Next 15.5.28; `git diff --check` passes. No production account creation, invite writes, OAuth end-to-end test, visual browser verification, deployment, staging or commit was attempted. Production migration and `scripts/invite.ts` were read but left unchanged. Only Codex-owned frontend/helper/test/status paths and package.json were edited; the existing untracked `.claude/` was left untouched.

## Google Identity Services redirect dispatch — 2026-10-31

Replaced the login page's Supabase OAuth button with Google's rendered pill button using `next/script`, GIS `ux_mode: "redirect"`, and the same-origin `/auth/google` login URI. No UI caller of `signInWithOAuth` or `/auth/callback` remains; the legacy callback route is unchanged. Signup retains an invite-code hint, and Google errors appear on login. Nonces refresh every nine minutes while the login page remains open.

`GET /auth/google/nonce` generates 32 random bytes, stores their hex representation in `g_nonce` (HttpOnly, Secure, SameSite=None, Path=/auth/google, Max-Age=600), and returns only its SHA-256 hex hash with no-store caching. The POST endpoint requires matching nonempty GIS CSRF cookie/form tokens (400 on failure), a credential, and a correctly shaped raw nonce. It passes the raw nonce to Supabase `signInWithIdToken`, which verifies the signed token and nonce binding, then bootstraps owners and returns a 303 to `/`. Authentication/nonce/bootstrap failures return a 303 to `/login?error=google`. The nonce is expired on those redirects; Supabase session cookie writes are attached to the redirect response. Both routes are public in middleware and frontend lists and exempt from middleware owner-bootstrap redirection.

Verification: `npm run lint` passed; `npm test` passed **95 tests across 9 files**; `npm run build` passed, including both new route handlers; `git diff --check` passed. Added route tests for missing/empty/mismatched CSRF, missing/malformed nonce, raw nonce forwarding, simulated Supabase nonce rejection, cookie preservation/deletion, missing credentials, bootstrap failure, and nonce randomness/hash/cookie attributes. Middleware tests cover signed-out and owner sessions on both new endpoints.

Implementation references: [Google server-side token/CSRF verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) and [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). Real Google account sign-in and iOS standalone PWA behavior were not exercised headlessly. No deployment, staging, or git commit was attempted. Existing untracked `.claude/` was left untouched.

## Interests and topic requests frontend (Claude stand-in for Codex task 7) — 2026-10-31

- `/onboarding`: one screen of large topic chips (`src/lib/interests.ts` labels/blurbs), at least one required, optional box for up to 3 topic requests. Saves `user_interests` (upsert, onboarded=true) then inserts `topic_requests`, then goes to `/`.
- Gate: `DataProvider` (client) loads `user_interests`; no row or `onboarded=false` redirects to `/onboarding` from app pages, including the existing owner. Middleware untouched. A failed interests lookup fails open.
- Profiles page: My interests editor, Topic requests list (status badges, reel link when done, pending-limit message), and an owner-only Review requests list (approve/reject via RLS). `members` is select-self only, so the reviewer sees a short member id, not an email.
- Feed: `orderFeed(rows, seen, context)` implements the decision's scoring (+100 next part, +60 liked parent follow-up, +80 own fulfilled request, +40 interest area, +0..20 recency over 14 days, every fifth slot an out-of-area pick, seen last). Tests added in `timeline.test.ts`.
- `agents/codex/PLAYBOOK.md`: fulfil approved requests first, then weight toward top `interest_counts`.
- Not exercised against a live Supabase or in a browser. No commit.

## Editorial app UI and video playback — 2026-11-01

Implemented this dispatch without staging or committing. Existing orchestrator edits were preserved; no files under `render/**`, `tts/**`, `scripts/**`, `supabase/**`, or `src/app/api/agent/**` were edited.

- Restyled the app with black/neutral surfaces, system typography, a restrained blue action accent, 1.75-stroke icons, quieter headers/tab bar, neutral profile grids, spacious inbox rows, and consistent controls. Semantic red remains for likes/errors. Removed gradients, ambient glows, blurred backdrops and shimmering gradients, including the legacy reel stage; loading skeletons remain as solid pulsing blocks. About retains all its text and the “who built what” diagram, with simpler process rows and neutral diagram groups.
- `Player` selects native full-viewport video whenever `video_url` exists; script-only reels retain the live timeline/audio player. Extracted a common overlay so creator links, likes, asks, sound controls, completion and next-series links stay consistent. Video supports playsInline, metadata preloading, muted autoplay before unlock, gesture-based audio unlock, pause/resume, double-tap likes, currentTime progress, three-second view recording, completion/auto-advance, and retry messaging. It pauses offscreen, on backgrounding, when manually paused, and while feedback is open. Cancellable playback effects prevent late autoplay rejections from restarting an offscreen video.
- Active ±1 virtualization remains intact. Mounted neighbor videos preload metadata, including the next feed reel; distant reels stay placeholders. Persistent data caching and route skeletons are preserved. Timeline memoization depends on script/audio/series values, so sound or activity changes do not regenerate legacy frames.
- Data loading now accepts video reels without a valid v1/v2 script, keeps legacy script validation for script-only reels, and carries `video_url` and glossary data. Lab safely handles video-only rows too. `/reel/[id]` uses the same Feed/Player path.
- Updated GPT playbook: isolated tool-less writer for `from_owner:false`, verified commit stories without on-screen hashes, short real snippets, and v1/v2 publishing until the orchestrator switches to v3. Preserved the orchestrator's genre/style/dislike guidance.
- Root ESLint ignores now cover nested dependency/output directories and Python virtualenvs. The original full lint traversed generated Remotion output and vendored Gradio JavaScript. Renderer source is still linted. Root Next TypeScript excludes the separate `render` package, which owns its own tsconfig and `npm run typecheck`. During concurrent renderer work, the root build briefly encountered a missing `C` theme export in renderer Captions; no renderer code was changed to address it.

Verification: `npm test` passes **186 tests across 16 files**, including ten new playback/loading tests. `npm run lint` passes with 19 existing warnings in renderer source and no errors. `npm run build` passes on Next 15.5.28. `git diff --check` passes. Production-server smoke requests to About and login both returned HTTP 200; the temporary server was stopped.

Visual/integration limits: headless Chrome aborted with SIGABRT in this sandbox, so no screenshot review is claimed. Real-device Safari audio unlock, authenticated feed interaction and actual remote-video loading remain integration checks for the orchestrator. No deployment, database writes, dependency installation, or git commit.

## Categories, owner review, About link, and private dislikes — 2026-11-01

Completed the requested frontend dispatch without staging or committing. Existing orchestrator edits were preserved. No files under `render/**`, `tts/**`, `scripts/**`, `supabase/**`, or `src/app/api/agent/**` were edited by this dispatch.

- `/interests` now owns the interests editor and personal request list/input, linked from Profiles. Category chips have labels/descriptions and no emoji decorations. Interests, onboarding, and Explore share categories loaded from `categories`; the unused hard-coded interest labels were removed. Explore matches the first topic segment to the category slug. Onboarding exposes loading/retry states for category fetch failures.
- Owner Profile badge uses an exact head-only pending-count query, refreshed on focus/visibility and after review. `/admin/requests` uses the existing server-side `requireOwner` redirect guard and owner-scoped browser queries for pending requests, member emails, dates, and ten recent decisions. New-category approval has label and editable auto-derived slug fields; existing-category approval uses the DB category select. Both approvals and rejection call `review_topic_request` with its migration 0007 argument names and display RPC errors. Successful review refreshes requests, badge, and categories.
- Profiles includes About beside Privacy/sign-out. Added signed-out `/about` middleware coverage; middleware itself was not changed by this dispatch.
- The shared reel overlay offers private, count-free ThumbsDown “Not for me” feedback with optimistic state, save-failure rollback, and a six-second “Got it, fewer like this” notice with Undo. DataProvider fetches the user's dislikes alongside likes and exposes nullable reel genre/style. Feed initialization passes dislikes into ranking: unseen matching genre/style gets −60; genre alone gets −25, without stacking duplicate dislikes or removing any reel. Seen ordering stays unchanged. Existing session order stays stable while a reel plays; subsequent feed initialization uses the updated preferences.
- Ranking tests cover exact penalties, no duplicate stacking, null metadata, style-only matches, seen reels, per-user context, and retaining all topics.

Verification: `npm run lint` exits 0 (19 existing renderer warnings, no errors); `npm test` passes **189 tests across 16 files**; `npm run build` exits 0 with `/interests` and `/admin/requests`; `git diff --check` passes. Live Supabase writes and authenticated browser interactions were not exercised in this headless dispatch.

## Task 11 — GPT seed remakes (in progress, 2026-11-01)

Dispatch grants Codex ownership of `content/remake/gpt/**`. Rewriting all 15 original topics as v3 stories; source seeds remain unchanged. Delegated disjoint authoring groups; final validation uses temporary 155 wpm silent manifests and only each story's selected style. No commits, deployments, production access, paid TTS, or video renders.


## C1 — GPT creator playbook v3 (2026-11-01)

Replaced the legacy GPT creator workflow in `agents/codex/PLAYBOOK.md` with v3 Story publishing, all requested publish flags, quota-based sequential Gemini batches, request/DM/follow-up priority, GPT ownership and curriculum handoffs, series order, style/genre rotation, live research, adaptive even-level ML, and full QA/safe-zone rules. Verified documented agent commands against `scripts/agent.ts` and publishing behavior against `scripts/lib/publish-v3.ts`; static content, legacy-removal, emoji, and whitespace checks passed. No blockers for this documentation change; no git operations, token use, production calls, publishing, or rendering were performed. Only the playbook and this status file were edited.
