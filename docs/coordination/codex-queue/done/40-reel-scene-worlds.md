# B2: scene worlds and the variety gate for reels
Runbook: B2

You are Codex, running headless in /Users/vjspranav/Projects/CodeInsta, dispatched by the Claude Code orchestrator, standing in for Claude on the Claude-owned renderer (render/**) by owner decision. Work autonomously. Do NOT git commit. Do NOT publish, deploy or touch production. Never print .env.local. No emojis anywhere (the renderer has a no.emoji gate).

Read first: docs/coordination/decisions.md (all 2026-11-01 and 2026-11-02 reel entries, especially "Reels must not look the same"), docs/reels/RULES.md, docs/reels/GENRES.md, render/src/{schema.ts,kits.ts,layout.ts,Story.tsx,timeline.ts,zones.ts,phonestate.ts,dbmodel.ts}, render/src/components/**, render/verify-lib.ts, and content/launch/instagram-feed-part1.json (the reel the owner loves: a phone world, a live DB fanout, cache hit/miss, micro-interactions).

Problem: 33 of 35 reels are a whiteboard with sketch notes and glossary cards; the owner finds them monotonous.

Build, in the renderer (schema, layout templates, components, timeline state, tests), new primary "worlds", each a full-frame, animated, data-driven scene that a script can drive beat by beat, styled through the existing 6 style themes, respecting the overlay safe zones and every existing gate check:
1. term.session: a real terminal session (prompt, typed commands, streamed output, exit codes, scrollback, cursor).
2. debugger: an IDE editor with breakpoints, a stepping highlight, a variables panel and call stack.
3. browser.network: a browser window with a devtools Network tab (requests appearing as a waterfall, status codes, timing bars, a selected request's headers).
4. incident: an incident chat channel (messages from named roles appearing in sync with the voice) next to a live metrics dashboard whose graphs spike and recover.
5. netmap: a network topology map (nodes, links, packets moving along links, partitions, leader crowns for consensus).
6. memgrid: a memory grid (pages, frames, a page table, TLB hits and misses lighting up, page faults).
7. device.boot: an Android device screen booting (boot stages, a logcat stream, a status line), for AOSP stories.
8. review: a code review / pull request view (diff hunks, inline comments, approve or request changes, a merge).
Add each as a scene "world" with do-actions in the schema (e.g. `world.set`, then per-world actions), a layout template, deterministic timeline state, and unit tests. Also give scripts a cast shaped by the story (allow 1 to 4 speakers).
Add variety checks to the QA gate (render/verify-lib.ts), with tests:
- world.primary: the reel's primary world (any of the above, or the existing phone/db worlds) is on screen for at least 50% of the runtime;
- notes.share: beats whose visuals are only sketch.note/sketch.box/define/clear make up at most a third of the runtime;
- signature: at least one signature micro-interaction (an existing or new animated state change, e.g. a request turning red, a packet dropping, a breakpoint hit, a heart turning red).
Update docs/reels/RULES.md (V-rules and Q-rules) and docs/reels/GENRES.md (which worlds suit which genre and category).
Prove it: write one new demo script per world in content/lab-v3/worlds/<world>.json (60-75 s, real facts only, short real snippets), and run `cd render && npx vitest run` plus the verify command on each demo with a local render if the voice cache allows (use `npm run agent -- publish <script> --dry-run --no-wait`; if Gemini quota is needed and unavailable, render with the existing silent/timing path the tests use and say so).
ACCEPTANCE: render vitest green; root npm test and lint green; every demo passes the full gate including the new checks; existing launch reels still pass (`--dry-run` on content/launch/*.json, voice is cached). Update docs/coordination/codex-status.md. Final message at most 120 words: worlds built, gate checks added, demo results, anything left.
