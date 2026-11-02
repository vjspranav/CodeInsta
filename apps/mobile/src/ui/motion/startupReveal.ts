import { useSyncExternalStore } from "react";
import { perf } from "@/perf/probe";

/**
 * Whether the startup logo has handed off to the app. The app mounts under the logo so its data and
 * first reel load during the animation; playback waits for this so nothing plays unseen.
 * Without a StartupGate (tests, screens rendered alone) it is always true.
 */
let revealed = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Called by StartupGate before its children first render. */
export function holdStartup(): void {
  if (!revealed) return;
  revealed = false;
  perf.hold();
  emit();
}

/** Called by StartupGate when the crossfade to the app starts. */
export function markStartupRevealed(): void {
  if (revealed) return;
  revealed = true;
  perf.revealed();
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStartupRevealed(): boolean {
  return useSyncExternalStore(subscribe, () => revealed);
}
