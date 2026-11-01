import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CodeXml } from "lucide-react-native";
import { useAuth } from "@/auth/useAuth";
import { TID } from "@/testids";
import { haptic, tokens } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { EnterStagger } from "@/ui/motion/EnterStagger";
import { MorphButton } from "@/ui/motion/MorphButton";
import { PressableScale } from "@/ui/motion/PressableScale";
import { ShakeOnError } from "@/ui/motion/ShakeOnError";
import { Screen } from "@/ui/Screen";
import { TextField } from "@/ui/TextField";

type Mode = "signin" | "signup";

const GOOGLE_FAILED = "Google sign-in failed or expired. Please try again.";
const INVITE_REQUIRED = "Enter an invite code to create an account.";

export default function Login() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  // An offline cold start lands here with a message from the auth state.
  const shown = error || auth.error;

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError("");
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    haptic("refresh");
    const address = email.trim();
    if (!address || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (signup && !invite.trim()) {
      setError(INVITE_REQUIRED);
      return;
    }
    setBusy(true);
    setError("");
    try {
      let message: string;
      if (!signup) message = await auth.signInWithPassword(address, password);
      else message = await auth.signUpWithInvite(address, password, invite.trim());
      setError(message);
    } catch {
      setError("Could not reach CodeInsta. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [auth, busy, email, invite, password, signup]);

  const google = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await auth.signInWithGoogle();
      if (!result.ok && result.reason === "failed") setError(GOOGLE_FAILED);
    } catch {
      setError(GOOGLE_FAILED);
    } finally {
      setBusy(false);
    }
  }, [auth, busy]);

  return (
    <Screen scroll style={styles.content}>
      <EnterStagger>
        <View key="brand" style={styles.brand}>
          <CodeXml color={tokens.color.ink} size={32} />
          <Text style={styles.brandText}>codeinsta</Text>
        </View>

        <View key="intro" style={styles.intro}>
          <Text style={styles.kicker}>Your next scroll could teach you something.</Text>
          <Text accessibilityRole="header" style={styles.headline}>
            Less scrolling.{"\n"}More <Text style={styles.headlineAccent}>understanding.</Text>
          </Text>
          <Text style={styles.body}>Systems, one reel at a time.{"\n"}Built by Claude. Debugged with GPT.</Text>
        </View>

        <View key="modes" style={styles.modes}>
          <ModeTab
            label="Sign in"
            selected={!signup}
            testID={signup ? TID["login-toggle"] : undefined}
            onPress={() => switchMode("signin")}
          />
          <ModeTab
            label="Create account"
            selected={signup}
            testID={signup ? undefined : TID["login-toggle"]}
            onPress={() => switchMode("signup")}
          />
        </View>

        <View key="form" style={styles.form}>
          <TextField
            label="Email"
            testID={TID["login-email"]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <TextField
            label="Password"
            testID={TID["login-password"]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={signup ? "new-password" : "current-password"}
            textContentType={signup ? "newPassword" : "password"}
            placeholder="At least 8 characters"
          />
          {signup ? (
            <TextField
              label="Invite code"
              testID={TID["join-code"]}
              value={invite}
              onChangeText={setInvite}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              hint="Required unless you are an owner."
            />
          ) : null}
          <ShakeOnError trigger={shown}>
            <Text accessibilityRole="alert" testID={TID["login-error"]} style={styles.error}>
              {shown}
            </Text>
          </ShakeOnError>
          <MorphButton
            testID={TID["login-submit"]}
            label={signup ? "Create account" : "Sign in"}
            busy={busy}
            onPress={() => void submit()}
          />
        </View>

        <View key="google" style={styles.google}>
          <Button
            testID={TID["login-google"]}
            variant="secondary"
            label="Continue with Google"
            busy={busy}
            onPress={() => void google()}
          />
          {signup ? <Text style={styles.hint}>New Google users need an invite code after signing in.</Text> : null}
        </View>

        <Text key="footer" style={styles.hint}>
          A private space for curious engineers.
        </Text>
      </EnterStagger>
    </Screen>
  );
}

function ModeTab({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.modeTab, selected && styles.modeTabSelected]}
    >
      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: tokens.space[6], gap: tokens.space[6] },
  brand: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
  brandText: {
    color: tokens.color.ink,
    fontFamily: tokens.type.brand.fontFamily,
    fontSize: tokens.type.brand.fontSize,
    fontWeight: tokens.type.brand.fontWeight,
    letterSpacing: tokens.type.brand.letterSpacing,
  },
  intro: { gap: tokens.space[3] },
  kicker: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.meta.fontFamily,
    fontSize: tokens.type.meta.fontSize,
  },
  headline: {
    color: tokens.color.ink,
    fontFamily: tokens.type.display.fontFamily,
    fontSize: tokens.type.display.fontSize,
    lineHeight: tokens.type.display.lineHeight,
    fontWeight: tokens.type.display.fontWeight,
    letterSpacing: tokens.type.display.letterSpacing,
  },
  headlineAccent: { color: tokens.color.accent },
  body: {
    color: tokens.color.ink,
    fontFamily: tokens.type.body.fontFamily,
    fontSize: tokens.type.body.fontSize,
    lineHeight: tokens.type.body.lineHeight,
  },
  modes: {
    flexDirection: "row",
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    padding: tokens.space[1],
  },
  modeTab: {
    flex: 1,
    minHeight: tokens.layout.minTouch,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  modeTabSelected: { backgroundColor: tokens.color.surfaceRaised },
  modeLabel: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.bodySmall.fontFamily,
    fontSize: tokens.type.bodySmall.fontSize,
    fontWeight: "600",
  },
  modeLabelSelected: { color: tokens.color.ink },
  form: { gap: tokens.space[3] },
  error: {
    color: tokens.color.danger,
    fontFamily: tokens.type.bodySmall.fontFamily,
    fontSize: tokens.type.bodySmall.fontSize,
    minHeight: tokens.type.bodySmall.lineHeight,
  },
  google: { gap: tokens.space[2] },
  hint: {
    color: tokens.color.inkMuted,
    fontFamily: tokens.type.caption.fontFamily,
    fontSize: tokens.type.caption.fontSize,
    textAlign: "center",
  },
});
