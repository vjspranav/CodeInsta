import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useUnreadCount } from "@/data/inbox";
import { TID } from "@/testids";
import { tokens } from "@/theme/tokens";
import { textStyle } from "@/ui/feed/styles";
import { MotionTabBar, type MotionTab } from "@/ui/motion/tabBar";
import { TAB_SPECS } from "@/ui/shell/AppTabBar";

/** Unread creator messages on the Inbox icon (same number web shows on the thread). */
function InboxBadge({ count }: { count: number }) {
  return (
    <Text testID={TID["inbox-badge"]} accessibilityLabel={`${count} unread messages`} style={styles.badge}>
      {count > 99 ? "99+" : count}
    </Text>
  );
}

/** Four tabs. The bar itself (sliding indicator, icon pop, selection haptic) is the motion kit's; this adds the Inbox badge. */
function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const count = useUnreadCount();
  const tabs: MotionTab[] = useMemo(
    () =>
      state.routes.flatMap((route) =>
        TAB_SPECS[route.name]
          ? [{ key: route.key, ...TAB_SPECS[route.name], badge: route.name === "inbox" && count > 0 ? <InboxBadge count={count} /> : undefined }]
          : [],
      ),
    [state.routes, count],
  );
  const activeKey = state.routes[state.index]?.key;
  return (
    <MotionTabBar
      tabs={tabs}
      activeIndex={Math.max(0, tabs.findIndex((tab) => tab.key === activeKey))}
      style={{ height: tokens.layout.navHeight + insets.bottom, paddingBottom: insets.bottom }}
      onSelect={(_index, tab) => {
        const event = emitter.emit({ type: "tabPress", target: tab.key, canPreventDefault: true });
        if (tab.key !== activeKey && !event.defaultPrevented) navigateToTab(tab.key);
      }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: tokens.color.paper } }}
    >
      <Tabs.Screen name="index" options={{ title: "Feed" }} />
      <Tabs.Screen name="explore" options={{ title: "Explore" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="profiles" options={{ title: "Profiles" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    ...textStyle("micro"),
    position: "absolute",
    top: tokens.space[1],
    left: "55%",
    minWidth: tokens.space[5],
    paddingHorizontal: tokens.space[1],
    borderRadius: tokens.radius.pill,
    overflow: "hidden",
    textAlign: "center",
    backgroundColor: tokens.color.accent,
    color: tokens.color.accentInk,
  },
});
