/**
 * Tab bar motion. Framework-agnostic on purpose: the shell (Task 2.7) maps expo-router's `tabBar`
 * props (state.index, state.routes, navigation.navigate) onto `MotionTabBar`, or uses the pieces
 * (`TabIndicator`, `TabIconPop`, `useTabIndicator`, `tabSelectHaptic`) inside its own bar.
 */
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { haptic, springs, timings, tokens } from "@/theme/tokens";
import { PressableScale } from "./PressableScale";
import { useReducedMotion } from "./reducedMotion";

export const TAB_ICON_POP_SCALE = 1.12;

/** Selection haptic for a tab change (the token map's `selection` kind). */
export function tabSelectHaptic(): void {
  haptic("refresh");
}

/** x offset of the indicator for tab `index` when each tab is `tabWidth` wide. */
export function indicatorX(index: number, tabWidth: number): number {
  return Math.max(0, index) * tabWidth;
}

/**
 * Spring-driven indicator position (feed spring). Returns an animated style with `width` and
 * `translateX`; render it on an `Animated.View`. Reduce Motion: a short timing instead of a spring.
 * The first measurement jumps (no slide-in from zero).
 */
export function useTabIndicator(index: number, count: number, totalWidth: number) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const measured = useRef(false);
  const tabWidth = count > 0 ? totalWidth / count : 0;

  useEffect(() => {
    if (tabWidth <= 0) return;
    const target = indicatorX(index, tabWidth);
    if (!measured.current) {
      measured.current = true;
      x.value = target;
      return;
    }
    x.value = reduced ? withTiming(target, timings.fast) : withSpring(target, springs.feed);
  }, [index, tabWidth, reduced, x]);

  return useAnimatedStyle(() => ({
    width: tabWidth,
    transform: [{ translateX: x.value }],
  }));
}

export type TabIndicatorProps = {
  index: number;
  count: number;
  /** Width of the whole bar (from onLayout). */
  width: number;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A thin bar that slides under the active tab. Position it along the bar's top or bottom edge. */
export function TabIndicator({
  index,
  count,
  width,
  height = 2,
  color = tokens.color.accent,
  style,
  testID,
}: TabIndicatorProps) {
  const animated = useTabIndicator(index, count, width);
  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[{ position: "absolute", top: 0, left: 0, height, backgroundColor: color }, style, animated]}
    />
  );
}

/**
 * Wraps a tab icon: when `focused` turns true the icon pops 1 -> 1.12 -> 1 on the like spring.
 * Does not pop on first render. Reduce Motion: no scale. The selection haptic is fired by the tab
 * press (`tabSelectHaptic`), not here, so programmatic tab changes stay silent.
 */
export function TabIconPop({ focused, children }: { focused: boolean; children?: ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!focused || reduced) return;
    scale.value = withSequence(withSpring(TAB_ICON_POP_SCALE, springs.like), withSpring(1, springs.like));
  }, [focused, reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export type MotionTab = {
  key: string;
  label: string;
  /** Render the icon (lucide) for the given state. */
  icon: (focused: boolean) => ReactNode;
  testID?: string;
  badge?: ReactNode;
};

export type MotionTabBarProps = {
  tabs: MotionTab[];
  activeIndex: number;
  onSelect: (index: number, tab: MotionTab) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Complete bottom bar: sliding indicator, icon pop, press-scale and a selection haptic when the
 * selected tab changes. Pass it to expo-router `<Tabs tabBar={...}>` through a small adapter.
 */
export function MotionTabBar({ tabs, activeIndex, onSelect, style, testID }: MotionTabBarProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View testID={testID} onLayout={onLayout} style={[styles.bar, style]}>
      <TabIndicator
        index={activeIndex}
        count={tabs.length}
        width={width}
        testID={testID ? `${testID}-indicator` : undefined}
      />
      {tabs.map((tab, i) => {
        const focused = i === activeIndex;
        return (
          <PressableScale
            key={tab.key}
            testID={tab.testID}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
            style={styles.tab}
            onPress={() => {
              if (!focused) tabSelectHaptic();
              onSelect(i, tab);
            }}
          >
            <TabIconPop focused={focused}>{tab.icon(focused)}</TabIconPop>
            <Text style={[styles.label, { color: focused ? tokens.color.ink : tokens.color.inkMuted }]}>
              {tab.label}
            </Text>
            {tab.badge}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: tokens.layout.navHeight,
    backgroundColor: tokens.color.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.line,
    zIndex: tokens.z.bottomNav,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space[1] },
  label: {
    fontFamily: tokens.type.nav.fontFamily,
    fontSize: tokens.type.nav.fontSize,
    fontWeight: tokens.type.nav.fontWeight,
  },
});
