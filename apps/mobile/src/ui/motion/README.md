# Motion kit

Reusable micro-animations for startup, sign-in and navigation (decisions.md 2026-11-02). Everything
runs on the UI thread (Reanimated worklets, Gesture Handler), takes its springs, timings, durations,
easings and haptics from `@/theme/tokens`, and falls back to a short fade when the system Reduce
Motion setting is on. Screens import from here; nothing in this folder creates a screen.

| Piece | File | Use it for |
| --- | --- | --- |
| `useReducedMotion`, `motionFor(reduced, full, fallback)` | `reducedMotion.ts` | Any new animation: pick the full config or the reduced one. |
| `PressableScale` | `PressableScale.tsx` | Every tappable card, row, chip, icon button. Scales to `tokens.press.scale` on the snappy spring, springs back, optional `haptic` (token name). Role, label, hint, state and testID pass through; screen readers can activate it. Reduce Motion: opacity dip. |
| `EnterStagger` | `EnterStagger.tsx` | Sign-in content, first load of lists or sections. Children rise 12 px and fade in on the sheet spring, `durations.instant` apart, first six only, first mount only (re-renders and appended children never replay). Do not wrap FlashList rows or the feed. |
| `ShakeOnError` | `ShakeOnError.tsx` | Wrap an input or form. Change `trigger` (error text or a counter) to shake once: 3 oscillations of 6 px on the fast timing. Clearing the error or mounting does not shake. |
| `MorphButton` | `MorphButton.tsx` | The sign-in button. Fixed size. `busy` crossfades the label to three pulsing dots, `success` crossfades to a drawn check, then calls `onDone` once. No spinner, no layout shift. |
| `AnimatedLogo` | `AnimatedLogo.tsx` | The CodeInsta mark (the app icon tile and code-slash glyph, accent on paper) drawn with react-native-svg: stroke draw, fill, glyph, small settle spring, wordmark. Also usable on login (`instant` skips the draw). |
| `StartupGate` | `StartupGate.tsx` | Root layout wrapper. Keeps the native splash (`preventAutoHideAsync`) until the logo's first layout, hides it, plays the logo, then crossfades to children once `ready` is true. Never holds longer than 1200 ms after the first layout (`startupTiming.ts`). If the logo never lays out, it reveals the app at the cap anyway. |
| `MotionTabBar`, `TabIndicator`, `useTabIndicator`, `TabIconPop`, `tabSelectHaptic` | `tabBar.tsx` | The bottom tabs. Indicator slides on the feed spring, the active icon pops 1 to 1.12 to 1 on the like spring, selection haptic when the selected tab changes. Plug into expo-router with `<Tabs tabBar={(p) => <Adapter {...p} />} />` where the adapter maps `state.index`, `state.routes` and `navigation.navigate` onto `MotionTabBar`'s `tabs`, `activeIndex`, `onSelect`. |
| `stackScreenOptions`, `modalScreenOptions`, `sheetScreenOptions`, `fadeScreenOptions` | `screenOptions.ts` | Native stack transitions: iOS default slide with swipe back, Android `ios_from_right` (push) and `fade_from_bottom` (modal and sheet), form sheet with grabber on iOS. Pass `{ reduced: useReducedMotion() }` for fades. |

## Startup wiring (for the shell task)

```tsx
// StartupGate holds the native splash itself; the root layout only wraps its content.
<StartupGate ready={auth.status !== "loading" && firstPosterReady}>
  <Slot />
</StartupGate>
```

The native splash background is the paper token (`app.config.ts`, expo-splash-screen plugin entry,
no image), so the handoff to the in-app logo has no visible seam. On Android 12+ the system splash
may still draw the launcher icon on that background: add a fully transparent `image` to the plugin
entry if that shows up on device.

## Testing

`testSetup.tsx` holds the Gesture Handler jest mocks and `renderMotion` (wraps in
`GestureHandlerRootView`, keeps the wrapper on `rerender`). Import it first in a test file. Use
`await act(async () => jest.advanceTimersByTime(ms))` with fake timers, and read live animated styles
from the element's `jestAnimatedStyle.value`. Pure logic lives in `stagger.ts` and `startupTiming.ts`.
