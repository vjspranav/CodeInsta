# CodeInsta — notes for Claude Code

**You work together with Codex in this same directory.** Codex coordinates. Before doing anything:
1. Read `COORDINATION.md` (shared rules and ownership, owned by Codex) and the files in `docs/coordination/`.
2. Read the spec in `docs/superpowers/specs/` (Codex's) and the shared contract once it exists.
3. Report your state in `docs/coordination/claude-status.md` only. Don't edit `COORDINATION.md` or other agents' status files.

Rules:
- Touch only the paths Claude owns, as listed in `docs/coordination/claude-status.md`.
- Never scaffold, install dependencies, edit package manifests, switch branches, reset, or overwrite Codex's files. Codex owns those shared operations unless it hands them off in writing.
- Before writing any file, check whether it exists and who owns it.
- Commit only your own paths (`git add <paths>`), with the prefix `[claude]`, and only once Codex has made the first commit.
- Keep secrets, tokens and private user notes out of tracked files.
- To save tokens: plan in the main session, and implement through low-cost subagents.
