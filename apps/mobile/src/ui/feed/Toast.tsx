import { memo, useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { springs, timings, tokens } from "@/theme/tokens";
import { PressableScale } from "@/ui/motion/PressableScale";
import { textStyle } from "./styles";

/** How long a toast with an action (Undo) stays; plain notices leave sooner. */
export const TOAST_ACTION_MS = 4000;
export const TOAST_NOTICE_MS = 3000;
const ENTER_OFFSET = tokens.space[4];

export type ToastData = {
  id: number;
  message: string;
  /** Action label (for example "Undo"); the toast stays longer when it has one. */
  actionLabel?: string;
  onAction?: () => void;
  /** Test id of the action button. */
  actionTestID?: string;
};

export type ToastProps = ToastData & {
  /** Distance from the bottom of the feed. */
  bottom: number;
  onDismiss(id: number): void;
  testID?: string;
};

/**
 * One transient message above the bottom meta. Enters on the sheet spring, leaves with a short
 * fade, and reports `onDismiss` after it is gone. Mount a new toast with a new `id`.
 */
function ToastImpl({ id, message, actionLabel, onAction, actionTestID, bottom, onDismiss, testID }: ToastProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const closing = useRef(false);
  const dismiss$ = useRef(onDismiss);
  dismiss$.current = onDismiss;

  const finish = useCallback(() => dismiss$.current(id), [id]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    progress.value = withTiming(0, timings.fast, (done) => {
      "worklet";
      if (done) scheduleOnRN(finish);
    });
  }, [finish, progress]);

  useEffect(() => {
    progress.value = reduced ? withTiming(1, timings.fast) : withSpring(1, springs.sheet);
    const timer = setTimeout(close, actionLabel ? TOAST_ACTION_MS : TOAST_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [actionLabel, close, progress, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, progress.value)),
    transform: [{ translateY: reduced ? 0 : (1 - progress.value) * ENTER_OFFSET }],
  }));

  const act = useCallback(() => {
    onAction?.();
    close();
  }, [close, onAction]);

  return (
    <Animated.View style={[styles.wrap, { bottom }, style]} pointerEvents="box-none">
      <View style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
        <Text style={styles.message}>{message}</Text>
        {actionLabel ? (
          <PressableScale testID={actionTestID} onPress={act} style={styles.action} accessibilityLabel={actionLabel}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );
}

export const Toast = memo(ToastImpl);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: tokens.space[4],
    right: tokens.space[4],
    alignItems: "center",
    zIndex: tokens.z.toast,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[3],
    minHeight: tokens.layout.minTouch,
    paddingLeft: tokens.space[4],
    paddingRight: tokens.space[2],
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surfaceRaised,
    maxWidth: "100%",
  },
  message: { ...textStyle("bodySmall"), color: tokens.color.text, flexShrink: 1 },
  action: {
    minHeight: tokens.layout.minTouch - tokens.space[2],
    paddingHorizontal: tokens.space[3],
    justifyContent: "center",
    borderRadius: tokens.radius.pill,
  },
  actionText: { ...textStyle("bodySmall"), color: tokens.color.accent, fontWeight: "700" },
});

