import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { usePlayerPool } from "@/feed/PlayerPoolProvider";
import { durations, tokens } from "@/theme/tokens";

const BAR_HEIGHT = tokens.space[1] / 2 + 1;
/** The player reports its time at this interval (seconds); each report glides to the next point. */
const TICK_S = durations.base / 1000;

export type ProgressBarProps = {
  /** Pool slot (`slotFor(index)`) of the active reel. */
  slot: number;
  /** Reel source: changes when the slot is reloaded, which resets the bar. */
  source: string;
  width: number;
};

/**
 * Thin bar at the very bottom, driven by the player's own clock. The player's `timeUpdate` events
 * only write a shared value (no React state, no render); the fill itself is animated on the UI
 * thread, gliding linearly between reports so it moves smoothly instead of in steps.
 */
function ProgressBarImpl({ slot, source, width }: ProgressBarProps) {
  const { players } = usePlayerPool();
  const player = players[slot];
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    const previousInterval = player.timeUpdateEventInterval;
    player.timeUpdateEventInterval = TICK_S;
    const sub = player.addListener("timeUpdate", ({ currentTime }) => {
      const total = player.duration;
      if (!(total > 0)) return;
      const ahead = Math.min(1, (currentTime + TICK_S) / total);
      // A restart (replay) jumps back instead of sweeping backwards.
      if (ahead < progress.value) progress.value = ahead;
      else progress.value = withTiming(ahead, { duration: durations.base, easing: Easing.linear });
    });
    return () => {
      sub.remove();
      player.timeUpdateEventInterval = previousInterval;
    };
  }, [player, source, progress]);

  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.value - 1) * width }] }));

  return (
    <View style={[styles.track, { width }]} pointerEvents="none" testID="reel-progress">
      <Animated.View style={[styles.fill, { width }, fill]} />
    </View>
  );
}

export const ProgressBar = memo(ProgressBarImpl);

const styles = StyleSheet.create({
  track: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: BAR_HEIGHT,
    overflow: "hidden",
    backgroundColor: tokens.color.overlayChip,
    zIndex: tokens.z.progress,
  },
  fill: { height: BAR_HEIGHT, backgroundColor: tokens.color.text },
});
