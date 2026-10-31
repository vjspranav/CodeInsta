# Codex status

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
