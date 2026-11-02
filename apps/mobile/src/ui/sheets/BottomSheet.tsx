import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { X } from "lucide-react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { springs, timings, tokens } from "@/theme/tokens";
import { PressableScale } from "@/ui/motion/PressableScale";
import { textStyle } from "@/ui/feed/styles";

/** Share of the sheet's height the user must drag down to dismiss. */
const DISMISS_FRACTION = 0.3;
/** Release speed (px/s) that dismisses on its own. */
const DISMISS_VELOCITY = 900;
const MAX_HEIGHT_SHARE = 0.9;
const GRABBER_W = 36;
const GRABBER_H = 4;

export type BottomSheetProps = {
  visible: boolean;
  /** Called as soon as the user dismisses (X, scrim, drag, Android back). Set `visible` to false. */
  onClose(): void;
  title: string;
  closeTestID: string;
  testID?: string;
  children: ReactNode;
};

/**
 * Modal bottom sheet. It rises on the shared `sheet` spring, follows the finger when the header is
 * dragged, and leaves on a velocity-aware spring; the scrim fades with the sheet's position. All
 * motion is on the UI thread. The sheet stays mounted until its exit animation has finished.
 */
export function BottomSheet({ visible, onClose, title, closeTestID, testID, children }: BottomSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;

  const translateY = useSharedValue(windowHeight);
  const sheetHeight = useSharedValue(0);
  const releaseVelocity = useSharedValue(0);

  const latest = useRef(onClose);
  latest.current = onClose;
  const requestClose = useCallback(() => latest.current(), []);
  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      releaseVelocity.value = 0;
      translateY.value = reduced ? withTiming(0, timings.base) : withSpring(0, springs.sheet);
      return;
    }
    if (!mountedRef.current) return;
    const exit = (done?: boolean) => {
      "worklet";
      if (done) scheduleOnRN(unmount);
    };
    translateY.value = reduced
      ? withTiming(windowHeight, timings.fast, exit)
      : withSpring(windowHeight, { ...springs.sheet, overshootClamping: true, velocity: releaseVelocity.value }, exit);
  }, [visible, reduced, windowHeight, translateY, releaseVelocity, unmount]);

  const pan = usePanGesture({
    testID: testID ? `${testID}-pan` : undefined,
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      "worklet";
      translateY.value = Math.max(0, translateY.value + e.changeY);
    },
    onDeactivate: (e) => {
      "worklet";
      releaseVelocity.value = e.velocityY;
      if (translateY.value > sheetHeight.value * DISMISS_FRACTION || e.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(requestClose);
      } else {
        translateY.value = withSpring(0, { ...springs.sheet, velocity: e.velocityY });
      }
    },
  });
  const scrimTap = useTapGesture({
    testID: testID ? `${testID}-scrim` : undefined,
    onActivate: () => {
      "worklet";
      scheduleOnRN(requestClose);
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, windowHeight], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      testID={testID ? `${testID}-modal` : undefined}
    >
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={scrimTap}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} testID={testID ? `${testID}-scrim` : undefined} />
        </GestureDetector>
        <KeyboardAvoidingView
          style={styles.avoid}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          pointerEvents="box-none"
        >
          <Animated.View
            testID={testID}
            style={[
              styles.sheet,
              { maxHeight: windowHeight * MAX_HEIGHT_SHARE, paddingBottom: insets.bottom + tokens.space[4] },
              sheetStyle,
            ]}
            onLayout={(e) => {
              sheetHeight.value = e.nativeEvent.layout.height;
            }}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.header} collapsable={false}>
                <View style={styles.grabber} />
                <View style={styles.titleRow}>
                  <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                    {title}
                  </Text>
                  <PressableScale
                    testID={closeTestID}
                    onPress={requestClose}
                    accessibilityLabel="Close"
                    style={styles.close}
                  >
                    <X size={20} color={tokens.color.text} />
                  </PressableScale>
                </View>
              </View>
            </GestureDetector>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  avoid: { flex: 1, justifyContent: "flex-end" },
  scrim: { backgroundColor: tokens.color.scrim },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    paddingHorizontal: tokens.space[5],
    zIndex: tokens.z.sheet,
  },
  header: { paddingTop: tokens.space[2], paddingBottom: tokens.space[2] },
  grabber: {
    alignSelf: "center",
    width: GRABBER_W,
    height: GRABBER_H,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.lineStrong,
    marginBottom: tokens.space[2],
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space[3] },
  title: { ...textStyle("heading"), color: tokens.color.text, flex: 1 },
  close: {
    width: tokens.layout.minTouch,
    height: tokens.layout.minTouch,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
