/**
 * Frame and latency probe for the device performance gate. Everything is a no-op unless the
 * build sets EXPO_PUBLIC_PERF=1; measurements print `CI_PERF <name> <ms>` (logcat tag
 * ReactNativeJS on Android, Console on iOS) for apps/mobile/perf/android-perf.sh to collect.
 */

/** Static `process.env.EXPO_PUBLIC_*` access, so Metro inlines it at bundle time. */
const enabled = () => process.env.EXPO_PUBLIC_PERF === "1";

export type Perf = ReturnType<typeof createPerf>;

export function createPerf(now: () => number = () => performance.now()) {
  const marks = new Map<string, number>();
  let firstFrameLogged = false;
  let swipePending = false;

  const mark = (name: string): void => {
    if (enabled()) marks.set(name, now());
  };

  /** Milliseconds since `from` was marked; NaN when it was never marked (or the probe is off). */
  const measure = (_name: string, from: string): number => {
    const start = marks.get(from);
    return start === undefined ? NaN : now() - start;
  };

  const log = (name: string, ms: number): void => {
    if (!enabled() || !Number.isFinite(ms)) return;
    console.log(`CI_PERF ${name} ${ms.toFixed(1)}`);
  };

  // JS bundle start: this module is imported by the root layout before anything renders.
  mark("app_start");

  return {
    mark,
    measure,
    log,
    /**
     * Call when the page (active reel) changes, from the pager's onViewableItemsChanged callback.
     */
    pageChanged(): void {
      if (!enabled()) return;
      mark("swipe");
      swipePending = true;
    },
    /**
     * Call when the active reel is playing with a frame on screen (ReelVideo onFirstFrame for the
     * active reel). The first call is `first_frame_playing` (JS start to first frame; the Android
     * script adds the native launch time to get cold start); later calls close a pending swipe
     * as `swipe_to_play`.
     */
    playing(): void {
      if (!enabled()) return;
      if (!firstFrameLogged) {
        firstFrameLogged = true;
        swipePending = false;
        log("first_frame_playing", measure("first_frame_playing", "app_start"));
      } else if (swipePending) {
        swipePending = false;
        log("swipe_to_play", measure("swipe_to_play", "swipe"));
      }
    },
  };
}

export const perf = createPerf();
