import { AppState } from "react-native";
import { focusManager, QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Library data stays fresh for 5 minutes (web parity); because the
 * app-foreground event is wired to `focusManager` below, returning to the app after that window
 * refetches in the background while the cached feed keeps rendering.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

// React Native has no window focus; map AppState "active" to it. The listener is installed lazily
// by TanStack when the first query subscribes, and removed with the last one.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener("change", (state) => {
    handleFocus(state === "active");
  });
  return () => subscription.remove();
});
