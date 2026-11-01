import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { tokens } from "@/theme/tokens";

export type EmptyStateProps = {
  title: string;
  body?: string;
  /** A lucide icon element shown above the title. */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Centered titled empty state. */
export function EmptyState({ title, body, icon, style, testID }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {icon}
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space[2], padding: tokens.space[6] },
  title: {
    color: tokens.color.ink,
    fontFamily: tokens.type.heading.fontFamily,
    fontSize: tokens.type.heading.fontSize,
    fontWeight: tokens.type.heading.fontWeight,
    textAlign: "center",
  },
  body: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.body.fontFamily,
    fontSize: tokens.type.body.fontSize,
    lineHeight: tokens.type.body.lineHeight,
    textAlign: "center",
  },
});
