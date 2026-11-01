import type { DesignHapticName } from "@shared/design-tokens";
import type { ReactNode } from "react";
import { useCallback } from "react";
import type { AccessibilityRole, AccessibilityState, StyleProp, ViewStyle } from "react-native";
import { GestureDetector, useTapGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { haptic, springs, tokens, timings } from "@/theme/tokens";
import { useReducedMotion } from "./reducedMotion";

export type PressableScaleProps = {
  children?: ReactNode;
  onPress?: () => void;
  /** Haptic fired on a successful tap (token name: like, dislike, longPress, refresh). */
  haptic?: DesignHapticName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
};

/**
 * Tap target that scales to `tokens.press.scale` on the snappy spring while held and springs back on
 * release. Runs on the UI thread through Gesture Handler. With Reduce Motion it dips opacity instead.
 */
export function PressableScale({
  children,
  onPress,
  haptic: hapticName,
  disabled = false,
  style,
  testID,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);

  const fire = useCallback(() => {
    if (hapticName) haptic(hapticName);
    onPress?.();
  }, [hapticName, onPress]);

  const tap = useTapGesture({
    enabled: !disabled,
    testID,
    // Cancels on a long drag away like a native button; a tap needs no minimum duration.
    maxDistance: 24,
    onBegin: () => {
      "worklet";
      pressed.value = reduced
        ? withTiming(1, timings.instant)
        : withSpring(1, springs.snappy);
    },
    onActivate: () => {
      "worklet";
      scheduleOnRN(fire);
    },
    onFinalize: () => {
      "worklet";
      pressed.value = reduced
        ? withTiming(0, timings.fast)
        : withSpring(0, springs.snappy);
    },
  });

  const animatedStyle = useAnimatedStyle(() => {
    const p = pressed.value;
    return reduced
      ? { opacity: 1 - 0.3 * p }
      : { transform: [{ scale: 1 + (tokens.press.scale - 1) * p }] };
  });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        testID={testID}
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ ...accessibilityState, disabled }}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "activate" && !disabled) fire();
        }}
        style={[style, animatedStyle]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
