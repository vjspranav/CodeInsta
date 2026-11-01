# Web motion on the shared design tokens
Runbook: E2

You are Codex, running headless in /Users/vjspranav/Projects/CodeInsta, dispatched by the Claude Code orchestrator. Work autonomously. Do NOT git commit. Do NOT deploy or touch production. Never print .env.local. No emojis.

Owner decision 2026-11-02 (docs/coordination/decisions.md, "Fluidity is the top app requirement"): web, Android and iOS share one design-token source, `packages/shared/design-tokens.json`. The apps use its motion group (durations 90/160/240/360 ms, easings standard/emphasized/decelerate, press scale 0.97). The web still uses ad hoc 120/150/180 ms and ease/ease-out/ease-in-out.

GOAL: move the web's UI transitions in src/app/globals.css (yours) onto the token scale so web and apps feel the same.
- Add CSS variables in :root: --dur-instant, --dur-fast, --dur-base, --dur-slow, --ease-standard, --ease-emphasized, --ease-decelerate, with values exactly equal to the JSON (cubic-bezier arrays become cubic-bezier()).
- Replace every UI transition/animation duration and easing (buttons, sheets, overlays, chips, hearts) with those variables, picking the closest role. Leave long decorative loops (1 s, 1.8 s pulses) as they are.
- Add a test in src/ (e.g. src/motion-tokens.test.ts) that parses globals.css and asserts each --dur-* / --ease-* equals the JSON value.
- Respect prefers-reduced-motion (durations to 0.01ms inside a reduce media query) if not already present.
ACCEPTANCE: npm test, npm run lint, npm run build pass (use NEXT_DIST_DIR=.next-codex npm run build, then delete .next-codex and revert any line it adds to tsconfig.json). Update docs/coordination/codex-status.md. Final message at most 60 words.
