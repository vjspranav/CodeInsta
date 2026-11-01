import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { env } from "./env";
import { secureStorage } from "./secure-storage";

export const db: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE is required for the iOS browser sign-in (exchangeCodeForSession); it does not affect
    // signInWithIdToken or email and password.
    flowType: "pkce",
  },
});

/**
 * Token auto-refresh runs only in the foreground (Supabase's recommendation for React Native).
 * Call once from the root layout; returns an unsubscribe function.
 */
export function registerAppStateRefresh(): () => void {
  const apply = (state: string | null | undefined) => {
    if (state === "active") void db.auth.startAutoRefresh();
    else void db.auth.stopAutoRefresh();
  };
  apply(AppState.currentState);
  const subscription = AppState.addEventListener("change", apply);
  return () => subscription.remove();
}
