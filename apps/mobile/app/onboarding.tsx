import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/useAuth";
import { LIBRARY_KEY, useLibrary } from "@/data/library";
import { saveInterests } from "@/data/interests";
import { MAX_ONBOARDING_REQUESTS, REQUEST_MAX, REQUEST_MIN, requestError } from "@/data/requests";
import { db } from "@/lib/supabase";
import { TID } from "@/testids";
import { haptic, tokens } from "@/theme/tokens";
import { EnterStagger } from "@/ui/motion/EnterStagger";
import { MorphButton } from "@/ui/motion/MorphButton";
import { PressableScale } from "@/ui/motion/PressableScale";
import { Screen } from "@/ui/Screen";
import { TextField } from "@/ui/TextField";

const SKELETON_CHIPS = 6;

export default function Onboarding() {
  const { user, refresh } = useAuth();
  const { library, error: loadError } = useLibrary();
  const client = useQueryClient();
  const [areas, setAreas] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requests = useMemo(
    () =>
      extra
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_ONBOARDING_REQUESTS),
    [extra],
  );
  const invalid = requests.some((r) => r.length < REQUEST_MIN || r.length > REQUEST_MAX);
  const userId = user?.id ?? "";

  const toggle = useCallback((slug: string) => {
    haptic("refresh");
    setAreas((prev) => (prev.includes(slug) ? prev.filter((a) => a !== slug) : [...prev, slug]));
  }, []);

  const go = useCallback(async () => {
    if (busy || !userId) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveInterests(userId, areas);
      if (saved) return setError(saved);
      if (requests.length) {
        const { error: insertError } = await db
          .from("topic_requests")
          .insert(requests.map((body) => ({ user_id: userId, body })));
        if (insertError) return setError(requestError(insertError));
      }
      await client.invalidateQueries({ queryKey: LIBRARY_KEY });
      // Status flips to ready; the route guard moves to the tabs.
      await refresh();
    } catch {
      setError("Could not save your interests. Try again.");
    } finally {
      setBusy(false);
    }
  }, [areas, busy, client, refresh, requests, userId]);

  const categories = library?.categories ?? [];
  const message = error || (invalid ? `Each request needs ${REQUEST_MIN}-${REQUEST_MAX} characters.` : "") || loadError;

  return (
    <Screen scroll style={styles.content}>
      <EnterStagger>
        <View key="header" style={styles.header}>
          <Text style={styles.muted}>Welcome to CodeInsta</Text>
          <Text accessibilityRole="header" style={styles.title}>
            What do you want to learn?
          </Text>
          <Text style={styles.muted}>Pick a few. Your feed starts with these, and you can change them any time.</Text>
        </View>

        <View key="chips" style={styles.chips} accessibilityLabel="Topics you want to learn">
          {library
            ? categories.map((info) => {
                const on = areas.includes(info.slug);
                return (
                  <PressableScale
                    key={info.slug}
                    testID={`interest-${info.slug}`}
                    onPress={() => toggle(info.slug)}
                    accessibilityRole="checkbox"
                    accessibilityLabel={info.label}
                    accessibilityState={{ checked: on }}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={styles.chipLabel}>{info.label}</Text>
                    <Text style={styles.chipNote}>{info.description}</Text>
                  </PressableScale>
                );
              })
            : Array.from({ length: SKELETON_CHIPS }, (_, i) => <View key={i} style={[styles.chip, styles.skeleton]} />)}
        </View>

        <View key="extra" style={styles.extra}>
          <TextField
            label={`What else do you want to learn? (optional, up to ${MAX_ONBOARDING_REQUESTS}, one per line)`}
            value={extra}
            onChangeText={setExtra}
            multiline
            numberOfLines={3}
            placeholder={"How does ART compile apps?\nWhy is io_uring fast?"}
          />
        </View>

        <View key="save" style={styles.save}>
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
          <MorphButton
            testID={TID["onboarding-save"]}
            label={areas.length ? "Start learning" : "Pick at least one topic"}
            busy={busy}
            disabled={!userId || areas.length === 0 || invalid}
            onPress={() => void go()}
          />
        </View>
      </EnterStagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: tokens.space[6], gap: tokens.space[6] },
  header: { gap: tokens.space[2] },
  muted: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.body.fontFamily,
    fontSize: tokens.type.body.fontSize,
    lineHeight: tokens.type.body.lineHeight,
  },
  title: {
    color: tokens.color.ink,
    fontFamily: tokens.type.title.fontFamily,
    fontSize: tokens.type.title.fontSize,
    lineHeight: tokens.type.title.lineHeight,
    fontWeight: tokens.type.title.fontWeight,
    letterSpacing: tokens.type.title.letterSpacing,
  },
  chips: { gap: tokens.space[2] },
  chip: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.panel,
    padding: tokens.space[4],
    gap: tokens.space[1],
    minHeight: tokens.layout.controlHeight,
  },
  chipOn: { borderColor: tokens.color.accent, backgroundColor: tokens.color.surface },
  skeleton: { height: 72, backgroundColor: tokens.color.surface, borderColor: tokens.color.surface },
  chipLabel: {
    color: tokens.color.ink,
    fontFamily: tokens.type.body.fontFamily,
    fontSize: tokens.type.body.fontSize,
    fontWeight: "600",
  },
  chipNote: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.meta.fontFamily,
    fontSize: tokens.type.meta.fontSize,
  },
  extra: { gap: tokens.space[1] },
  save: { gap: tokens.space[3] },
  error: {
    color: tokens.color.danger,
    fontFamily: tokens.type.bodySmall.fontFamily,
    fontSize: tokens.type.bodySmall.fontSize,
    minHeight: tokens.type.bodySmall.lineHeight,
  },
});
