# Task 1.5: web streak chip
Runbook: E1

You are Codex, running headless in /Users/vjspranav/Projects/CodeInsta, dispatched by the Claude Code orchestrator. Work autonomously. Do NOT git commit. Do NOT deploy or touch production (no supabase db push, no vercel). Never print .env.local.

Migration 0012 (`public.learning_streak(tz text)`, authenticated only) is applied in production as of 2026-11-02.

GOAL: Show the learning streak on the web profile area using the existing RPC.
READ FIRST: COORDINATION.md, docs/coordination/decisions.md (no emojis rule), src/components/data.tsx, src/app/profiles/page.tsx, packages/shared/src/streak.ts.
MODIFY ONLY: src/components/data.tsx (add `streak: number` to context, loaded with `browserDb().rpc("learning_streak", { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })`, best-effort: a failed call yields 0 and never blocks the feed), src/app/profiles/page.tsx (a small "N day streak" line with a lucide icon, hidden when 0), src/app/globals.css (styles).
DO NOT TOUCH: supabase/**, packages/shared/**, src/app/api/**, any other page.
ACCEPTANCE: add src/components/streak-label.test.ts (pure helper `streakLabel(n)`: 0 returns "", 1 returns "1 day streak", 5 returns "5 day streak"); npm test, npm run lint, npm run build all pass; src/no-emoji.test.ts passes.
Update docs/coordination/codex-status.md. Final message: at most 60 words, what changed and the test results.
