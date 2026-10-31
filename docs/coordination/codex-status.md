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
