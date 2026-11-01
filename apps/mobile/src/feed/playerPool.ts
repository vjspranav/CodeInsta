import { preloadWindow } from "./preload";

export const POOL_SIZE = 3;
/** Reels kept loaded in players: the active one and the next two. The reel behind shares a slot with active+2. */
export const POOL_AHEAD = POOL_SIZE - 1;

/** Fixed slot for a reel. Slots are reused only once their reel has left the window. */
export function slotFor(index: number, poolSize = POOL_SIZE): number {
  return ((Math.trunc(index) % poolSize) + poolSize) % poolSize;
}

export type LoadState = "loading" | "ready" | "error";
export type Holder = { index: number; source: string; state: LoadState };
/** What a row sees for its (slot, source): "none" means the slot holds another reel. */
export type RowState = LoadState | "none";
export type SyncStep = { index: number; slot: number; source: string };

/**
 * Pure bookkeeping for the shared pool of players: which reel (and source) each slot holds.
 * It never creates players; the React side owns the 3 native players and applies the steps.
 */
export class PlayerPool {
  private slots: (Holder | null)[];
  private listeners = new Set<() => void>();

  constructor(readonly size = POOL_SIZE) {
    this.slots = Array.from({ length: size }, () => null);
  }

  holder(slot: number): Holder | null {
    return this.slots[slot] ?? null;
  }

  liveCount(): number {
    return this.slots.filter(Boolean).length;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  assign(index: number, source: string): { slot: number; replaced: boolean } {
    const slot = slotFor(index, this.size);
    const current = this.slots[slot];
    if (current && current.index === index && current.source === source) return { slot, replaced: false };
    this.slots[slot] = { index, source, state: "loading" };
    this.emit();
    return { slot, replaced: true };
  }

  /** State of `source` in `slot`, as a primitive so it can back useSyncExternalStore. */
  stateOf(slot: number, source: string): RowState {
    const h = this.slots[slot];
    return h && h.source === source ? h.state : "none";
  }

  /** Marks a load result. Ignored when the slot has since been given to another reel (late callback). */
  mark(slot: number, source: string, state: LoadState): void {
    const h = this.slots[slot];
    if (!h || h.source !== source || h.state === state) return;
    h.state = state;
    this.emit();
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Called when the pager settles on `active`. Returns the player replacements to perform, active
   * reel first, then the next ones. Reels without a source (bad rows) are skipped.
   */
  sync(active: number, sources: ReadonlyArray<string | null | undefined>): SyncStep[] {
    const steps: SyncStep[] = [];
    for (const index of preloadWindow(active, sources.length, POOL_AHEAD, 0)) {
      const source = sources[index];
      if (!source) continue;
      const { slot, replaced } = this.assign(index, source);
      if (replaced) steps.push({ index, slot, source });
    }
    return steps;
  }
}
