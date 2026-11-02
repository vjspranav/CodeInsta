import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Pause, Play, Volume2, VolumeX } from "lucide-react-native";

import type { Rect } from "@/feed/layout";
import { tokens } from "@/theme/tokens";
import { TID } from "@/testids";
import { PressableScale } from "@/ui/motion/PressableScale";

const ICON = 20;

export type TopControlsProps = {
  rect: Rect;
  soundOn: boolean;
  paused: boolean;
  onToggleSound(): void;
  onTogglePause(): void;
};

/** Sound and pause, inside the shared topControls zone. */
function TopControlsImpl({ rect, soundOn, paused, onToggleSound, onTogglePause }: TopControlsProps) {
  return (
    <View style={[styles.zone, rect]} pointerEvents="box-none">
      <PressableScale
        testID={TID["reel-sound"]}
        onPress={onToggleSound}
        accessibilityLabel={soundOn ? "Mute" : "Unmute"}
        style={styles.chip}
      >
        {soundOn ? (
          <Volume2 size={ICON} color={tokens.color.text} />
        ) : (
          <VolumeX size={ICON} color={tokens.color.text} />
        )}
      </PressableScale>
      <PressableScale
        testID={TID["reel-pause"]}
        onPress={onTogglePause}
        accessibilityLabel={paused ? "Play" : "Pause"}
        style={styles.chip}
      >
        {paused ? <Play size={ICON} color={tokens.color.text} /> : <Pause size={ICON} color={tokens.color.text} />}
      </PressableScale>
    </View>
  );
}

export const TopControls = memo(TopControlsImpl);

const styles = StyleSheet.create({
  zone: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: tokens.space[2],
    paddingRight: tokens.space[3],
  },
  chip: {
    width: tokens.layout.minTouch,
    height: tokens.layout.minTouch,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.overlayChip,
  },
});
