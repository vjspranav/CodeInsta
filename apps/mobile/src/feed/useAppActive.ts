import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

const subscribe = (cb: () => void) => {
  const sub = AppState.addEventListener("change", cb);
  return () => sub.remove();
};
const snapshot = () => AppState.currentState === "active";

/** True while the app is in the foreground. Background pauses every reel. */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
