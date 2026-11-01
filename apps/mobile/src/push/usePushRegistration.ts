import { useEffect, useRef, useSyncExternalStore } from "react";
import { router, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/auth/useAuth";
import { isEngaged, loadEngaged, registerPush, subscribeEngaged } from "./register";
import { routeFromNotification } from "./routing";

let handlerSet = false;
function ensureForegroundHandler() {
  if (handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Push is optional: never fail the app shell.
  }
}

/**
 * Call once from the root layout inside AuthProvider. Registers the device once the member is
 * ready AND has done their first meaningful action (markMeaningfulAction), and routes taps on a
 * notification (including the one that cold-started the app) to a safe in-app screen.
 */
export function usePushRegistration(): void {
  const { status, user } = useAuth();
  const userId = status === "ready" ? (user?.id ?? null) : null;
  const engaged = useSyncExternalStore(subscribeEngaged, isEngaged, isEngaged);

  useEffect(() => {
    ensureForegroundHandler();
    void loadEngaged();
  }, []);

  useEffect(() => {
    if (userId && engaged) void registerPush(userId);
  }, [userId, engaged]);

  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const route = routeFromNotification(response.notification.request.content.data);
    if (route) router.navigate(route as Href);
  }, [response, userId]);
}
