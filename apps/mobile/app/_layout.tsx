import "@/perf/probe";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/auth/useAuth";
import { queryClient } from "@/lib/queryClient";
import { tokens } from "@/theme/tokens";
import { useReducedMotion } from "@/ui/motion/reducedMotion";
import { fadeScreenOptions, stackScreenOptions } from "@/ui/motion/screenOptions";
import { StartupGate } from "@/ui/motion/StartupGate";
import { SessionEffects } from "@/ui/shell/SessionEffects";

/**
 * One Stack, one guarded group per auth status (Stack.Protected redirects to the group that is
 * allowed). Auth swaps (login to the app, join, onboarding) crossfade; pushes inside the app use
 * the motion kit's native stack presets.
 */
function RootNavigator() {
  const { status } = useAuth();
  const reduced = useReducedMotion();
  const fade = fadeScreenOptions();
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          ...stackScreenOptions({ reduced }),
          contentStyle: { backgroundColor: tokens.color.paper },
        }}
      >
        {/* `loading` keeps the login group mounted so the navigator is never empty; the startup
            logo covers it until the session state is known. */}
        <Stack.Protected guard={status === "signedOut" || status === "loading"}>
          <Stack.Screen name="login" options={fade} />
        </Stack.Protected>
        <Stack.Protected guard={status === "needsInvite"}>
          <Stack.Screen name="join" options={fade} />
        </Stack.Protected>
        <Stack.Protected guard={status === "needsOnboarding"}>
          <Stack.Screen name="onboarding" options={fade} />
        </Stack.Protected>
        <Stack.Protected guard={status === "ready"}>
          <Stack.Screen name="(tabs)" options={fade} />
          <Stack.Screen name="reel/[id]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="interests" />
          <Stack.Screen name="requests" />
          <Stack.Screen name="admin/requests" />
          <Stack.Screen name="admin/invites" />
        </Stack.Protected>
        {/* Public pages, like the web's /about and /privacy. Declared last so a fresh launch never
            lands on them: every screen must be listed here, or expo-router adds it unguarded. */}
        <Stack.Screen name="about" />
        <Stack.Screen name="privacy" />
      </Stack>
    </>
  );
}

/** Startup handoff: native splash, animated logo, crossfade to the app once the session is known. */
function Shell() {
  const { status } = useAuth();
  return (
    <>
      <SessionEffects queryClient={queryClient} />
      <StartupGate ready={status !== "loading"}>
        <RootNavigator />
      </StartupGate>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: tokens.color.paper } });
