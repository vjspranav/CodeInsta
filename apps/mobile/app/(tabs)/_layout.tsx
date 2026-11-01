import { Tabs } from "expo-router";
import { tokens } from "@/theme/tokens";
import { AppTabBar } from "@/ui/shell/AppTabBar";

/** Four tabs. The bar itself (sliding indicator, icon pop, selection haptic) is the motion kit's. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: tokens.color.paper } }}
    >
      <Tabs.Screen name="index" options={{ title: "Feed" }} />
      <Tabs.Screen name="explore" options={{ title: "Explore" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="profiles" options={{ title: "Profiles" }} />
    </Tabs>
  );
}
