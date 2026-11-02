import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Heart } from "lucide-react-native";
import {
  GestureDetector,
  useCompetingGestures,
  useExclusiveGestures,
  useLongPressGesture,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { preloadWindow } from "@/feed/preload";
import { durations, springs, timings, tokens } from "@/theme/tokens";
import { dragOffset, dragTarget, pageOffset } from "./pagerMath";

/** Reels mounted around the settled one: 1 behind, 2 ahead (the preload window). */
const AHEAD = 2;
const BEHIND = 1;
const HEART_SIZE = 96;
const HEART_START_SCALE = 0.4;
/** The finger must travel this far vertically before the pager takes over from the taps. */
const PAN_ACTIVE_Y = 12;
const PAN_FAIL_X = 24;
const LONG_PRESS_MS = 450;
const TAP_MAX_MS = 300;
/** A second tap must land within the base duration token to count as a double tap. */
const DOUBLE_TAP_WINDOW_MS = durations.base;

export type PagerController = {
  /** Animated move to `index` (one-page moves) or an instant jump (anything outside the window). */
  scrollTo(index: number): void;
};

export type FeedPagerProps = {
  count: number;
  width: number;
  height: number;
  /** The settled reel. Changes only after a swipe has come to rest. */
  index: number;
  onSettle(index: number): void;
  renderPage(index: number): ReactNode;
  keyFor(index: number): string;
  /** Overlay opacity: hidden while a drag is in progress, back on rest. Owned by the screen. */
  chrome: SharedValue<number>;
  onTap(): void;
  onDoubleTap(): void;
  onLongPress(): void;
  controllerRef?: MutableRefObject<PagerController | null>;
  testID?: string;
};

/**
 * Full-screen vertical pager. Everything that moves runs on the UI thread: a pan gesture writes
 * `translateY`, release snaps with the shared `feed` spring (velocity carried over), the overlay
 * fades through a shared value, and the double-tap heart is animated by the gesture worklet
 * itself. React state changes only when a swipe has settled (`onSettle`), never during a drag.
 * Only the preload window (one behind, two ahead) is mounted.
 */
export function FeedPager({
  count,
  width,
  height,
  index,
  onSettle,
  renderPage,
  keyFor,
  chrome,
  onTap,
  onDoubleTap,
  onLongPress,
  controllerRef,
  testID,
}: FeedPagerProps) {
  const reduced = useReducedMotion();
  const translateY = useSharedValue(pageOffset(index, height));
  /** The page the pager rests on or is heading to. */
  const page = useSharedValue(index);
  /** The page React knows about (last `onSettle`), mirrored for the worklets. */
  const settled = useSharedValue(index);
  const heightSV = useSharedValue(height);
  const countSV = useSharedValue(count);

  const heartX = useSharedValue(0);
  const heartY = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  // Latest props for the JS callbacks scheduled from worklets, so the gestures never rebuild.
  const latest = useRef({ onSettle, onTap, onDoubleTap, onLongPress });
  latest.current = { onSettle, onTap, onDoubleTap, onLongPress };
  const jsSettle = useCallback((i: number) => latest.current.onSettle(i), []);
  const jsTap = useCallback(() => latest.current.onTap(), []);
  const jsDoubleTap = useCallback(() => latest.current.onDoubleTap(), []);
  const jsLongPress = useCallback(() => latest.current.onLongPress(), []);

  // Size or index changed from outside (rotation, library refresh, far jump): re-anchor.
  useLayoutEffect(() => {
    const resized = heightSV.value !== height;
    heightSV.value = height;
    countSV.value = count;
    if (resized || settled.value !== index) {
      cancelAnimation(translateY);
      settled.value = index;
      page.value = index;
      translateY.value = pageOffset(index, height);
    }
  }, [index, height, count, heightSV, countSV, settled, page, translateY]);

  // Rest: bring the overlay back once React has the new reel.
  useEffect(() => {
    chrome.value = withTiming(1, timings.base);
  }, [index, chrome]);

  const snapTo = useCallback(
    (target: number, velocity: number) => {
      "worklet";
      page.value = target;
      const done = (finished?: boolean) => {
        "worklet";
        if (!finished || page.value !== target) return;
        if (target !== settled.value) {
          settled.value = target;
          scheduleOnRN(jsSettle, target);
        } else {
          chrome.value = withTiming(1, timings.base);
        }
      };
      const to = pageOffset(target, heightSV.value);
      translateY.value = reduced
        ? withTiming(to, timings.base, done)
        : withSpring(to, { ...springs.feed, velocity }, done);
    },
    [chrome, heightSV, jsSettle, page, reduced, settled, translateY],
  );

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      scrollTo(target: number) {
        if (target < 0 || target >= count || target === page.value) return;
        if (target >= settled.value - BEHIND && target <= settled.value + AHEAD) {
          chrome.value = withTiming(0, timings.fast);
          scheduleOnUI(snapTo, target, 0);
        } else {
          // Outside the mounted window: let React mount it, the layout effect jumps there.
          latest.current.onSettle(target);
        }
      },
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, count, chrome, page, settled, snapTo]);

  const pan = usePanGesture({
    testID: "feed-pan",
    activeOffsetY: [-PAN_ACTIVE_Y, PAN_ACTIVE_Y],
    failOffsetX: [-PAN_FAIL_X, PAN_FAIL_X],
    maxPointers: 1,
    onActivate: () => {
      "worklet";
      cancelAnimation(translateY);
      chrome.value = withTiming(0, timings.fast);
    },
    onUpdate: (e) => {
      "worklet";
      const h = heightSV.value;
      translateY.value = dragOffset(translateY.value, e.changeY, pageOffset(countSV.value - 1, h), 0);
    },
    onDeactivate: (e) => {
      "worklet";
      const target = dragTarget({
        offset: translateY.value,
        base: page.value,
        velocityY: e.velocityY,
        height: heightSV.value,
        count: countSV.value,
        minIndex: settled.value - BEHIND,
        maxIndex: settled.value + AHEAD,
      });
      snapTo(target, e.velocityY);
    },
  });

  const singleTap = useTapGesture({
    testID: "feed-tap",
    maxDuration: TAP_MAX_MS,
    onActivate: () => {
      "worklet";
      scheduleOnRN(jsTap);
    },
  });
  const doubleTap = useTapGesture({
    testID: "feed-double-tap",
    numberOfTaps: 2,
    maxDuration: TAP_MAX_MS,
    maxDelay: DOUBLE_TAP_WINDOW_MS,
    onActivate: (e) => {
      "worklet";
      heartX.value = e.x;
      heartY.value = e.y;
      cancelAnimation(heartScale);
      cancelAnimation(heartOpacity);
      heartOpacity.value = 1;
      if (reduced) {
        heartScale.value = 1;
      } else {
        heartScale.value = HEART_START_SCALE;
        heartScale.value = withSpring(1, springs.like);
      }
      heartOpacity.value = withDelay(durations.slow, withTiming(0, timings.base));
      scheduleOnRN(jsDoubleTap);
    },
  });
  const longPress = useLongPressGesture({
    testID: "feed-long-press",
    minDuration: LONG_PRESS_MS,
    onActivate: () => {
      "worklet";
      scheduleOnRN(jsLongPress);
    },
  });
  // Long press first, then double tap; the single tap waits until a double tap is ruled out.
  const taps = useExclusiveGestures(longPress, doubleTap, singleTap);
  const gesture = useCompetingGestures(pan, taps);

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [
      { translateX: heartX.value - HEART_SIZE / 2 },
      { translateY: heartY.value - HEART_SIZE / 2 },
      { scale: heartScale.value },
    ],
  }));

  const rows = useMemo(() => preloadWindow(index, count, AHEAD, BEHIND), [index, count]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.clip, { width, height }]} collapsable={false} testID={testID}>
        <Animated.View style={[styles.content, { width, height }, contentStyle]}>
          {rows.map((i) => (
            <View key={keyFor(i)} style={{ position: "absolute", left: 0, top: i * height, width, height }}>
              {renderPage(i)}
            </View>
          ))}
        </Animated.View>
        <Animated.View style={[styles.heart, heartStyle]} pointerEvents="none" testID="feed-heart">
          <Heart size={HEART_SIZE} color={tokens.color.like} fill={tokens.color.like} strokeWidth={0} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden", backgroundColor: tokens.color.reelBg },
  content: { position: "absolute", left: 0, top: 0 },
  heart: { position: "absolute", left: 0, top: 0, width: HEART_SIZE, height: HEART_SIZE },
});
