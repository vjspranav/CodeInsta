import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";
import { useEffect } from "react";
import { easings, springs, tokens } from "@/theme/tokens";
import { useReducedMotion } from "./reducedMotion";
import { LOGO_SETTLE_MS } from "./startupTiming";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The CodeInsta mark: the rounded tile with the code-slash glyph from the app icon
 * (public/icons/icon.svg, same 512 grid), drawn with the accent token on paper.
 */
const TILE = { x: 105, y: 100, width: 302, height: 312, rx: 72 };
const GLYPH = "M218 195l-58 61 58 61m76-122 58 61-58 61m-21-140-34 160";
/** Perimeter of the rounded tile (straight sides + four quarter arcs), rounded up. */
const TILE_PERIMETER = 2 * (TILE.width - 2 * TILE.rx) + 2 * (TILE.height - 2 * TILE.rx) + 2 * Math.PI * TILE.rx;
/** Longest glyph subpath is about 170 units, dashes restart per subpath. */
const GLYPH_DASH = 180;
const VIEWBOX = "92 84 330 344";

export type AnimatedLogoProps = {
  /** Width of the mark in px (the wordmark sits below it). Default 112. */
  size?: number;
  /** Show the "CodeInsta" wordmark under the mark. Default true. */
  wordmark?: boolean;
  /** Start settled (no draw animation). Used by tests and by Reduce Motion fallbacks. */
  instant?: boolean;
  /** Layout of the whole logo block: StartupGate hides the native splash on the first one. */
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Stroke-draws the tile outline, fades the fill in, draws the glyph, and settles with a small sheet
 * spring. Plays once on mount, on the UI thread. Reduce Motion: the finished mark fades in.
 */
export function AnimatedLogo({ size = 112, wordmark = true, instant = false, onLayout, style, testID }: AnimatedLogoProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(instant ? 1 : 0);
  const settle = useSharedValue(instant ? 1 : 0);

  useEffect(() => {
    if (instant) return;
    if (reduced) {
      progress.value = 1;
      settle.value = withTiming(1, { duration: 160, easing: easings.standard });
      return;
    }
    progress.value = withTiming(1, { duration: LOGO_SETTLE_MS, easing: easings.emphasized });
    settle.value = withSpring(1, springs.sheet);
  }, [instant, reduced, progress, settle]);

  const outlineProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(progress.value, [0, 0.55], [TILE_PERIMETER, 0], "clamp"),
    fillOpacity: interpolate(progress.value, [0.4, 0.8], [0, 1], "clamp"),
  }));
  const glyphProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(progress.value, [0.55, 1], [GLYPH_DASH, 0], "clamp"),
  }));
  const blockStyle = useAnimatedStyle(() => ({
    opacity: reduced ? settle.value : 1,
    transform: reduced ? [] : [{ scale: interpolate(settle.value, [0, 1], [0.92, 1]) }],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.7, 1], [0, 1], "clamp"),
  }));

  const height = Math.round((size * 344) / 330);

  return (
    <View testID={testID} onLayout={onLayout} style={[styles.root, style]}>
      <Animated.View style={[styles.block, blockStyle]}>
        <Svg width={size} height={height} viewBox={VIEWBOX} accessibilityLabel="CodeInsta" accessible>
          <AnimatedRect
            x={TILE.x}
            y={TILE.y}
            width={TILE.width}
            height={TILE.height}
            rx={TILE.rx}
            fill={tokens.color.accent}
            stroke={tokens.color.accent}
            strokeWidth={8}
            strokeLinejoin="round"
            strokeDasharray={TILE_PERIMETER}
            animatedProps={outlineProps}
          />
          <AnimatedPath
            d={GLYPH}
            fill="none"
            stroke={tokens.color.paper}
            strokeWidth={23}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={GLYPH_DASH}
            animatedProps={glyphProps}
          />
        </Svg>
        {wordmark ? (
          <Animated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
            <Text style={styles.wordmark}>CodeInsta</Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center" },
  block: { alignItems: "center" },
  wordmarkWrap: { marginTop: tokens.space[4] },
  wordmark: {
    color: tokens.color.ink,
    fontFamily: tokens.type.brand.fontFamily,
    fontSize: tokens.type.brand.fontSize,
    fontWeight: tokens.type.brand.fontWeight,
    letterSpacing: tokens.type.brand.letterSpacing,
  },
});
