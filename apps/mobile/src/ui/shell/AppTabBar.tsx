import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Compass, House, MessageCircle, Users } from "lucide-react-native";
import { TID } from "@/testids";
import { tokens } from "@/theme/tokens";
import { MotionTabBar, type MotionTab } from "@/ui/motion/tabBar";

type TabSpec = Omit<MotionTab, "key">;

const iconColor = (focused: boolean) => (focused ? tokens.color.ink : tokens.color.inkMuted);

/** The four tabs, keyed by route name. Order on screen follows the router's route order. */
export const TAB_SPECS: Record<string, TabSpec> = {
  index: {
    label: "Feed",
    testID: TID["tab-feed"],
    icon: (focused) => <House color={iconColor(focused)} size={24} />,
  },
  explore: {
    label: "Explore",
    testID: TID["tab-explore"],
    icon: (focused) => <Compass color={iconColor(focused)} size={24} />,
  },
  inbox: {
    label: "Inbox",
    testID: TID["tab-inbox"],
    icon: (focused) => <MessageCircle color={iconColor(focused)} size={24} />,
  },
  profiles: {
    label: "Profiles",
    testID: TID["tab-profiles"],
    icon: (focused) => <Users color={iconColor(focused)} size={24} />,
  },
};

/** Adapts expo-router's `tabBar` props to the motion kit's bar (sliding indicator, icon pop, haptic). */
export function AppTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const tabs: MotionTab[] = state.routes.flatMap((route) =>
    TAB_SPECS[route.name] ? [{ key: route.key, ...TAB_SPECS[route.name] }] : [],
  );
  const activeKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeKey),
  );

  return (
    <MotionTabBar
      tabs={tabs}
      activeIndex={activeIndex}
      style={{ height: tokens.layout.navHeight + insets.bottom, paddingBottom: insets.bottom }}
      onSelect={(_index, tab) => {
        const event = emitter.emit({ type: "tabPress", target: tab.key, canPreventDefault: true });
        if (tab.key !== activeKey && !event.defaultPrevented) navigateToTab(tab.key);
      }}
    />
  );
}
