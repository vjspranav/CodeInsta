import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/useAuth";
import { registerAppStateRefresh } from "@/lib/supabase";
import { registerWidgetRefresh } from "@/widgets/sync";
import { usePushRegistration } from "@/push/usePushRegistration";

/**
 * Renders nothing. Session-scoped side effects of the root layout:
 * - token auto-refresh follows the app foreground state
 * - the TanStack cache is cleared when the session ends, so the next account never sees old data
 * - the widget background refresh is registered once after auth is ready
 * - push registration and notification tap routing (the hook waits for a meaningful action)
 */
export function SessionEffects({ queryClient }: { queryClient: QueryClient }) {
  const { status } = useAuth();
  const widgetsRegistered = useRef(false);
  usePushRegistration();

  useEffect(() => registerAppStateRefresh(), []);

  useEffect(() => {
    if (status === "signedOut") queryClient.clear();
  }, [status, queryClient]);

  useEffect(() => {
    if (status === "loading" || widgetsRegistered.current) return;
    widgetsRegistered.current = true;
    void registerWidgetRefresh();
  }, [status]);

  return null;
}
