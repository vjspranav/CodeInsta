import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { db } from "@/lib/supabase";
import { secureStorage } from "@/lib/secure-storage";

export type PushResult = "registered" | "denied" | "unsupported";

/** Where this device's Expo token is remembered, so sign-out can delete exactly its row. */
const TOKEN_KEY = "codeinsta.push.token";
/** Set once the member has done something meaningful; push is never asked for before that. */
const ENGAGED_KEY = "codeinsta.push.engaged";

function projectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * Asks for permission (only if not yet decided), gets the Expo push token and upserts
 * `{ user_id, token, platform }` into push_tokens. Never throws: any failure, including iOS on
 * a free Apple ID without the push entitlement or Android before FCM credentials exist,
 * returns "unsupported" silently.
 */
export async function registerPush(userId: string): Promise<PushResult> {
  try {
    if (Platform.OS !== "android" && Platform.OS !== "ios") return "unsupported";
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return "denied";

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    const { error } = await db
      .from("push_tokens")
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: "user_id,token" });
    if (error) return "unsupported";
    await secureStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    return "registered";
  } catch {
    return "unsupported";
  }
}

/**
 * Deletes this device's row. Call it BEFORE the session is cleared (RLS needs the session).
 * Best effort: never throws.
 */
export async function unregisterPush(userId: string): Promise<void> {
  try {
    const token = await secureStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await db.from("push_tokens").delete().eq("user_id", userId).eq("token", token);
    await secureStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sign-out must never fail because of push cleanup; a dead token is pruned by the edge function.
  }
}

// ---- First meaningful action gate (permission prompt never fires on cold start) ----

let engaged = false;
let loaded = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export function isEngaged(): boolean {
  return engaged;
}

export function subscribeEngaged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Read the persisted flag once per process. */
export async function loadEngaged(): Promise<boolean> {
  if (!loaded) {
    loaded = true;
    try {
      if ((await secureStorage.getItem(ENGAGED_KEY)) === "1" && !engaged) {
        engaged = true;
        notify();
      }
    } catch {
      // Treat an unreadable store as "not yet".
    }
  }
  return engaged;
}

/**
 * Call after the member's first ask, request or similar meaningful action. The first call flips
 * the gate (usePushRegistration then asks for permission); later calls are no-ops.
 */
export function markMeaningfulAction(): void {
  if (engaged) return;
  engaged = true;
  notify();
  void secureStorage.setItem(ENGAGED_KEY, "1").catch(() => undefined);
}

/** Test helper. */
export function resetPushStateForTests(): void {
  engaged = false;
  loaded = false;
  listeners.clear();
}
