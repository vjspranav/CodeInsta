import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { durations, easings } from "@/theme/tokens";
import { useReducedMotion } from "./reducedMotion";

export const SHAKE_DISTANCE = 6;
export const SHAKE_OSCILLATIONS = 3;
/** One half swing. `fast` is the duration of a full left-right oscillation pair per the tokens. */
const HALF_MS = durations.fast / 2;

export type ShakeKey = string | number | boolean | null | undefined;

/** Shake only when the key changed to a meaningful value (an error appearing or changing, not clearing). */
export function shouldShake(prev: ShakeKey, next: ShakeKey): boolean {
  if (Object.is(prev, next)) return false;
  return next !== null && next !== undefined && next !== "" && next !== false && next !== 0;
}

/** The offsets one shake visits, in px: +6, -6, ... for three oscillations, then rest. */
export function shakeOffsets(
  distance: number = SHAKE_DISTANCE,
  oscillations: number = SHAKE_OSCILLATIONS,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < oscillations; i++) out.push(distance, -distance);
  out.push(0);
  return out;
}

export type ShakeOnErrorProps = {
  /** Changing this value (to a non-empty one) triggers one shake: pass the error text or a counter. */
  trigger?: ShakeKey;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Gentle horizontal shake: three oscillations of 6 px on the fast timing. Not played on mount.
 * Reduce Motion: a single opacity pulse instead of movement.
 */
export function ShakeOnError({ trigger, children, style, testID }: ShakeOnErrorProps) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const pulse = useSharedValue(1);
  const previous = useRef(trigger);

  useEffect(() => {
    const prev = previous.current;
    previous.current = trigger;
    if (!shouldShake(prev, trigger)) return;
    if (reduced) {
      pulse.value = withSequence(
        withTiming(0.5, { duration: HALF_MS, easing: easings.standard }),
        withTiming(1, { duration: HALF_MS, easing: easings.standard }),
      );
      return;
    }
    const steps = shakeOffsets().map((to, i, all) =>
      withTiming(to, { duration: i === all.length - 1 ? HALF_MS / 2 : HALF_MS, easing: easings.standard }),
    );
    x.value = withSequence(...steps);
  }, [trigger, reduced, x, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ translateX: x.value }],
  }));

  return (
    <Animated.View testID={testID} style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
