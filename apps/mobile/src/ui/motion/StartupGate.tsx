import * as SplashScreen from "expo-splash-screen";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { timings, tokens } from "@/theme/tokens";
import { AnimatedLogo } from "./AnimatedLogo";
import { useReducedMotion } from "./reducedMotion";
import { LOGO_SETTLE_MS, msUntilReveal, STARTUP_EXTRA_CAP_MS } from "./startupTiming";
import { holdStartup, markStartupRevealed } from "./startupReveal";

// Keep the native splash up until the in-app logo has laid out. Module scope so it runs before the
// first render. Rejects when the splash is already gone (fast refresh): nothing to do then.
SplashScreen.preventAutoHideAsync().catch(() => {});

export type StartupGateProps = {
  /** True once the session and the first screen's data are ready (first reel poster for the feed). */
  ready: boolean;
  children?: ReactNode;
  testID?: string;
};

/**
 * Startup handoff: native splash (same paper color, no image) -> in-app AnimatedLogo that draws and
 * settles -> crossfade to `children` as soon as `ready` is true. The children mount underneath from
 * the first render so their loading overlaps the animation. Never holds the logo longer than
 * STARTUP_EXTRA_CAP_MS after its first layout: past that the app is revealed regardless and the
 * first screen shows its own skeleton.
 */
export function StartupGate({ ready, children, testID }: StartupGateProps) {
  const reduced = useReducedMotion();
  const [laidOut, setLaidOut] = useState(false);
  // Hold before the children's first render, so their playback effects already see the hold.
  const [revealed, setRevealed] = useState(() => {
    holdStartup();
    return false;
  });
  const [logoGone, setLogoGone] = useState(false);
  const laidOutAt = useRef(0);
  const fade = useSharedValue(0);

  const markLaidOut = useCallback(() => {
    if (laidOutAt.current) return;
    laidOutAt.current = Date.now();
    SplashScreen.hideAsync().catch(() => {});
    setLaidOut(true);
  }, []);

  // If the logo never reports a layout, do not leave the user on the native splash forever: hide it
  // and reveal the app at the hard cap.
  useEffect(() => {
    const t = setTimeout(() => {
      if (laidOutAt.current) return;
      markLaidOut();
      setRevealed(true);
    }, STARTUP_EXTRA_CAP_MS);
    return () => clearTimeout(t);
  }, [markLaidOut]);

  useEffect(() => {
    if (!laidOut || revealed) return;
    const wait = msUntilReveal({
      ready,
      elapsedMs: Date.now() - laidOutAt.current,
      settleMs: reduced ? 0 : LOGO_SETTLE_MS,
    });
    const t = setTimeout(() => setRevealed(true), wait);
    return () => clearTimeout(t);
  }, [laidOut, ready, revealed, reduced]);

  const onFaded = useCallback(() => setLogoGone(true), []);

  useEffect(() => {
    if (!revealed) return;
    markStartupRevealed();
    fade.value = withTiming(1, reduced ? timings.fast : timings.base, (finished) => {
      "worklet";
      if (finished) scheduleOnRN(onFaded);
    });
  }, [revealed, reduced, fade, onFaded]);

  const logoStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));
  const appStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <View testID={testID} style={styles.root}>
      {/* Mounted from the start so the session, data and first reel load during the logo;
          invisible, untouchable and hidden from screen readers until revealed. */}
      <Animated.View
        testID={testID ? `${testID}-app` : undefined}
        pointerEvents={revealed ? "auto" : "none"}
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? "auto" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, appStyle]}
      >
        {children}
      </Animated.View>
      {logoGone ? null : (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.logoLayer, logoStyle]}
          testID={testID ? `${testID}-logo` : undefined}
        >
          <AnimatedLogo testID={testID ? `${testID}-mark` : undefined} onLayout={markLaidOut} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.paper },
  logoLayer: { alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.paper },
});
