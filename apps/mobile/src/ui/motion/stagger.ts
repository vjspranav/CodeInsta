import { durations } from "@/theme/tokens";

/** Only the first six children animate in: anything further down is below the fold. */
export const STAGGER_CAP = 6;
/** Per-child delay: the shared `instant` duration token. */
export const STAGGER_STEP_MS = durations.instant;
/** Offset each child starts from (px), animated to 0. */
export const STAGGER_OFFSET_Y = 12;

/** Delay in ms before child `index` starts entering. */
export function staggerDelay(index: number, step: number = STAGGER_STEP_MS): number {
  return Math.max(0, index) * step;
}

/**
 * Whether child `index` animates. Only children that exist on the first mount (`initialCount`)
 * and sit inside the cap enter; children appended later by a re-render just appear.
 */
export function shouldStagger(index: number, initialCount: number, cap: number = STAGGER_CAP): boolean {
  return index >= 0 && index < Math.min(initialCount, cap);
}
