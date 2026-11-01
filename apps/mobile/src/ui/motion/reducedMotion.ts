/**
 * Reduce Motion support. Every component in this kit reads `useReducedMotion()` and swaps its
 * transform/spring animation for a short fade (`motionFor`).
 */
import { useReducedMotion } from "react-native-reanimated";

export { useReducedMotion };

/**
 * Pick the full animation or its reduced fallback. Pure: `motionFor(reduced, full, fallback)`.
 * Works for any value: a config object, a delay in ms, a boolean, a style.
 */
export function motionFor<T, R = T>(reduced: boolean, full: T, reducedFallback: R): T | R {
  return reduced ? reducedFallback : full;
}
