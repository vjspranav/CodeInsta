import { memo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { GlossaryEntry } from "@shared/types";

import { TID } from "@/testids";
import { tokens } from "@/theme/tokens";
import { textStyle } from "@/ui/feed/styles";
import { BottomSheet } from "./BottomSheet";

/** Id of the sheet container (the rail button owns `TID["reel-glossary"]`). */
export const GLOSSARY_SHEET_ID = "reel-glossary-sheet";

export type GlossarySheetProps = {
  visible: boolean;
  onClose(): void;
  entries: ReadonlyArray<GlossaryEntry>;
};

/** The reel's word list: term, what it stands for, and an optional note. */
function GlossarySheetImpl({ visible, onClose, entries }: GlossarySheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Glossary"
      closeTestID={TID["glossary-close"]}
      testID={GLOSSARY_SHEET_ID}
    >
      <ScrollView style={styles.list} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {entries.map((entry) => (
          <View key={entry.term} style={styles.entry} testID="glossary-entry">
            <Text style={styles.term}>{entry.term}</Text>
            <Text style={styles.full}>{entry.full}</Text>
            {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

export const GlossarySheet = memo(GlossarySheetImpl);

const styles = StyleSheet.create({
  list: { flexGrow: 0 },
  content: { gap: tokens.space[4], paddingVertical: tokens.space[2] },
  entry: { gap: tokens.space[1] },
  term: { ...textStyle("body"), color: tokens.color.text, fontWeight: "700" },
  full: { ...textStyle("body"), color: tokens.color.text },
  note: { ...textStyle("bodySmall"), color: tokens.color.muted },
});
