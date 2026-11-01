import * as React from "react";
import { forwardRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { StyleProp, TextInputProps, ViewStyle } from "react-native";
import { tokens } from "@/theme/tokens";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  /** Small muted line under the field. */
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Labelled single-field input. The border follows focus; no per-frame JS. */
export const TextField = forwardRef<React.ComponentRef<typeof TextInput>, TextFieldProps>(function TextField(
  { label, hint, containerStyle, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={tokens.color.inkMuted}
        selectionColor={tokens.color.accent}
        cursorColor={tokens.color.accent}
        keyboardAppearance="dark"
        multiline={multiline}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, multiline && styles.multiline, focused && styles.focused]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: tokens.space[1] },
  label: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.meta.fontFamily,
    fontSize: tokens.type.meta.fontSize,
    fontWeight: tokens.type.meta.fontWeight,
  },
  input: {
    minHeight: tokens.layout.controlHeight,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.panel,
    paddingHorizontal: tokens.space[4],
    color: tokens.color.ink,
    fontFamily: tokens.type.input.fontFamily,
    fontSize: tokens.type.input.fontSize,
  },
  multiline: { minHeight: 96, paddingTop: tokens.space[3], textAlignVertical: "top" },
  focused: { borderColor: tokens.color.accent },
  hint: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.caption.fontFamily,
    fontSize: tokens.type.caption.fontSize,
  },
});
