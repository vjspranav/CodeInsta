import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/useAuth";
import { TID } from "@/testids";
import { tokens } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { EnterStagger } from "@/ui/motion/EnterStagger";
import { MorphButton } from "@/ui/motion/MorphButton";
import { ShakeOnError } from "@/ui/motion/ShakeOnError";
import { Screen } from "@/ui/Screen";
import { TextField } from "@/ui/TextField";

export default function Join() {
  const { redeemInvite, signOut, error: authError } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = error || authError;

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setError(await redeemInvite(code));
    } catch {
      setError("Could not redeem your invite. Please retry.");
    } finally {
      setBusy(false);
    }
  }, [busy, code, redeemInvite]);

  return (
    <Screen scroll style={styles.content}>
      <EnterStagger>
        <View key="intro" style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>
            Join CodeInsta
          </Text>
          <Text style={styles.body}>Enter an invite from a friend to start watching.</Text>
        </View>
        <View key="form" style={styles.form}>
          <TextField
            label="Invite code"
            testID={TID["join-code"]}
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          <ShakeOnError trigger={shown}>
            <Text accessibilityRole="alert" testID={TID["join-error"]} style={styles.error}>
              {shown}
            </Text>
          </ShakeOnError>
          <MorphButton testID={TID["join-submit"]} label="Join" busy={busy} onPress={() => void submit()} />
        </View>
        <Button key="signout" variant="ghost" label="Sign out" onPress={() => void signOut()} />
      </EnterStagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: tokens.space[8], gap: tokens.space[6] },
  intro: { gap: tokens.space[2] },
  title: {
    color: tokens.color.ink,
    fontFamily: tokens.type.title.fontFamily,
    fontSize: tokens.type.title.fontSize,
    lineHeight: tokens.type.title.lineHeight,
    fontWeight: tokens.type.title.fontWeight,
    letterSpacing: tokens.type.title.letterSpacing,
  },
  body: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.body.fontFamily,
    fontSize: tokens.type.body.fontSize,
    lineHeight: tokens.type.body.lineHeight,
  },
  form: { gap: tokens.space[3] },
  error: {
    color: tokens.color.danger,
    fontFamily: tokens.type.bodySmall.fontFamily,
    fontSize: tokens.type.bodySmall.fontSize,
    minHeight: tokens.type.bodySmall.lineHeight,
  },
});
