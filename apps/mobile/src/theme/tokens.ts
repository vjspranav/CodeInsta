/**
 * Mobile token layer. Every value here is derived from the one shared source,
 * packages/shared/design-tokens.json (via @shared/design-tokens), never hand-written.
 * The app is dark only, like the web. To change a value, edit the shared JSON.
 */
import { designColors, designEasing, designSpring, designTokens } from "@shared/design-tokens";
import type {
  CubicBezier,
  DesignDurationName,
  DesignEasingName,
  DesignHapticName,
  DesignSpringName,
  DesignTypeRole,
} from "@shared/design-tokens";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import type { TextStyle } from "react-native";
import { Easing } from "react-native-reanimated";
import type { WithSpringConfig, WithTimingConfig } from "react-native-reanimated";

const dark = designColors("dark");

/** Dark palette plus the plan's neutral names (paper, ink, inkMuted, accentInk, danger) as aliases. */
const color = {
  ...dark,
  paper: dark.bg,
  ink: dark.text,
  inkMuted: dark.muted,
  accentInk: dark.onAccent,
  danger: dark.errorText,
} as const;

const platform = Platform.OS === "android" ? "android" : "ios";
const font = {
  sans: designTokens.font.native.sans[platform],
  mono: designTokens.font.native.mono[platform],
} as const;

/** React Native only renders weights in steps of 100; the raw shared weight stays on `weight`. */
function rnWeight(weight: number): TextStyle["fontWeight"] {
  const step = Math.min(900, Math.max(100, Math.round(weight / 100) * 100));
  return String(step) as TextStyle["fontWeight"];
}

export type TypeStyle = {
  fontSize: number;
  /** px (shared unitless multiplier times size) */
  lineHeight: number;
  /** shared weight as authored */
  weight: number;
  /** nearest weight React Native can render */
  fontWeight: TextStyle["fontWeight"];
  letterSpacing: number;
  fontFamily: string;
};

const type = Object.fromEntries(
  (Object.entries(designTokens.type) as [DesignTypeRole, (typeof designTokens.type)[DesignTypeRole]][]).map(
    ([role, t]) => [
      role,
      {
        fontSize: t.size,
        lineHeight: t.size * t.lineHeight,
        weight: t.weight,
        fontWeight: rnWeight(t.weight),
        letterSpacing: t.letterSpacing,
        fontFamily: role === "mono" ? font.mono : font.sans,
      } satisfies TypeStyle,
    ],
  ),
) as Record<DesignTypeRole, TypeStyle>;

export const tokens = {
  color,
  space: designTokens.space,
  radius: designTokens.radius,
  layout: designTokens.layout,
  font,
  type,
  shadow: designTokens.shadow,
  z: designTokens.z,
  press: designTokens.motion.press,
  motion: designTokens.motion,
} as const;

// ---- Motion: UI-thread configs for Reanimated (withSpring / withTiming) ----

const springNames = Object.keys(designTokens.motion.spring) as DesignSpringName[];
const durationNames = Object.keys(designTokens.motion.duration) as DesignDurationName[];
const easingNames = Object.keys(designTokens.motion.easing) as DesignEasingName[];

/** `withSpring(value, springs.snappy)`. snappy, feed, sheet, like. */
export const springs = Object.fromEntries(
  springNames.map((name) => [name, designSpring(name) satisfies WithSpringConfig]),
) as Record<DesignSpringName, WithSpringConfig>;

/** Raw millisecond durations from the tokens. */
export const durations = designTokens.motion.duration;

/** Reanimated easing functions built from the token bezier arrays. */
export const easings = Object.fromEntries(
  easingNames.map((name) => {
    const [x1, y1, x2, y2] = designEasing(name) as CubicBezier;
    return [name, Easing.bezier(x1, y1, x2, y2)];
  }),
) as Record<DesignEasingName, ReturnType<typeof Easing.bezier>>;

/** `withTiming(value, timings.fast)`. Duration from the tokens, standard easing. */
export const timings = Object.fromEntries(
  durationNames.map((name) => [
    name,
    { duration: durations[name], easing: easings.standard } satisfies WithTimingConfig,
  ]),
) as Record<DesignDurationName, WithTimingConfig>;

/** Build a timing config from any token duration and easing: `timing("base", "emphasized")`. */
export function timing(duration: DesignDurationName, easing: DesignEasingName = "standard"): WithTimingConfig {
  return { duration: durations[duration], easing: easings[easing] };
}

// ---- Haptics, per the token haptic map ----

const hapticMap = designTokens.motion.haptic;
const impactStyle = {
  impactLight: Haptics.ImpactFeedbackStyle.Light,
  impactMedium: Haptics.ImpactFeedbackStyle.Medium,
  impactHeavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

/** Fire-and-forget haptic: like, dislike, longPress, refresh. Never throws, never blocks. */
export function haptic(name: DesignHapticName): void {
  const kind = hapticMap[name];
  try {
    const run =
      kind === "selection"
        ? Haptics.selectionAsync()
        : Haptics.impactAsync(impactStyle[kind as keyof typeof impactStyle]);
    run.catch(() => {});
  } catch {
    // no haptics engine: ignore
  }
}

// ---- Contrast (WCAG 2.x relative luminance) ----

function channels(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque hex colors (alpha, if present, is ignored). */
export function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
