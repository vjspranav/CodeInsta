import { memo, useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Inbox } from "lucide-react-native";
import { DAILY_ASKS } from "@shared/validation";
import type { MobileReel } from "@shared/types";

import { useAuth } from "@/auth/useAuth";
import { askQuestion, asksLeft } from "@/data/asks";
import { markMeaningfulAction } from "@/push/register";
import { TID } from "@/testids";
import { tokens } from "@/theme/tokens";
import { textStyle } from "@/ui/feed/styles";
import { Button } from "@/ui/Button";
import { PressableScale } from "@/ui/motion/PressableScale";
import { BottomSheet } from "./BottomSheet";

export const QUEUED_COPY = "Queued, usually answered within the hour.";
/** Post-send confirmation: where the answer will arrive (same copy as the web sheet). */
export function sentCopy(who: string, wants: "dm" | "reel"): string {
  return wants === "reel"
    ? `${who} will make a reel about it. Track it in your Inbox.`
    : `${who} will answer in your Inbox, usually within the hour.`;
}
export const LIMIT_COPY = `You've used all ${DAILY_ASKS} questions for today. Try again later.`;
const PLACEHOLDER = "What would you like to understand next?";
const MEMBER_MAX = 1000;
const OWNER_MAX = 5000;
const INPUT_MIN_HEIGHT = tokens.layout.controlHeight * 2;
const INPUT_MAX_HEIGHT = tokens.layout.controlHeight * 4;
const RADIO_SIZE = 20;
const RADIO_DOT = 10;

type Wants = "dm" | "reel";
const CHOICES: ReadonlyArray<{ value: Wants; label: string }> = [
  { value: "dm", label: "Answer in my inbox" },
  { value: "reel", label: "Make a reel about it" },
];

export type AskSheetProps = {
  visible: boolean;
  onClose(): void;
  reel: Pick<MobileReel, "id" | "title" | "creator_id"> | null;
  /**
   * @deprecated No longer called. After a successful send the sheet stays open on its own
   * confirmation (where the answer arrives, with Go to Inbox), so a caller toast would repeat it.
   */
  onSent?(message: string): void;
};

/** Same wording as the web Feedback sheet: who the question goes to, the choice of answer, the limit. */
function AskSheetImpl({ visible, onClose, reel }: AskSheetProps) {
  const { user, role } = useAuth();
  const isOwner = role === "owner";
  const userId = user?.id ?? "";
  const [body, setBody] = useState("");
  const [wants, setWants] = useState<Wants>("dm");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  // undefined: still counting (treated as allowed); null: owner, no limit.
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  // Set after a successful send: the sheet switches to its confirmation.
  const [sent, setSent] = useState<Wants | null>(null);

  useEffect(() => {
    if (!visible) return;
    setBody("");
    setWants("dm");
    setError("");
    setPending(false);
    setSent(null);
  }, [visible, reel?.id]);

  useEffect(() => {
    if (!visible || !userId) return;
    let alive = true;
    void asksLeft(userId, isOwner).then(
      (n) => alive && setLeft(n),
      () => alive && setLeft(undefined),
    );
    return () => {
      alive = false;
    };
  }, [visible, userId, isOwner]);

  const who = reel?.creator_id === "gpt" ? "GPT" : "Claude";
  const blocked = left === 0;
  const canSend = body.trim().length > 0 && !blocked && !pending && reel != null;

  const send = useCallback(async () => {
    if (!reel || !canSend) return;
    setPending(true);
    setError("");
    const failure = await askQuestion({ reelId: reel.id, creatorId: reel.creator_id, body, wants });
    setPending(false);
    if (failure) {
      setError(failure);
      if (failure === LIMIT_COPY) setLeft(0);
      return;
    }
    markMeaningfulAction();
    if (typeof left === "number") setLeft(Math.max(0, left - 1));
    setSent(wants);
  }, [body, canSend, left, reel, wants]);

  const goToInbox = useCallback(() => {
    const creator = reel?.creator_id;
    onClose();
    if (creator) router.push({ pathname: "/inbox/[creator]", params: { creator } });
  }, [onClose, reel?.creator_id]);

  if (sent)
    return (
      <BottomSheet visible={visible} onClose={onClose} title={`Sent to ${who}`} closeTestID={TID["ask-close"]} testID="ask-sheet">
        <Text testID="ask-sent" style={styles.sent} accessibilityRole="alert">
          {sentCopy(who, sent)}
        </Text>
        {typeof left === "number" ? <Text style={styles.muted}>{`${left} of ${DAILY_ASKS} questions left today`}</Text> : null}
        <Button
          testID="ask-go-inbox"
          label="Go to Inbox"
          icon={<Inbox size={tokens.space[5]} color={tokens.color.onAccent} />}
          onPress={goToInbox}
          style={styles.send}
        />
        <Button testID="ask-done" label="Done" variant="ghost" onPress={onClose} style={styles.done} />
      </BottomSheet>
    );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Ask ${who} about this reel`}
      closeTestID={TID["ask-close"]}
      testID="ask-sheet"
    >
      {reel ? <Text style={styles.about}>{`About “${reel.title}”`}</Text> : null}
      <TextInput
        testID={TID["ask-input"]}
        value={body}
        onChangeText={setBody}
        placeholder={PLACEHOLDER}
        placeholderTextColor={tokens.color.muted}
        multiline
        maxLength={isOwner ? OWNER_MAX : MEMBER_MAX}
        editable={!blocked && !pending}
        accessibilityLabel="Your question"
        style={styles.input}
      />
      <View style={styles.choices} accessibilityRole="radiogroup">
        <Text style={styles.legend}>{`How should ${who} answer?`}</Text>
        {CHOICES.map((choice) => {
          const selected = wants === choice.value;
          return (
            <PressableScale
              key={choice.value}
              testID={`ask-wants-${choice.value}`}
              onPress={() => setWants(choice.value)}
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ selected }}
              style={styles.choice}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.choiceLabel}>{choice.label}</Text>
            </PressableScale>
          );
        })}
      </View>
      {typeof left === "number" && !blocked ? (
        <Text style={styles.muted} accessibilityRole="text">{`${left} of ${DAILY_ASKS} questions left today`}</Text>
      ) : null}
      {blocked ? (
        <Text testID={TID["ask-limit"]} style={styles.error} accessibilityRole="alert">
          {LIMIT_COPY}
        </Text>
      ) : null}
      {error && !blocked ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        testID={TID["ask-send"]}
        label={pending ? "Sending…" : `Ask ${who}`}
        onPress={send}
        disabled={!canSend}
        busy={pending}
        style={styles.send}
      />
    </BottomSheet>
  );
}

export const AskSheet = memo(AskSheetImpl);

const styles = StyleSheet.create({
  about: { ...textStyle("bodySmall"), color: tokens.color.muted, marginBottom: tokens.space[3] },
  input: {
    ...textStyle("input"),
    color: tokens.color.text,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    padding: tokens.space[3],
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.lineStrong,
    backgroundColor: tokens.color.panel,
    textAlignVertical: "top",
  },
  choices: { marginTop: tokens.space[3], gap: tokens.space[1] },
  legend: { ...textStyle("bodySmall"), color: tokens.color.muted },
  choice: { flexDirection: "row", alignItems: "center", gap: tokens.space[3], minHeight: tokens.layout.minTouch },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: tokens.radius.pill,
    borderWidth: 2,
    borderColor: tokens.color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: tokens.color.accent },
  radioDot: { width: RADIO_DOT, height: RADIO_DOT, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accent },
  choiceLabel: { ...textStyle("body"), color: tokens.color.text },
  muted: { ...textStyle("bodySmall"), color: tokens.color.muted, marginTop: tokens.space[2] },
  error: { ...textStyle("bodySmall"), color: tokens.color.errorText, marginTop: tokens.space[2] },
  send: { marginTop: tokens.space[4] },
  done: { marginTop: tokens.space[2] },
  sent: { ...textStyle("body"), color: tokens.color.text },
});
