import { memo } from "react";
import { StyleSheet, Text } from "react-native";

import { tokens } from "@/theme/tokens";
import { TID } from "@/testids";
import { PressableScale } from "@/ui/motion/PressableScale";
import { textStyle } from "./styles";

/** Series chip: same copy as the web "Next in series" link. */
export function nextPartLabel(partIndex: number | null): string {
  return partIndex == null ? "Next in series →" : `Next in series · Part ${partIndex} →`;
}

export type NextPartCardProps = {
  partIndex: number | null;
  onPress(): void;
};

function NextPartCardImpl({ partIndex, onPress }: NextPartCardProps) {
  const label = nextPartLabel(partIndex);
  return (
    <PressableScale
      testID={TID["reel-next-part"]}
      onPress={onPress}
      accessibilityLabel={label}
      style={styles.card}
    >
      <Text style={styles.text}>{label}</Text>
    </PressableScale>
  );
}

export const NextPartCard = memo(NextPartCardImpl);

const styles = StyleSheet.create({
  card: {
    alignSelf: "flex-start",
    minHeight: tokens.layout.minTouch - tokens.space[2],
    justifyContent: "center",
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.overlayChip,
  },
  text: { ...textStyle("meta"), color: tokens.color.text, fontWeight: "600" },
});
