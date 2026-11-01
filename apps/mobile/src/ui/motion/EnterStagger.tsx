import type { ReactNode } from "react";
import { Children, useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { springs, timings } from "@/theme/tokens";
import { useReducedMotion } from "./reducedMotion";
import { shouldStagger, STAGGER_OFFSET_Y, staggerDelay } from "./stagger";

export type EnterStaggerProps = {
  children?: ReactNode;
  /** Style of each wrapper (default: none). Use it for gaps through the parent instead when possible. */
  itemStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

function StaggerItem({
  index,
  animate,
  style,
  children,
}: {
  index: number;
  animate: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  // Start hidden only when this item will animate; the decision was made at the first mount.
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    progress.value = reduced
      ? withTiming(1, timings.fast)
      : withDelay(staggerDelay(index), withSpring(1, springs.sheet));
    // first mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return reduced
      ? { opacity: p }
      : { opacity: Math.min(1, Math.max(0, p)), transform: [{ translateY: (1 - p) * STAGGER_OFFSET_Y }] };
  });

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * Enters each child with translateY 12 -> 0 plus opacity on the sheet spring, `durations.instant`
 * apart, for the first six children. Plays on first mount only: children added by a later render
 * appear without animation, and re-renders never replay it. Reduce Motion: a plain short fade, all
 * together.
 */
export function EnterStagger({ children, itemStyle, testID }: EnterStaggerProps) {
  const items = Children.toArray(children);
  const initialCount = useRef(items.length).current;

  return (
    <>
      {items.map((child, index) => (
        <StaggerItem
          key={(child as { key?: string | number }).key ?? index}
          index={index}
          animate={shouldStagger(index, initialCount)}
          style={itemStyle}
        >
          {child}
        </StaggerItem>
      ))}
    </>
  );
}
