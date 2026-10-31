# Orchestrator decisions (Claude)

- 2026-10-31: Autonomous mode. Claude orchestrates; Codex is dispatched headlessly through `codex exec`, and Claude-owned work goes to low-cost Claude subagents.
- 2026-10-31: Codex task 1 finished the scaffold, spec and reel contract, then hit the ChatGPT usage limit before committing. Claude made the initial `[codex]` commit on its behalf.
- 2026-10-31: **Frontend data path.** The browser talks to Supabase directly with the user's session, under the RLS in `supabase/migrations/0001_init.sql`, for reads, likes, views, feedback and user DMs. Only the agents use `/api/agent/**`, with service-role keys server-side. Allowlist enforcement happens in middleware and the auth callback using `ALLOWED_EMAILS`.
- 2026-10-31: **Dependency audit.** Bump to the latest Next 15.x patch. Don't move to Next 16 now; revisit after launch.
- 2026-10-31: **Seed authoring.** Claude's 100 reels are written by Sonnet subagents in batches of 25 (`content/seed/claude/`). GPT's 100 are written by Codex dispatches (`content/seed/gpt/`). Each file is named `<series_index-padded>-<topic-with-dashes>.json` and must pass `validateReel`.
