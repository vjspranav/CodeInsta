import { requireOptionalNativeModule } from "expo";

type NativeWidgetBridge = {
  setSnapshot(json: string): void;
  clearSnapshot(): void;
  reloadWidgets(): void;
};

// Null on web, in Expo Go, and in jest: every call then becomes a no-op.
const native = requireOptionalNativeModule<NativeWidgetBridge>("CodeInstaWidgetBridge");

/**
 * Widget plumbing is best effort: a failing native call must never break the feed or sign-out,
 * so each wrapper swallows errors and reports success as a boolean.
 */
function safely(fn: ((bridge: NativeWidgetBridge) => void) | null): boolean {
  if (!native || !fn) return false;
  try {
    fn(native);
    return true;
  } catch {
    return false;
  }
}

/** Android: SharedPreferences `codeinsta_widget`/`snapshot`. iOS: App Group UserDefaults `snapshot`. Then reloads widgets. */
export function setSnapshot(json: string): boolean {
  return safely((b) => b.setSnapshot(json));
}

export function clearSnapshot(): boolean {
  return safely((b) => b.clearSnapshot());
}

export function reloadWidgets(): boolean {
  return safely((b) => b.reloadWidgets());
}
