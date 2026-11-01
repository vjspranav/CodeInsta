import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

export type ScreenProps = {
  children?: ReactNode;
  /** Scrolls the content and keeps focused fields above the keyboard (forms). */
  scroll?: boolean;
  /** Pad the content with the page padding token (default true). */
  padded?: boolean;
  /** Apply the bottom safe-area inset (turn off under a tab bar). */
  bottomInset?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Full-screen container on the app background with safe-area insets. Tokens only. */
export function Screen({ children, scroll = false, padded = true, bottomInset = true, style, testID }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const frame = {
    paddingTop: insets.top,
    paddingBottom: bottomInset ? insets.bottom : 0,
    paddingLeft: insets.left + (padded ? tokens.layout.pagePadding : 0),
    paddingRight: insets.right + (padded ? tokens.layout.pagePadding : 0),
  };

  if (scroll) {
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        testID={testID}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scrollContent, frame, style]}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }
  return (
    <View style={[styles.root, frame, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.paper },
  scrollContent: { flexGrow: 1 },
});
