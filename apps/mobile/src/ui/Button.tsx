import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { tokens } from "@/theme/tokens";
import { PressableScale } from "./motion/PressableScale";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Request in flight: the press is ignored and the button dims; the size never changes. */
  busy?: boolean;
  /** Leading icon (a lucide icon element). */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

/** Token-styled button on PressableScale (UI-thread press spring). */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  icon,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const inactive = disabled || busy;
  return (
    <PressableScale
      testID={testID}
      onPress={inactive ? undefined : onPress}
      haptic="refresh"
      disabled={inactive}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy }}
      style={[styles.base, variantStyle[variant], inactive && styles.inactive, style]}
    >
      <View style={styles.row}>
        {icon}
        <Text style={[styles.label, variant === "primary" ? styles.primaryLabel : styles.plainLabel]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tokens.layout.controlHeight,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space[5],
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
  inactive: { opacity: 0.5 },
  label: {
    fontFamily: tokens.type.body.fontFamily,
    fontSize: tokens.type.body.fontSize,
    fontWeight: "600",
  },
  primaryLabel: { color: tokens.color.accentInk },
  plainLabel: { color: tokens.color.ink },
});

const variantStyle = StyleSheet.create({
  primary: { backgroundColor: tokens.color.accent },
  secondary: { backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.lineStrong },
  ghost: { backgroundColor: "transparent" },
});
