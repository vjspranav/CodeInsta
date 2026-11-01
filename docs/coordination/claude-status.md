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
