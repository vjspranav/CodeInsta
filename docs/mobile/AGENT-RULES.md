# Rules for every CodeInsta mobile subagent (read fully before working)

You are a subagent of the CodeInsta orchestrator (Claude Code), working in /Users/vjspranav/Projects/CodeInsta. Other subagents work in the same checkout at the same time on other files, so stay strictly inside the files your task names.

- Source of truth: `docs/superpowers/plans/2026-11-01-mobile-apps.md`. Read its header ("Global Constraints", "Conventions", "Review Focus", "File Structure") and then your task section(s) in full, and follow every step, including the TDD steps (write the failing test, see it fail, implement, see it pass). The spec is `docs/superpowers/specs/2026-11-01-mobile-apps-design.md`.
- Owner decision 2026-11-02 (docs/coordination/decisions.md): Claude subagents stand in for the plan's [codex] mobile UI tasks. If your task is marked [codex], implement its brief yourself, within its MODIFY ONLY / DO NOT TOUCH lists.
- **Do NOT git commit, push, switch branches, stash, or reset.** The orchestrator reviews and commits. Never run `git add -A`, `git checkout -- .`, or anything that touches other agents' changes.
- Do NOT touch production: no `supabase db push`, no `vercel`, no publishing, no sending pushes. Never `supabase config push`. Never print `.env.local` or any secret; read env only via `set -a; . ./.env.local; set +a` when a command needs it.
- Never edit the root `package.json` / `package-lock.json`. `apps/mobile` has its own `package.json`; only the scaffold task installs packages. If you need a package that is missing, do not install it: report it.
- No emojis anywhere (code, copy, comments, native strings, tests' expected UI text). Lucide icons only.
- Pin exact versions (no ^ ~ latest).
- Web must stay green when you touch root files: `npm test`, `npm run lint`, `npm run build` (use `NEXT_DIST_DIR=.next-agent-$RANDOM npm run build` so you do not clobber another agent's build dir, and delete that dir after).
- Mobile checks: `cd apps/mobile && npx jest <paths>` and `npx tsc --noEmit`.
- Progress checkpoints for the owner's dashboard: after each milestone run `scripts/activity/log.sh claude progress <TASK> "<what you finished; what is next>"` where <TASK> is like `E2/2.1`. When done: `scripts/activity/log.sh claude done <TASK> "<one-line result>"`. If stuck: `scripts/activity/log.sh claude blocked <TASK> "<why>"`.
- Device/emulator steps marked OWNER gate: skip them (no phone is connected and no JDK is installed yet); say so in your report.
- If a step in the plan is wrong for the actual installed versions, adapt sensibly, keep the interfaces the plan names (later tasks depend on them), and note the deviation in your report.
- Final report (your last message), at most 200 words: files created/changed, test and typecheck results (numbers), deviations from the plan, anything blocked.

## Feel and sync (owner's top priority, decisions.md 2026-11-02 "Fluidity is the top app requirement")
- The app must feel significantly smoother than the web app. Every animation and gesture runs on the UI thread: react-native-reanimated worklets (useSharedValue, useAnimatedStyle, withSpring/withTiming) and react-native-gesture-handler. Never the legacy `Animated` API, never setState per frame, never layout animations that reflow the feed.
- Springs and durations come only from the shared motion tokens (`packages/shared/design-tokens.json` via `apps/mobile/src/theme/tokens.ts`). Target 120 Hz (the Flip 8 panel); nothing allocates or re-renders on scroll.
- No spinners between reels or screens: poster frames under video, skeletons for lists, optimistic updates with rollback. Images through expo-image with caching and a placeholder. Lists through FlashList with stable keys and memoized rows.
- Haptics (expo-haptics) on like, dislike, long-press and pull-to-refresh.
- Same experience as web: same tokens (color, type, spacing, radii), same copy, same icons (lucide), same feed and series order (packages/shared), same overlay zones. If you need a token that does not exist, add it to the shared JSON, never hard-code a value.
- Builds: `next build` appends its dist dir to tsconfig.json "include". After any `NEXT_DIST_DIR=.next-agent-*` build, remove the added `.next-agent-*` line from tsconfig.json (leave every other line as it was).

## Parallel wave notes (wave 2 onward)
- apps/mobile exists (Expo SDK 58.0.22, RN 0.88.1, TypeScript 6). Every package is installed and pinned; do NOT run npm install/uninstall or `expo install`. If something is truly missing, report it.
- Other agents are writing other files in apps/mobile at the same time. `npx tsc --noEmit` may show errors in files you did not touch: fix only errors in your own files and mention the others. Run jest only on your own test files.
- If your code imports a module another task in this wave creates (for example `@/lib/supabase` from Task 2.3, `@/theme/tokens` from Task 2.2), code against the exact interface the plan gives for it. If the file does not exist yet when you finish, mock it in your tests and say so.
- Do not run `expo prebuild`, `expo run:*` or gradle; the orchestrator builds to the phone. Do not edit apps/mobile/app.config.ts unless your task names it; if it does, change only your plugin entry.
- Sign-in decision (decisions.md 2026-11-02 "Mobile Google sign-in"): Android uses `react-native-credentials-manager` (`signIn(['google-signin'], { googleSignIn: { serverClientId: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, nonce: sha256hex(raw), autoSelectEnabled: true, filterByAuthorizedAccounts: false } })`, then Supabase `signInWithIdToken({ provider: 'google', token, nonce: raw })`). iOS uses Supabase PKCE browser sign-in: `signInWithOAuth({ provider: 'google', options: { redirectTo: 'codeinsta://auth/callback', skipBrowserRedirect: true } })`, `WebBrowser.openAuthSessionAsync(url, 'codeinsta://auth/callback')`, then `exchangeCodeForSession(code)`. `@react-native-google-signin/google-signin` and the fsstudio package are removed.
