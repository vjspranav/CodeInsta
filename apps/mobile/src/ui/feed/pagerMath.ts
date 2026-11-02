/**
 * Pure math for the feed pager. Every function is a worklet so the pan gesture can call it on the
 * UI thread; they are also plain functions, so they are unit-tested in jest.
 */

/** Fraction of one page the finger (plus projected momentum) must travel to turn the page. */
export const TURN_FRACTION = 0.25;
/** Seconds of release velocity projected into the decision (a short flick turns the page). */
export const FLING_PROJECTION_S = 0.15;
/** Share of the finger movement that reaches the page while pulling past the first or last reel. */
export const OVERSCROLL_RESISTANCE = 0.4;

/** Largest translateY (first page) is 0; the smallest is the last page's offset. */
export function pageOffset(index: number, height: number): number {
  "worklet";
  return -index * height;
}

/**
 * Next translateY while dragging: follows the finger one to one inside the list and with
 * resistance once the content is past either end.
 */
export function dragOffset(current: number, change: number, min: number, max: number): number {
  "worklet";
  const outside = current > max || current < min;
  return current + (outside ? change * OVERSCROLL_RESISTANCE : change);
}

export type TargetInput = {
  /** Current translateY. */
  offset: number;
  /** The page the pager was resting on or heading to when this drag began. */
  base: number;
  /** Release velocity on Y in px/s (negative = finger moving up = toward the next reel). */
  velocityY: number;
  height: number;
  count: number;
  /** Pages the pager may land on: a fast second swipe can never outrun the mounted window. */
  minIndex: number;
  maxIndex: number;
};

/** The page to settle on after a release. One page per swipe at most. */
export function dragTarget({ offset, base, velocityY, height, count, minIndex, maxIndex }: TargetInput): number {
  "worklet";
  if (count <= 0 || height <= 0) return 0;
  const moved = offset - pageOffset(base, height);
  const projected = moved + velocityY * FLING_PROJECTION_S;
  let target = base;
  if (projected <= -height * TURN_FRACTION) target = base + 1;
  else if (projected >= height * TURN_FRACTION) target = base - 1;
  const lo = Math.max(0, minIndex);
  const hi = Math.min(count - 1, maxIndex);
  return Math.min(Math.max(target, lo), Math.max(lo, hi));
}

/** Index clamped into `[0, count)`; 0 for an empty list. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index) || 0, 0), count - 1);
}
