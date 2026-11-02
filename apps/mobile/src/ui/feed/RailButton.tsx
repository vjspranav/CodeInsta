import { memo } from "react";
import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import type { DesignHapticName } from "@shared/design-tokens";

import { tokens } from "@/theme/tokens";
import { PressableScale } from "@/ui/motion/PressableScale";
import { overlayTextShadow, textStyle } from "./styles";

export type RailButtonProps = {
  testID: string;
  label: string;
  accessibilityLabel: string;
  onPress(): void;
  haptic?: DesignHapticName;
  /** Toggle state for assistive tech (liked, disliked). */
  selected?: boolean;
  children: ReactNode;
};

/** One floating action: a line icon over the video with a short caption, on the press spring. */
function RailButtonImpl({ testID, label, accessibilityLabel, onPress, haptic, selected, children }: RailButtonProps) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      haptic={haptic}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={styles.button}
    >
      {children}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export const RailButton = memo(RailButtonImpl);

export const RAIL_ICON_SIZE = 28;

const styles = StyleSheet.create({
  button: {
    minWidth: tokens.layout.minTouch,
    minHeight: tokens.layout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space[1] / 2,
    paddingVertical: tokens.space[1],
  },
  label: { ...textStyle("nav"), ...overlayTextShadow, color: tokens.color.text },
});
