# Claude Code status

Updated: 2026-10-31

## Acknowledgment
I've read `COORDINATION.md` and **accept the proposed ownership**:
- **Claude owns:** the Supabase database migration and RLS, the publisher/agent CLI (`scripts/agent.ts`) and agent API routes (`src/app/api/agent/**`) if Codex agrees, Claude's half of the curriculum and the 100 Claude seed reels (`content/seed/claude/**`), and `agents/claude/PLAYBOOK.md`.
- **Codex owns:** the frontend, the shared contract (reel schema / zod), the GPT curriculum and seed reels, integration, git operations, scaffolding, dependencies and package manifests.

I will not scaffold, install dependencies, edit package manifests, switch branches or commit until Codex says the scaffold and shared contract exist. If you need a dependency for my parts, I'll request it here.

## Conflicts I caused (sorry), and what I did about them
1. **I ran `git init -b main` and added `origin` → https://github.com/vjspranav/CodeInsta.git** before I saw this file. There are no commits. Codex keeps ownership of git from here; if you want a clean re-init, go ahead.
2. **I probably overwrote `docs/superpowers/specs/2026-10-31-codeinsta-design.md`** with my own draft: my write landed while yours may already have existed. I moved my draft to `docs/coordination/claude-design-notes.md`, so the spec path is now empty. **Please re-write your spec there.** Take anything useful from my notes: a concrete reel JSON format, the agent API endpoints and CLI commands, the data model, and the builder-check calls at the bottom.

## Owned paths (written)
- `supabase/migrations/**` (incl. `0002_audio.sql`: `reels.audio jsonb` + public bucket `reel-audio`, applied to the live project)
- `src/app/api/agent/{inbox,reels,messages,catalog}/route.ts`
- `src/lib/agent-auth.ts`, `src/lib/agent-auth.test.ts`, `src/lib/supabase-admin.ts`
- `scripts/agent.ts`, `scripts/seed.ts`, `scripts/lib/validate-path.ts`, `scripts/lib/validate-path.test.ts`
- Audio (Kokoro TTS): `scripts/lib/tts.ts`, `scripts/lib/audio-upload.ts`, `src/lib/reel-audio.ts`, `src/app/api/agent/reels/[id]/audio/route.ts`. CLI: `post` auto-renders+uploads (`--no-audio` skips), `audio <reel_id> <file.json>` re-renders. `npm run seed` renders audio for reels with null `audio` (`--no-audio` skips). Reel POST response now also returns `creator_id`.
- `content/curriculum.md` (all, per autonomous-mode update) and `content/seed/claude/**`
- `agents/claude/PLAYBOOK.md`
- `CLAUDE.md`

## Checks run
- `npx tsc --noEmit`: pass
- `npm test`: pass (3 files, 46 tests, incl. agent-auth and validate-path)
- `npm run lint`: pass
- `npm run build`: pass (four `/api/agent/*` routes dynamic)
- `npm run agent -- validate content/examples`: exit 0; `npm run seed -- --dry-run`: ok (no seed files yet)
- Not run: live API routes against Supabase (no credentials)

## Blockers
I'm waiting on Codex for the spec rewrite, the scaffold and the shared reel contract.

## Next
Once the contract exists: the migration, then the agent API + CLI, then the curriculum and seed reels (through low-cost subagents).

## UPDATE — autonomous mode (user instruction, 2026-10-31)
The user does not want to relay messages between agents. From now on:
- **This Claude Code session is the orchestrator.** It makes the product decisions and records them in `docs/coordination/decisions.md`.
- **Codex work is dispatched headlessly** through `codex exec` from the Claude session. Each dispatch gets a self-contained brief and reports in `docs/coordination/codex-status.md`.
- **Any interactive Codex session** should stop coordinating and avoid editing files unless the user asks it directly, so it doesn't race the dispatched runs.
- **Ownership change:** Claude owns all of `content/curriculum.md`, which assigns topics to both creators. The rest of the split above is unchanged.

## UPDATE — interests and topic requests
- Migration `0004_interests.sql` applied: `user_interests`, `topic_requests`, the BEFORE INSERT trigger (owner→approved else pending, max 5 pending, forced decided_at/fulfilled_reel_id null, user_id=auth.uid() for non-service inserts), RLS (only `is_owner()` can update topic_requests).
- `GET /api/agent/inbox` now returns `topic_requests` (approved) and `interest_counts`. `POST /api/agent/reels` accepts `fulfills_request_id`. CLI: `post --fulfills <id>`. PLAYBOOK step 0 added.

## UPDATE — Format Lab audio + seed (2026-10-31)
- `scripts/lib/tts.ts`: v2 reels render one clip per scene line in the speaker's `cast.voice` (Kokoro speed 1.08; falls back to the creator default). Hook/takeaway/line-less scenes use the first cast member's voice. `scenes[i].lines[j] = {url, duration_ms, speaker, words}` (AudioJson v2); line scenes have `url: ""`, `words: []`, duration = sum of lines. v1 unchanged (no speed override).
- Uploads to `reel-audio/<reel_id>/scene-<i>-line-<j>.mp3` via `scripts/lib/audio-upload.ts` (service-role and API paths). `POST /api/agent/reels/[id]/audio` manifest accepts optional `scenes[i].lines`, expects parts `scene-<i>-line-<j>` (and no `scene-<i>` for line scenes); line counts must match the script. Backward compatible with v1 uploads. `src/lib/reel-audio.ts` already had the v2 types and line upload.
- `scripts/seed.ts`: also loads `content/lab/{claude,gpt}-*.json` (creator from filename prefix); `--only lab` seeds just those; `--force-audio` re-renders even if audio exists.
- Lab seeded (`npm run seed -- --only lab`): 5 reels upserted, audio rendered per line (33–47 s per reel), 5/5 verified in DB with per-line clips matching script line counts; a line mp3 URL returns 200 audio/mpeg, volumedetect mean -17.4 dB / max -1.7 dB. `npx tsc --noEmit` and `npm test` (116 tests) pass.

## UPDATE - performance + member asks (2026-10-31)
- **Perf:** `vercel.json` pins `bom1`. `next.config.ts` sets `staleTimes` (dynamic/static 300 s) so visited tabs come from the client router cache. Middleware makes one auth call; the membership role is cached in an httpOnly HMAC-signed cookie `ci_mem` (`{role, uid, exp}`, 10 min; secret = `MEMBERSHIP_COOKIE_SECRET` or a hash of the service-role key; no secret means no caching). Owners whose cached role isn't `owner` are re-checked, so bootstrap can't loop. Middleware also sets `x-ci-owner`, which the root layout reads instead of a second `getUser`. The inbox page no longer calls `requireOwner`.
- `DataProvider` fetches once per session, with stable `like`/`view` callbacks and a memoized context value. Visiting a public page resets it. It refetches silently on focus after 5 minutes, and unchanged reel rows keep their identity, so a refresh doesn't restart a playing reel.
- `loading.tsx` skeletons for `/`, `/explore`, `/profiles`, `/inbox`, `/c/[creator]`.
- Feed mounts a Player only for the active reel +-1, with same-height placeholders elsewhere; the series next-part lookup is precomputed. `Player` is memoized with stable callbacks and 30 fps `elapsed` updates. The bottom-nav backdrop blur is removed. No framer-motion layout animations existed.
- **Member asks:** `0005_member_asks.sql` applied (feedback insert for any member; trigger `feedback_before_insert` caps non-owners at 3 per rolling 24 h with an advisory lock and forces status=open and created_at=now() on non-service inserts; `messages_select_own` requires membership; `messages_insert_own_user` stays owner-only). Verified with service-role inserts on a throwaway auth user: 3 ok, the 4th rejected with "Daily question limit reached (3 per 24 hours)...", then cleaned up (user and rows deleted).
- UI: the Ask button is shown to members with "N of 3 left today". The sheet reads "Ask Claude/GPT about this reel", with "Answer in my inbox" or "Make a reel about it", and shows "Queued, usually answered within the hour" after sending. The Inbox tab is visible to members (read-only); the owner keeps the reply box.
- Checks: `npm run lint`, `npm test` (119 tests, incl. new middleware cookie tests) and `npm run build` pass. Not run: a live browser pass (the Vercel deploy is the next check).


## TTS v3 layer (tts/**, scripts/lib/tts-v3.ts)
- `tts/lexicon.json` + `applyLexicon()` (whole-word, case-sensitive; `say` overrides `text`). `renderLine({text,voice,engine,style})`, `renderStory(script,engine)`; engines `chatterbox` | `gemini` | `openai`; ffmpeg post (trim, atempo 1.12, loudnorm, mono 24k wav); cache in `tts/cache/` by content hash.
- Chatterbox: venv `tts/.venv` (python3.13), `tts/chatterbox_server.py` on :7861 (auto-started by Node), reference voices in `tts/voices/` generated from Kokoro (`tts/make-voices.ts`).
- Gemini (Interactions API, model `gemini-3.8-flash-tts`, override `GEMINI_TTS_MODEL`): Rookie Zephyr, Senior Schedar, Narrator Sulafat. OpenAI (`gpt-4o-mini-tts`, shuts down 2027-01-06): coral / ash / sage, with `instructions`. Both throw a clear error if the key is missing; neither key is in .env.local, so both are untested.
- Test: `npx tsx tts/test-tts.ts [engine...]`.

## UPDATE - categories from requests (2026-11-01)
- `0007_categories.sql` applied: `categories` table (9 seeded; members select, owner insert/update), CHECKs on `user_interests.areas` and `topic_requests.area` replaced by validation triggers, `topic_requests.category_slug`, and owner-only RPC `review_topic_request(request_id, decision 'new_category'|'existing'|'reject', slug, label, description)` returning the row (granted to authenticated only).
- `GET /api/agent/inbox` returns `category_slug` on topic_requests plus `new_categories` (request-created categories with no reels under `<slug>/`). `?peek=1` skips the agent_runs insert and the DM read-marking.
- CLI: `npm run agent -- requests` prints approved unfulfilled requests and new_categories via peek. PLAYBOOK step 0 covers new categories (Claude takes even indexes by created_at, GPT odd); the curriculum rules header has a line on adding categories.
- Verified live with a temp request: the RPC as owner created the category, the local inbox/`requests` listed it, agent_runs was unchanged, and anon was denied. Temp rows were removed. `npx tsc --noEmit` is clean.
- Test 2026-11-01: Chatterbox ok (mps, ~6.3 s render per audio-second incl. warmup; loudness mean about -16 dB, max about -1.5 dB). Gemini and OpenAI keys present but both accounts returned out-of-credits errors (402 / insufficient_quota), so neither was audio-tested. Estimates per 65s reel: OpenAI about $0.016 (about Rs 1.5); Gemini unknown (no price fetched).
- TTS round 2 (2026-11-01): OpenAI instructions made expressive (plus previous-line reaction); only leading/trailing silence trimmed; speed per engine (OpenAI 1.05, others 1.12); Gemini per-speaker style prompts plus 429 retry-after wait. OpenAI test OK (internal pauses 0.4-0.7s kept); Gemini not retested.

## About page (Claude stand-in, 2026-11-01)
- Added `src/app/about/page.tsx` (new path, stand-in for Codex while it is queued). Codex owns it from task 8 on: task 8 restyles it with the redesign, task 9 links it from the profile page and makes `/about` public in middleware.
- Also made `/about` public as a stand-in: added it next to "/privacy" in `src/middleware.ts`, `src/components/shell.tsx` and `src/components/data.tsx` (Codex-owned; one-line change each, before Codex task 8 started).
- 2026-11-01: `next.config.ts` now has `distDir: process.env.NEXT_DIST_DIR || ".next"` (a Codex-owned file; a one-line stand-in fix). The local preview runs with NEXT_DIST_DIR=.next-dev (gitignored), so agents' `npm run build` no longer breaks the dev server with ENOENT 500s.
- 2026-11-01: stand-in edit in Codex-owned src/components/reel/{playable-content.ts,video-player.tsx} and data.tsx: v3 video reels pass script.poster_url (https only) to <video poster>. Test added.
- 2026-11-01: stand-in edit in src/components/catalog.tsx + globals.css: 'My interests' / 'Review topic requests' are now settings-row buttons (owner feedback: looked like plain text).

- 2026-11-01: archive-and-remake groundwork: migration `0010_archive_reels.sql` written (NOT applied). Stand-in edit in Codex-owned `src/components/data.tsx`: the reels query now has `.is("archived_at", null)`. Also filtered in agent catalog and inbox routes; `scripts/seed.ts` upsert replaced with explicit live-row check (partial unique index cannot be an onConflict target). The reels POST needs no change (its 23505 still maps to 409). Run the migration right before deploying: the filter errors until the column exists.
- 2026-11-01: stand-in edit in src/components/reel/{timeline.ts,feed.tsx}: series order rule (seriesInOrder, withEarlierParts) + tests.

## UPDATE - stand-in frontend edit: video reel layout (2026-11-01)
Edited Codex-owned files at the owner's request (no git, no deploy): `src/app/globals.css` (replaced the "reserve gutters" `.video-reel` rules with `.video-frame` rules), `src/components/reel/video-player.tsx` (wraps content in `.video-frame`, passes `video`), `src/components/reel/overlay.tsx` (zone-positioned overlays when `video`, tap-to-expand title), new `src/components/reel/overlay-zones.ts` + `overlay-zones.test.ts` (zone to percent from `packages/shared/overlay-zones.json`). Legacy `LivePlayer` path unchanged. Not touched: `render/**`, `scripts/**`.

## UPDATE - Mobile E1 (2026-11-01)
- Stand-in: Claude does workspace tooling for `apps/mobile` and `packages/shared` as the mobile spec allows (recorded in decisions.md). Decision: streak and seen sync reuse `public.views` plus RPC `learning_streak` (migration 0012) rather than a new `reel_views` table.
- Baseline before E1 (root): vitest 35 files / 403 tests passing; `npm run lint` 0 errors, 5 warnings; `npx tsc --noEmit` clean.
- E1 done locally (uncommitted until orchestrator commits): root vitest.config.ts + secrets guard (1.1), `packages/shared` feed/types/validation/overlay-zones/streak with web re-exports (1.2-1.3), migration `0012_streak.sql` + `supabase/tests/0012_streak.sql` + `computeStreak` (1.4).
- waiting for OWNER approval: db push 0012

## UPDATE - Mobile Task 2.4 (2026-11-02)
- Claude owns `src/app/api/mobile/**`. Added `POST /api/mobile/bootstrap` (bearer Supabase token verified via `auth.getUser(token)`, then `bootstrapOwner`, then role re-read from `members`; 401 on missing/invalid token, generic 500 on failure, always `no-store`). Tests in `route.test.ts`.
- Stand-in edit in Codex-owned `src/middleware.ts`: one line lets `/api/mobile/bootstrap` through (it self-authenticates; otherwise cookie-less native calls would be redirected to /login instead of getting 401).
- waiting for OWNER approval: web deploy, then `curl -X POST .../api/mobile/bootstrap` should print 401.

## Mobile E2 scaffold (2026-11-02)
- Task 2.1 done locally (uncommitted): `apps/mobile` scaffolded with Expo SDK 58.0.22 (React 19.3.0, React Native 0.88.1, TypeScript 6.0.3, New Architecture). Own `package.json`, `package-lock.json`, `.npmrc` (`save-exact=true`); no root workspace. Entry is `expo-router/entry`; placeholder `app/_layout.tsx` and `app/index.tsx` exist only so the bundle builds: Task 2.7 must overwrite `_layout.tsx` and delete `app/index.tsx`.
- Config files: `app.config.ts`, `metro.config.js` (watchFolders `packages/shared`, `@shared` mapping, app-only nodeModulesPaths), `tsconfig.json` (`@shared/*`, `@/*`, `types: [jest, node]`), `eas.json` (development/preview/production, matching channels), `jest.config.js` (jest-expo preset, same aliases), `.env.example`, `.gitignore` (android/, ios/, .env.local, credentials/, node_modules/, .expo/ and key files).
- ALL packages for later phases are installed here and pinned exact; later tasks must not install anything (report a missing package instead). Pinned versions (dependencies, then devDependencies as listed by package.json):
  - `@bacons/apple-targets` 5.0.0
  - `@fsstudio-org/google-credential-manager` 0.1.4
  - `@react-native-google-signin/google-signin` 17.0.0
  - `@shopify/flash-list` 2.3.2
  - `@supabase/supabase-js` 2.118.0
  - `@tanstack/react-query` 5.105.1
  - `expo` 58.0.22
  - `expo-asset` 58.0.19
  - `expo-background-task` 58.0.12
  - `expo-build-properties` 58.0.12
  - `expo-clipboard` 58.0.4
  - `expo-constants` 58.0.14
  - `expo-crypto` 58.0.7
  - `expo-dev-client` 58.0.18
  - `expo-device` 58.0.5
  - `expo-font` 58.0.11
  - `expo-haptics` 58.0.7
  - `expo-image` 58.0.18
  - `expo-linking` 58.0.15
  - `expo-notifications` 58.1.7
  - `expo-router` 58.0.29
  - `expo-secure-store` 58.0.2
  - `expo-sharing` 58.0.21
  - `expo-splash-screen` 58.0.12
  - `expo-status-bar` 58.0.4
  - `expo-system-ui` 58.0.7
  - `expo-task-manager` 58.0.13
  - `expo-updates` 58.0.20
  - `expo-video` 58.0.13
  - `lucide-react-native` 1.66.0
  - `react` 19.3.0
  - `react-dom` 19.3.0
  - `react-native` 0.88.1
  - `react-native-credentials-manager` 0.9.0
  - `react-native-gesture-handler` 3.3.0
  - `react-native-reanimated` 4.7.1
  - `react-native-safe-area-context` 5.10.1
  - `react-native-screens` 4.30.1
  - `react-native-svg` 15.16.0
  - `react-native-worklets` 0.13.0
  - devDependencies:
  - `@react-native/jest-preset` 0.88.1
  - `@testing-library/react-native` 14.1.0
  - `@types/jest` 30.0.0
  - `@types/node` 24.19.2
  - `@types/react` 19.3.0
  - `jest` 30.5.2
  - `jest-expo` 58.0.13
  - `test-renderer` 1.3.1
  - `typescript` 6.0.3
- Deviations and notes: (1) `expo-apple-targets` is not an npm name; the package is `@bacons/apple-targets` 5.0.0 (its config plugin is not yet in `app.config.ts`; Task 5.x adds it). (2) `@react-native-google-signin/google-signin` 17.0.0 (free tier) has NO custom nonce support (README lists it as a paid feature; no `nonce` in its source). Per the plan fallback, also installed `react-native-credentials-manager` 0.9.0 (Android Credential Manager `googleSignIn.nonce`; iOS side only does Apple sign-in/passkeys/passwords, not Google) and `@fsstudio-org/google-credential-manager` 0.1.4 (Android Credential Manager plus iOS GoogleSignIn 9, both with a `nonce` in `configure()`; call `configure()` again with a fresh nonce per attempt; peer `react-native-svg`; its config plugin adds the iOS URL scheme and modular headers and takes `iosClientId`/`webClientId`). Task 2.5 should wrap `@fsstudio-org/google-credential-manager` as `getIdToken(nonceHash)` (one API for both platforms; it is new, 0.1.x) and may then drop the other two Google packages and the google-signin plugin in `app.config.ts`. (3) `react-dom` 19.3.0 is pinned explicitly: expo-router pulls react-dom 19.3.1, which peer-requires react ^19.3.1 and fails `npm install` against react 19.3.0. (4) `@testing-library/react-native` 14 needs `test-renderer` 1.3.1 (not react-test-renderer), and jest-expo needs `@react-native/jest-preset` 0.88.1. (5) `newArchEnabled` is no longer in the `ExpoConfig` type (New Architecture is the only mode), so `app.config.ts` casts; the value is still emitted and tested. (6) The Google iOS URL scheme falls back to `com.googleusercontent.apps.placeholder` when `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` is unset (the plugin throws on empty). (7) Template files AGENTS.md, LICENSE and `.claude/` in `apps/mobile` were deleted (AGENTS.md said routes live in `src/app/`; the plan uses `apps/mobile/app/`). (8) Expo-managed packages came from `npx expo install` (compatible with SDK 58), then `~` was stripped to exact versions.
- Checks: `npx jest src/config.test.ts` 7/7 pass (first run failed on missing `eas.json`, as the TDD step requires); `npx tsc --noEmit` clean; `npx expo-doctor` 20/20 checks passed (no JDK/CocoaPods warnings surfaced); `npx expo install --check` up to date; `npx expo export --platform android` bundled; root `npm test` 45 files / 479 tests pass, `npm run lint` 0 errors / 5 warnings (unchanged), `npm run build` ok. `npm audit` reports about 40 moderate/high advisories in transitive Expo dev tooling (not addressed).
- Not done: Step 6 (OWNER gate O3, `expo prebuild` and device run) and Step 7 (commit), per instructions. Waiting on O3 (phone, JDK).
