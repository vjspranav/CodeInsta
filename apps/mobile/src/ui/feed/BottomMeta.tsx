import { memo, useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Creator, MobileReel } from "@shared/types";

import type { Rect } from "@/feed/layout";
import { tokens } from "@/theme/tokens";
import { PressableScale } from "@/ui/motion/PressableScale";
import { CreatorAvatar } from "@/ui/CreatorAvatar";
import { NextPartCard } from "./NextPartCard";
import { overlayTextShadow, textStyle } from "./styles";

const AVATAR = 28;

/** Same badge copy as the web overlay. */
export function creatorBadge(creatorId: string): string {
  return creatorId === "gpt" ? "Build & debug" : "Under the hood";
}

export type BottomMetaProps = {
  rect: Rect;
  /** Height of the feed area: the card is anchored to the zone's bottom edge and grows upward. */
  screenHeight: number;
  /** Right edge available to text (left edge of the rail minus a gap). */
  textWidth: number;
  reel: MobileReel;
  creator: Creator | undefined;
  next: MobileReel | undefined;
  onNextPart(next: MobileReel): void;
};

/**
 * Creator, title and the series chip in the shared bottomMeta zone. Anchored to the zone's bottom
 * edge so a long title grows upward (like web). Tapping the title shows or hides the tags.
 */
function BottomMetaImpl({ rect, screenHeight, textWidth, reel, creator, next, onNextPart }: BottomMetaProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const handle = creator?.handle ?? reel.creator_id;
  const tags = reel.tags.map((tag) => `#${tag}`).join(" ");

  return (
    <View
      style={[styles.zone, { left: rect.left, bottom: screenHeight - (rect.top + rect.height), width: textWidth }]}
      pointerEvents="box-none"
      testID="reel-meta"
    >
      {next ? <NextPartCard partIndex={next.series_index} onPress={() => onNextPart(next)} /> : null}
      <View style={styles.creator}>
        <CreatorAvatar creatorId={reel.creator_id} size={AVATAR} />
        <Text style={styles.handle} numberOfLines={1}>
          {handle}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{creatorBadge(reel.creator_id)}</Text>
        </View>
      </View>
      <PressableScale
        onPress={toggle}
        accessibilityLabel={reel.title}
        accessibilityHint={expanded ? "Hide tags" : "Show tags"}
        accessibilityState={{ expanded }}
        style={styles.titleHit}
      >
        <Text style={styles.title} numberOfLines={expanded ? undefined : 2}>
          {reel.title}
        </Text>
        {expanded && tags ? <Text style={styles.tags}>{tags}</Text> : null}
      </PressableScale>
    </View>
  );
}

export const BottomMeta = memo(BottomMetaImpl);

const styles = StyleSheet.create({
  zone: {
    position: "absolute",
    paddingHorizontal: tokens.space[4],
    gap: tokens.space[2],
  },
  creator: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
  handle: { ...textStyle("bodySmall"), ...overlayTextShadow, color: tokens.color.text, fontWeight: "700", flexShrink: 1 },
  badge: {
    paddingHorizontal: tokens.space[2],
    paddingVertical: tokens.space[1] / 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.overlayChip,
  },
  badgeText: { ...textStyle("caption"), color: tokens.color.text },
  titleHit: { alignSelf: "stretch" },
  title: { ...textStyle("reelTitle"), ...overlayTextShadow, color: tokens.color.text },
  tags: { ...textStyle("caption"), ...overlayTextShadow, color: tokens.color.muted, marginTop: tokens.space[1] },
});
