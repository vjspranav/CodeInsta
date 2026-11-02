# Task 4.5: Inbox screens
Runbook: E4

You are Codex, running headless in /Users/vjspranav/Projects/CodeInsta, dispatched by the Claude Code orchestrator. Work autonomously. Do NOT git commit. Do NOT deploy or touch production. Never print .env.local. No emojis anywhere.

Read docs/mobile/AGENT-RULES.md first and follow it: it was written for Claude subagents but every rule applies to you (ignore its "scratchpad" wording). "Feel and sync" is the owner's top priority: UI-thread animation with Reanimated and Gesture Handler, springs and timings only from apps/mobile/src/theme/tokens.ts, no spinners (skeletons and optimistic updates), FlashList with memoized rows, expo-image, haptics, identical copy and data to the web app. Use the motion kit in apps/mobile/src/ui/motion/ (PressableScale, EnterStagger, ShakeOnError, MorphButton, screenOptions) and the shared UI in apps/mobile/src/ui/ when they exist. Never install packages. Never edit app/_layout.tsx, app/(tabs)/_layout.tsx, app/(tabs)/index.tsx or src/ui/feed/** (other agents own them); replace only the placeholder screens your brief names.
If the brief's prerequisites are not committed yet (check `git log --oneline -30` and the files), do the parts you can and say exactly what is left.

GOAL: Inbox tab with creator threads and DM composer.
READ FIRST: COORDINATION.md, decisions.md, apps/mobile/src/data/inbox.ts, src/app/inbox/page.tsx, src/components/inbox.tsx, apps/mobile/src/testids.ts.
CREATE: apps/mobile/app/(tabs)/inbox.tsx (thread list with unread dots, TID[`inbox-thread-${creatorId}`]), apps/mobile/app/inbox/[creator].tsx (message bubbles, composer TID["dm-input"] and TID["dm-send"], marks the thread read on open via markThreadRead), apps/mobile/src/ui/{ThreadRow,MessageBubble,Composer}.tsx and tests; show an unread badge on the Inbox tab icon (edit apps/mobile/app/(tabs)/_layout.tsx only to add the badge).
DO NOT TOUCH: src/data/**, packages/**.
ACCEPTANCE: unread rows show a dot, opening clears it (markThreadRead called once); send disabled for empty/whitespace; failed send keeps the text and shows the error; keyboard avoids the composer; no emoji.
VERIFY: cd apps/mobile && npx jest && npx tsc --noEmit
