import { memo } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { Creator, MobileReel } from "@shared/types";

import type { Rect } from "@/feed/layout";
import { ActionRail } from "./ActionRail";
import { BottomMeta } from "./BottomMeta";
import { ProgressBar } from "./ProgressBar";
import { TopControls } from "./TopControls";

export type OverlayRects = { topControls: Rect; rightRail: Rect; bottomMeta: Rect };

export type ReelOverlayProps = {
  /** 1 at rest, 0 while the user drags the pager. */
  chrome: SharedValue<number>;
  rects: OverlayRects;
  width: number;
  height: number;
  reel: MobileReel;
  creator: Creator | undefined;
  next: MobileReel | undefined;
  /** Pool slot and source of the active reel (progress bar). */
  slot: number;
  liked: boolean;
  disliked: boolean;
  soundOn: boolean;
  paused: boolean;
  onLike(): void;
  onAsk(): void;
  onGlossary(): void;
  onDislike(): void;
  onToggleSound(): void;
  onTogglePause(): void;
  onNextPart(next: MobileReel): void;
};

/**
 * Every floating control for the settled reel, placed from the shared overlay zones. It is one
 * layer above the pager: it fades out as soon as a drag begins (a shared value, no React render)
 * and fades back in when the swipe rests, by which time it already shows the new reel.
 */
function ReelOverlayImpl(props: ReelOverlayProps) {
  const { chrome, rects, width, height, reel, creator, next } = props;
  const style = useAnimatedStyle(() => ({ opacity: chrome.value }));
  const textWidth = Math.max(rects.rightRail.left - rects.bottomMeta.left, 0);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="box-none">
      <TopControls
        rect={rects.topControls}
        soundOn={props.soundOn}
        paused={props.paused}
        onToggleSound={props.onToggleSound}
        onTogglePause={props.onTogglePause}
      />
      <ActionRail
        rect={rects.rightRail}
        reel={reel}
        liked={props.liked}
        disliked={props.disliked}
        hasGlossary={(reel.glossary?.length ?? 0) > 0}
        onLike={props.onLike}
        onAsk={props.onAsk}
        onGlossary={props.onGlossary}
        onDislike={props.onDislike}
      />
      <BottomMeta
        key={reel.id}
        rect={rects.bottomMeta}
        screenHeight={height}
        textWidth={textWidth}
        reel={reel}
        creator={creator}
        next={next}
        onNextPart={props.onNextPart}
      />
      <ProgressBar slot={props.slot} source={reel.video_url} width={width} />
    </Animated.View>
  );
}

export const ReelOverlay = memo(ReelOverlayImpl);
