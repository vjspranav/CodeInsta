import { durations } from "@/theme/tokens";

/**
 * Hard cap on the extra time the startup gate may spend on the logo after it is first rendered
 * (decisions.md 2026-11-02: never block longer than needed).
 */
export const STARTUP_EXTRA_CAP_MS = 1200;

/** How long the logo settle animation takes (stroke draw, fill, glyph). Below the cap by design. */
export const LOGO_SETTLE_MS = durations.slow + durations.base + durations.instant;

/**
 * Milliseconds still to wait before the logo crossfades to the app, measured from the logo's first
 * layout. `elapsedMs` is the time since that layout.
 *
 * - ready: wait for the settle to finish (never past the cap)
 * - not ready: wait up to the cap, then reveal anyway (the first screen shows its own skeleton)
 * - reduced motion: no settle, so a ready app reveals at once
 *
 * Always finite, always <= STARTUP_EXTRA_CAP_MS - elapsedMs (floored at 0).
 */
export function msUntilReveal(opts: {
  ready: boolean;
  elapsedMs: number;
  settleMs?: number;
  capMs?: number;
}): number {
  const cap = opts.capMs ?? STARTUP_EXTRA_CAP_MS;
  const settle = Math.min(opts.settleMs ?? LOGO_SETTLE_MS, cap);
  const target = opts.ready ? settle : cap;
  return Math.max(0, target - Math.max(0, opts.elapsedMs));
}
