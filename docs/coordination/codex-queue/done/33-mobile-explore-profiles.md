# Task 4.4: Explore, profiles, creator pages
Runbook: E4

You are Codex, running headless in /Users/vjspranav/Projects/CodeInsta, dispatched by the Claude Code orchestrator. Work autonomously. Do NOT git commit. Do NOT deploy or touch production. Never print .env.local. No emojis anywhere.

Read docs/mobile/AGENT-RULES.md first and follow it: it was written for Claude subagents but every rule applies to you (ignore its "scratchpad" wording). "Feel and sync" is the owner's top priority: UI-thread animation with Reanimated and Gesture Handler, springs and timings only from apps/mobile/src/theme/tokens.ts, no spinners (skeletons and optimistic updates), FlashList with memoized rows, expo-image, haptics, identical copy and data to the web app. Use the motion kit in apps/mobile/src/ui/motion/ (PressableScale, EnterStagger, ShakeOnError, MorphButton, screenOptions) and the shared UI in apps/mobile/src/ui/ when they exist. Never install packages. Never edit app/_layout.tsx, app/(tabs)/_layout.tsx, app/(tabs)/index.tsx or src/ui/feed/** (other agents own them); replace only the placeholder screens your brief names.
If the brief's prerequisites are not committed yet (check `git log --oneline -30` and the files), do the parts you can and say exactly what is left.

GOAL: Explore and Profiles tabs plus creator pages.
READ FIRST: COORDINATION.md, decisions.md, apps/mobile/src/data/{explore,profiles,library}.ts, src/app/explore/*, src/app/profiles/page.tsx, src/app/c/[creator]/page.tsx, src/components/catalog.tsx, apps/mobile/src/testids.ts.
CREATE: apps/mobile/app/(tabs)/explore.tsx (search field, category sections as horizontal rails of reel tiles with poster, title, creator), apps/mobile/app/(tabs)/profiles.tsx (creator list, streak chip TID["streak-chip"] from useFeedSession().streak hidden when 0), apps/mobile/app/c/[creator].tsx (bio, reel grid in series order from creatorReels), apps/mobile/src/ui/{ReelTile,CreatorRow,SectionHeader}.tsx and tests. Tapping a tile opens apps/mobile/app/reel/[id].tsx.
DO NOT TOUCH: src/data/**, src/feed/**, other screens, packages/**.
ACCEPTANCE: search filters tiles; empty search state; grid shows Part 1 before Part 2; tiles use expo-image with the poster; no emoji; tokens only.
VERIFY: cd apps/mobile && npx jest && npx tsc --noEmit
