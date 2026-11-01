import { useCallback, useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Path } from "react-native-svg";
import { durations, timing, timings, tokens } from "@/theme/tokens";
import { PressableScale } from "./PressableScale";
import { useReducedMotion } from "./reducedMotion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CHECK_PATH = "M5 12.5 L9.5 17 L19 7.5";
const CHECK_LENGTH = 24; // slightly above the real length (~20) so the dash fully hides it at rest
const DOT_SIZE = 6;
const DOT_COUNT = 3;

export type MorphButtonProps = {
  label: string;
  /** Show the pulsing dots in place of the label (request in flight). */
  busy?: boolean;
  /** Draw the check mark, then call `onDone`. */
  success?: boolean;
  onPress?: () => void;
  /** Called once, after the check mark finished drawing. */
  onDone?: () => void;
  disabled?: boolean;
  /** Fixed height (default: the control height token). Width follows the parent and never changes. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

function PulseDot({ index, busy, reduced }: { index: number; busy: boolean; reduced: boolean }) {
  const level = useSharedValue(0.3);

  useEffect(() => {
    cancelAnimation(level);
    if (!busy) {
      level.value = withTiming(0.3, timings.fast);
      return;
    }
    if (reduced) {
      // no movement: a steady half-lit dot
      level.value = withTiming(0.7, timings.fast);
      return;
    }
    level.value = withDelay(
      index * durations.instant,
      withRepeat(
        withSequence(withTiming(1, timing("base", "emphasized")), withTiming(0.3, timing("base", "emphasized"))),
        -1,
      ),
    );
  }, [busy, reduced, index, level]);

  const style = useAnimatedStyle(() => ({
    opacity: level.value,
    transform: [{ scale: 0.7 + 0.3 * level.value }],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

/**
 * The sign-in button. One fixed-size box whose content crossfades: label -> three pulsing dots
 * (busy) -> a drawn check mark (success), then `onDone`. No spinner, no size change.
 * Reduce Motion: the same crossfades, but the dots do not pulse and the check fades in whole.
 */
export function MorphButton({
  label,
  busy = false,
  success = false,
  onPress,
  onDone,
  disabled = false,
  height = tokens.layout.controlHeight,
  style,
  testID,
  accessibilityLabel,
}: MorphButtonProps) {
  const reduced = useReducedMotion();
  const busyP = useSharedValue(0);
  const successP = useSharedValue(0);
  const draw = useSharedValue(CHECK_LENGTH);
  const doneCalled = useRef(false);

  const finish = useCallback(() => {
    if (doneCalled.current) return;
    doneCalled.current = true;
    onDone?.();
  }, [onDone]);

  useEffect(() => {
    busyP.value = withTiming(busy ? 1 : 0, timings.fast);
  }, [busy, busyP]);

  useEffect(() => {
    if (!success) {
      doneCalled.current = false;
      successP.value = withTiming(0, timings.fast);
      draw.value = CHECK_LENGTH;
      return;
    }
    if (reduced) {
      draw.value = 0;
      // the check fades in whole; report done once the fade finished
      successP.value = withTiming(1, timings.fast, (finished) => {
        "worklet";
        if (finished) scheduleOnRN(finish);
      });
      return;
    }
    successP.value = withTiming(1, timings.fast);
    draw.value = withTiming(0, timing("base", "emphasized"), (finished) => {
      "worklet";
      if (finished) scheduleOnRN(finish);
    });
  }, [success, reduced, successP, draw, finish]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(busyP.value, successP.value),
  }));
  const dotsStyle = useAnimatedStyle(() => ({
    opacity: busyP.value * (1 - successP.value),
  }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: successP.value }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: draw.value }));

  const locked = disabled || busy || success;

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={locked}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy, disabled: locked }}
      style={[styles.button, { height }, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, labelStyle]} pointerEvents="none">
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, dotsStyle]} pointerEvents="none">
        <View style={styles.dots}>
          {Array.from({ length: DOT_COUNT }, (_, i) => (
            <PulseDot key={i} index={i} busy={busy && !success} reduced={reduced} />
          ))}
        </View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, checkStyle]} pointerEvents="none">
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <AnimatedPath
            d={CHECK_PATH}
            fill="none"
            stroke={tokens.color.accentInk}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={CHECK_LENGTH}
            animatedProps={checkProps}
          />
        </Svg>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    overflow: "hidden",
    minHeight: tokens.layout.minTouch,
  },
  center: { alignItems: "center", justifyContent: "center" },
  label: {
    color: tokens.color.accentInk,
    fontFamily: tokens.type.body.fontFamily,
    fontSize: tokens.type.body.fontSize,
    fontWeight: "600",
    letterSpacing: tokens.type.body.letterSpacing,
  },
  dots: { flexDirection: "row", gap: tokens.space[2], alignItems: "center" },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: tokens.color.accentInk,
  },
});
