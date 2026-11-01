/**
 * Navigation transition presets for expo-router Stack/Tabs (`screenOptions` or per-screen `options`).
 * Native transitions only: they run on the platform's own animation thread, never in JS.
 *
 *   <Stack screenOptions={stackScreenOptions()} />
 *   <Stack.Screen name="ask" options={modalScreenOptions()} />
 *   <Stack.Screen name="glossary" options={sheetScreenOptions()} />
 *
 * Pass `reduced` (from `useReducedMotion()`) to get fades instead of slides.
 */
import type { Stack } from "expo-router";
import type { ComponentProps } from "react";
import { Platform } from "react-native";

export type StackScreenOptions = NonNullable<ComponentProps<typeof Stack>["screenOptions"]> extends infer T
  ? T extends (...args: never[]) => infer R
    ? R
    : T
  : never;

type OS = "ios" | "android";

function currentOS(): OS {
  return Platform.OS === "android" ? "android" : "ios";
}

type Opts = { os?: OS; reduced?: boolean };

const FADE = { animation: "fade", animationDuration: 160 } as const;

/** Push navigation: iOS native slide (default, with edge swipe back), Android iOS-style slide from the right. */
export function stackScreenOptions({ os = currentOS(), reduced = false }: Opts = {}): StackScreenOptions {
  const base = { headerShown: false, gestureEnabled: true } as const;
  if (reduced) return { ...base, ...FADE };
  return os === "ios"
    ? { ...base, animation: "default", fullScreenGestureEnabled: true }
    : { ...base, animation: "ios_from_right", animationMatchesGesture: true };
}

/** Modal presentation (ask sheet, share): slides up on iOS, fades up from the bottom on Android. */
export function modalScreenOptions({ os = currentOS(), reduced = false }: Opts = {}): StackScreenOptions {
  const base = { headerShown: false, presentation: "modal", gestureEnabled: true } as const;
  if (reduced) return { ...base, ...FADE };
  return os === "ios" ? { ...base, animation: "default" } : { ...base, animation: "fade_from_bottom" };
}

/**
 * Bottom sheet presentation (glossary, comments): iOS form sheet with grabber and detents,
 * transparent modal fading up from the bottom on Android. Content sits on the sheet spring.
 */
export function sheetScreenOptions({ os = currentOS(), reduced = false }: Opts = {}): StackScreenOptions {
  const base = { headerShown: false, gestureEnabled: true } as const;
  if (reduced) return { ...base, presentation: os === "ios" ? "formSheet" : "transparentModal", ...FADE };
  return os === "ios"
    ? {
        ...base,
        presentation: "formSheet",
        animation: "default",
        sheetGrabberVisible: true,
        sheetAllowedDetents: [0.5, 1],
        sheetCornerRadius: 24,
      }
    : { ...base, presentation: "transparentModal", animation: "fade_from_bottom" };
}

/** Auth/startup swaps (login to app): a plain crossfade. */
export function fadeScreenOptions(): StackScreenOptions {
  return { headerShown: false, gestureEnabled: false, ...FADE };
}
