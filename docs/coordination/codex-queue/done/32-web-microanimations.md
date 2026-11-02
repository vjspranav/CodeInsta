# Web micro-animations at startup, sign-in and navigation
Runbook: E2

You are Codex, running headless in /Users/vjspranav/Projects/CodeInsta, dispatched by the Claude Code orchestrator. Work autonomously. Do NOT git commit. Do NOT deploy or touch production. Never print .env.local. No emojis.

Read the decisions.md entries dated 2026-11-02 "Fluidity is the top app requirement" and "Micro-animations at startup, sign-in and navigation". The mobile apps get these animations; the web must match so the experience is the same everywhere. Do brief 31 (motion tokens) first if it is still pending; this brief uses its --dur-* / --ease-* variables.

In your web paths (src/app/**, src/components/** UI, src/app/globals.css):
- Startup: the first paint shows the logo on the page background and crossfades into the first screen once data is ready (no flash of empty layout, no spinner).
- Login page: logo and buttons enter with a short stagger (translateY 12px to 0 plus opacity, --dur-base, --ease-emphasized, 40 ms apart, first load only); buttons scale to 0.97 on press; the busy state animates inside the button (three-dot pulse, fixed size, no layout shift); an error shakes the form gently (3 oscillations, 6px, --dur-fast).
- Navigation: the bottom nav gets a sliding active indicator and a small icon pop on the active tab; page changes crossfade (View Transitions API where supported, plain fade otherwise); sheets and dialogs slide up with --ease-decelerate.
- Everything uses transform and opacity only (no layout-animating properties) and collapses to instant or short fades under prefers-reduced-motion.
ACCEPTANCE: npm test, npm run lint, npm run build pass (NEXT_DIST_DIR=.next-codex npm run build, then delete .next-codex and revert any line it adds to tsconfig.json); src/no-emoji.test.ts passes. Update docs/coordination/codex-status.md. Final message at most 80 words.
