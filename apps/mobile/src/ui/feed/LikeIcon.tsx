import { memo, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { Heart } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { springs, timings, tokens } from "@/theme/tokens";
import { RAIL_ICON_SIZE } from "./RailButton";

/** Dip scale before the pop: the icon compresses, then springs past 1 on the like spring. */
const DIP_SCALE = 0.75;

/**
 * Rail heart. Turning red crossfades the filled heart in and pops the icon on the shared `like`
 * spring, all on the UI thread. Un-liking just fades back (no pop). The first render never animates.
 */
function LikeIconImpl({ liked }: { liked: boolean }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(liked ? 1 : 0);
  const pop = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    fill.value = withTiming(liked ? 1 : 0, timings.instant);
    if (liked && !reduced) pop.value = withSequence(withTiming(DIP_SCALE, timings.instant), withSpring(1, springs.like));
  }, [liked, reduced, fill, pop]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));

  return (
    <Animated.View style={[styles.box, popStyle]} testID={liked ? "like-icon-on" : "like-icon-off"}>
      <Heart size={RAIL_ICON_SIZE} color={tokens.color.text} strokeWidth={2} />
      <Animated.View style={[StyleSheet.absoluteFill, fillStyle]} pointerEvents="none">
        <Heart size={RAIL_ICON_SIZE} color={tokens.color.like} fill={tokens.color.like} strokeWidth={2} />
      </Animated.View>
    </Animated.View>
  );
}

export const LikeIcon = memo(LikeIconImpl);

const styles = StyleSheet.create({
  box: { width: RAIL_ICON_SIZE, height: RAIL_ICON_SIZE },
});

