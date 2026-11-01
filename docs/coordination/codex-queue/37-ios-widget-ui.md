# Task 5.6: iOS widget visual design
Runbook: E5

You are Codex, running headless in /Users/vjspranav/Projects/CodeInsta, dispatched by the Claude Code orchestrator. Work autonomously. Do NOT git commit. Do NOT deploy or touch production. Never print .env.local. No emojis anywhere.

Read docs/mobile/AGENT-RULES.md first and follow it: it was written for Claude subagents but every rule applies to you (ignore its "scratchpad" wording). "Feel and sync" is the owner's top priority: UI-thread animation with Reanimated and Gesture Handler, springs and timings only from apps/mobile/src/theme/tokens.ts, no spinners (skeletons and optimistic updates), FlashList with memoized rows, expo-image, haptics, identical copy and data to the web app. Use the motion kit in apps/mobile/src/ui/motion/ (PressableScale, EnterStagger, ShakeOnError, MorphButton, screenOptions) and the shared UI in apps/mobile/src/ui/ when they exist. Never install packages. Never edit app/_layout.tsx, app/(tabs)/_layout.tsx, app/(tabs)/index.tsx or src/ui/feed/** (other agents own them); replace only the placeholder screens your brief names.
If the brief's prerequisites are not committed yet (check `git log --oneline -30` and the files), do the parts you can and say exactly what is left.

GOAL: Final SwiftUI layouts for the iOS CodeInsta widget.
READ FIRST: COORDINATION.md, decisions.md (no emojis), apps/mobile/src/theme/tokens.ts, packages/shared/src/widget-snapshot.ts, apps/mobile/targets/widget/*.swift.
MODIFY ONLY: apps/mobile/targets/widget/WidgetViews.swift (and assets inside apps/mobile/targets/widget/ if needed). Families: systemSmall (newest title up to 3 lines, creator), systemMedium (newest title, creator, category, headline row, streak), accessoryRectangular (title two lines + streak), accessoryInline (single line "N day streak: <title>" truncated). Colors from tokens (paper, ink, accent), light and dark, containerBackground API. No gradients, glows, emoji, SF Symbols are fine. Empty states: no snapshot -> "Open CodeInsta to get started"; no reels -> "Nothing new yet".
DO NOT TOUCH: Provider.swift, SnapshotReader.swift, expo-target.config.js, app.config.ts, TypeScript.
ACCEPTANCE: xcodebuild simulator build succeeds (command in the target's task); apps/mobile `npx jest src/no-emoji.test.ts` passes; SwiftUI previews for the 4 families and 2 empty states exist in WidgetViews.swift.
