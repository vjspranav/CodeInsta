import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { BookOpen, MessageCircle, ThumbsDown } from "lucide-react-native";
import type { MobileReel } from "@shared/types";

import type { Rect } from "@/feed/layout";
import { tokens } from "@/theme/tokens";
import { TID } from "@/testids";
import { ShareAction } from "@/ui/sheets/ShareAction";
import { LikeIcon } from "./LikeIcon";
import { RAIL_ICON_SIZE, RailButton } from "./RailButton";

export type ActionRailProps = {
  rect: Rect;
  reel: Pick<MobileReel, "id" | "title">;
  liked: boolean;
  disliked: boolean;
  hasGlossary: boolean;
  onLike(): void;
  onAsk(): void;
  onGlossary(): void;
  onDislike(): void;
};

/** Like, ask, glossary (when the reel has one), share, not for me: inside the shared rightRail zone. */
function ActionRailImpl({ rect, reel, liked, disliked, hasGlossary, onLike, onAsk, onGlossary, onDislike }: ActionRailProps) {
  return (
    <View style={[styles.zone, rect]} pointerEvents="box-none">
      <RailButton
        testID={TID["reel-like"]}
        label="Like"
        accessibilityLabel={liked ? "Unlike" : "Like"}
        selected={liked}
        onPress={onLike}
      >
        <LikeIcon liked={liked} />
      </RailButton>
      <RailButton testID={TID["reel-ask"]} label="Ask" accessibilityLabel="Ask a question" onPress={onAsk}>
        <MessageCircle size={RAIL_ICON_SIZE} color={tokens.color.text} strokeWidth={2} />
      </RailButton>
      {hasGlossary ? (
        <RailButton testID={TID["reel-glossary"]} label="Glossary" accessibilityLabel="Open glossary" onPress={onGlossary}>
          <BookOpen size={RAIL_ICON_SIZE} color={tokens.color.text} strokeWidth={2} />
        </RailButton>
      ) : null}
      <ShareAction reel={reel} />
      <RailButton
        testID={TID["reel-dislike"]}
        label="Not for me"
        accessibilityLabel="Not for me"
        haptic="dislike"
        selected={disliked}
        onPress={onDislike}
      >
        <ThumbsDown
          size={RAIL_ICON_SIZE - tokens.space[1]}
          color={disliked ? tokens.color.accent : tokens.color.text}
          strokeWidth={2}
        />
      </RailButton>
    </View>
  );
}

export const ActionRail = memo(ActionRailImpl);

const styles = StyleSheet.create({
  zone: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: tokens.space[1],
  },
});
