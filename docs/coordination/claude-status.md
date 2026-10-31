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
