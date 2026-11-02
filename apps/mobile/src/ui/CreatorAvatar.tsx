import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { creatorMark } from "@shared/creator-marks";
import { tokens } from "@/theme/tokens";

/**
 * Round tile with the creator's brand mark drawn with react-native-svg, or initials for an unknown
 * creator. Marks: simple-icons v15.0.0, CC0 (see packages/shared/src/creator-marks.ts).
 */
export const CreatorAvatar = memo(function CreatorAvatar({ creatorId, size = tokens.layout.headerHeight }: {
  creatorId?: string;
  size?: number;
}) {
  const mark = creatorMark(creatorId);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (!mark)
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={creatorId ?? "Creator"} style={[styles.tile, box, { backgroundColor: tokens.color.surfaceRaised }]}>
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.45) }]}>{(creatorId ?? "?").slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  const glyph = Math.round(size * 0.58);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={mark.name} style={[styles.tile, box, { backgroundColor: mark.tile }]}>
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24" fill={mark.color}>
        <Path d={mark.path} />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initial: { color: tokens.color.text, fontWeight: "700" },
});
