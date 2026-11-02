import { StyleSheet, View } from "react-native";

import type { Rect } from "@/feed/layout";
import { tokens } from "@/theme/tokens";

const BAR_HEIGHT = tokens.space[3];
const DOT = tokens.layout.minTouch;

/**
 * Placeholder shown while the library loads: the reel background with blocks where the rail and
 * the meta will appear (no spinner). It is a plain dark frame, so the first reel's poster
 * replaces it without a flash.
 */
export function FeedSkeleton({ rail, meta, height }: { rail: Rect | null; meta: Rect | null; height: number }) {
  return (
    <View style={styles.root} testID="feed-skeleton">
      {rail ? (
        <View style={[styles.rail, { left: rail.left, top: rail.top, width: rail.width, height: rail.height }]}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      ) : null}
      {meta ? (
        <View style={[styles.meta, { left: meta.left, bottom: height - (meta.top + meta.height), width: meta.width }]}>
          <View style={[styles.bar, styles.barShort]} />
          <View style={styles.bar} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.reelBg },
  rail: { position: "absolute", alignItems: "center", justifyContent: "flex-end", gap: tokens.space[3] },
  dot: { width: DOT, height: DOT, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface },
  meta: { position: "absolute", paddingHorizontal: tokens.space[4], gap: tokens.space[2] },
  bar: { height: BAR_HEIGHT, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surface },
  barShort: { width: "40%" },
});
