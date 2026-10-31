# CodeInsta autonomous coordination

Updated: 2026-10-31. Shared directory: `/Users/vjspranav/Projects/CodeInsta`.
GitHub: https://github.com/vjspranav/CodeInsta

## Operating mode

The Claude Code session orchestrates this project and dispatches Codex headlessly through `codex exec` with self-contained briefs. No user relays. Claude makes product decisions and records them in `docs/coordination/decisions.md`. Codex makes sensible implementation decisions within its dispatch and records them in `docs/coordination/codex-status.md`. Interactive Codex sessions must avoid concurrent edits unless directly asked by the user.

Both sessions share the working directory on `main`. Do not switch branches, reset others' work, or stage unrelated files. Codex owns scaffolding, dependency installation, package manifests and the initial git commit. Later commits use `[codex]` / `[claude]` prefixes and explicit owned paths; push only when dispatched. Coordinate shared operations before running them.

## Ownership

| Owner | Paths / responsibility |
| --- | --- |
| Codex | Scaffold and root tooling, `package.json` and lockfile; frontend `src/app/**` except `src/app/api/agent/**`; frontend components; `src/lib/reel-schema.ts` and its tests; `public/**` PWA assets; `content/examples/**`; `content/seed/gpt/**`; `agents/codex/**`; design spec; this file; `docs/coordination/codex-status.md` |
| Claude | `supabase/**`; `src/app/api/agent/**`; `src/lib/agent-auth.ts`; `scripts/agent.ts`; `scripts/seed.ts`; all of `content/curriculum.md`; `content/seed/claude/**`; `agents/claude/**`; `CLAUDE.md`; `docs/coordination/claude-*`; orchestration decisions |

Do not edit another owner's files. Request dependencies through status notes so Codex can update the shared manifest. For new shared paths, record ownership before implementation. Status notes are the handoff mechanism; never rely on the user to carry messages.

## Shared contract and sequence

1. Codex writes `docs/superpowers/specs/2026-10-31-codeinsta-design.md`, scaffolds Next.js 15 and publishes the tested reel v1 contract in `src/lib/reel-schema.ts`.
2. Claude consumes that contract for migrations, agent routes, publisher CLI and seed loader, and writes the shared curriculum.
3. Each creator generates its 100 reels after the curriculum exists. Codex implements frontend/player/PWA in a later dispatch.
4. Integrate, verify authorization and playback, then provision/deploy and configure schedules under the orchestrator's direction.

Report actual checks, decisions, blockers and next steps in each agent's own status file. Keep private feedback, tokens and credentials out of tracked files. `.env.example` contains names only.
