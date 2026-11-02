import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CircleCheck, Clock, Film, MessageCircle, SquarePlay } from "lucide-react-native";

import { askStatusLabel, type Ask } from "@/data/asks";
import { shortTime } from "@/data/inbox";
import { tokens } from "@/theme/tokens";
import { textStyle } from "@/ui/feed/styles";
import { PressableScale } from "./motion/PressableScale";

const ICON = tokens.space[4];

export const askRowId = (askId: string) => `ask-status-${askId}`;

export type AskStatusRowProps = {
  ask: Ask;
  creatorName: string;
  /** Opens a reel: the asked-on reel or the answer reel. */
  onOpenReel(reelId: string): void;
  /** Opens the answer DM (omit inside the thread, where the answer sits right below). */
  onOpenAnswer?(ask: Ask): void;
  /** Clamp the question to a few lines (Inbox list). */
  compact?: boolean;
};

/** One question the member asked: the reel it was about, the question, when, and where the answer is. */
export const AskStatusRow = memo(function AskStatusRow({ ask, creatorName, onOpenReel, onOpenAnswer, compact = false }: AskStatusRowProps) {
  const answered = ask.status === "answered";
  const status = askStatusLabel(ask, creatorName);
  return (
    <View testID={askRowId(ask.id)} style={styles.card}>
      <View style={styles.top}>
        {ask.reelId ? (
          <PressableScale
            testID={`${askRowId(ask.id)}-reel`}
            accessibilityRole="link"
            accessibilityLabel={`Open reel ${ask.reelTitle ?? ""}`.trim()}
            onPress={() => onOpenReel(ask.reelId!)}
            style={styles.reel}
          >
            <Film size={ICON} color={tokens.color.inkMuted} />
            <Text numberOfLines={1} style={styles.reelTitle}>
              {ask.reelTitle ?? "Reel"}
            </Text>
          </PressableScale>
        ) : (
          <Text style={[styles.reelTitle, styles.reel]}>Question</Text>
        )}
        <Text style={styles.time}>{shortTime(ask.createdAt)}</Text>
      </View>
      <Text selectable numberOfLines={compact ? 3 : undefined} style={styles.body}>
        {ask.body}
      </Text>
      <View style={styles.statusRow}>
        <View style={styles.status} accessibilityLabel={status}>
          {answered ? <CircleCheck size={ICON} color={tokens.color.accent} /> : <Clock size={ICON} color={tokens.color.inkMuted} />}
          <Text style={[styles.statusText, answered && styles.answered]}>{status}</Text>
        </View>
        {ask.answerReel ? (
          <PressableScale
            testID={`${askRowId(ask.id)}-answer-reel`}
            accessibilityRole="link"
            accessibilityLabel={`Watch answer reel ${ask.answerReel.title}`}
            onPress={() => onOpenReel(ask.answerReel!.id)}
            style={styles.action}
          >
            <SquarePlay size={ICON} color={tokens.color.accent} />
            <Text numberOfLines={1} style={styles.actionText}>
              Watch answer reel
            </Text>
          </PressableScale>
        ) : ask.answerMessageId && onOpenAnswer ? (
          <PressableScale
            testID={`${askRowId(ask.id)}-answer`}
            accessibilityRole="link"
            accessibilityLabel="Read answer"
            onPress={() => onOpenAnswer(ask)}
            style={styles.action}
          >
            <MessageCircle size={ICON} color={tokens.color.accent} />
            <Text style={styles.actionText}>Read answer</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: tokens.space[2],
    padding: tokens.space[3],
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.line,
  },
  top: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
  reel: { flex: 1, flexDirection: "row", alignItems: "center", gap: tokens.space[2], minHeight: tokens.layout.minTouch },
  reelTitle: { ...textStyle("bodySmall"), color: tokens.color.inkMuted, flexShrink: 1 },
  time: { ...textStyle("caption"), color: tokens.color.inkMuted },
  body: { ...textStyle("body"), color: tokens.color.ink },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space[3] },
  status: { flexDirection: "row", alignItems: "center", gap: tokens.space[1], flexShrink: 1 },
  statusText: { ...textStyle("bodySmall"), color: tokens.color.inkMuted },
  answered: { color: tokens.color.accent },
  action: { flexDirection: "row", alignItems: "center", gap: tokens.space[1], minHeight: tokens.layout.minTouch },
  actionText: { ...textStyle("bodySmall"), color: tokens.color.accent },
});
