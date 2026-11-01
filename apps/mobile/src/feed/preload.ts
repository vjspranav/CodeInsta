/**
 * Indices to keep warm around the active reel, clamped to `[0, length)`, ascending.
 * Handles empty and tiny libraries (0, 1, 2 reels) and an out-of-range `active`.
 */
export function preloadWindow(active: number, length: number, ahead = 2, behind = 1): number[] {
  if (!Number.isFinite(length) || length <= 0) return [];
  const center = Math.min(Math.max(Math.trunc(active) || 0, 0), length - 1);
  const from = Math.max(center - Math.max(behind, 0), 0);
  const to = Math.min(center + Math.max(ahead, 0), length - 1);
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}
