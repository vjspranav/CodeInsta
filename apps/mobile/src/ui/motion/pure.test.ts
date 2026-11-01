import "./testSetup";
import { durations } from "@/theme/tokens";
import { motionFor } from "./reducedMotion";
import { shakeOffsets, shouldShake } from "./ShakeOnError";
import { indicatorX } from "./tabBar";
import { shouldStagger, STAGGER_CAP, STAGGER_STEP_MS, staggerDelay } from "./stagger";
import { LOGO_SETTLE_MS, msUntilReveal, STARTUP_EXTRA_CAP_MS } from "./startupTiming";

describe("motionFor", () => {
  it("returns the full value when motion is allowed", () => {
    expect(motionFor(false, "spring", "fade")).toBe("spring");
  });
  it("returns the fallback when Reduce Motion is on", () => {
    expect(motionFor(true, "spring", "fade")).toBe("fade");
    expect(motionFor(true, 90, 0)).toBe(0);
  });
});

describe("stagger", () => {
  it("steps by the instant duration token", () => {
    expect(STAGGER_STEP_MS).toBe(durations.instant);
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBe(3 * durations.instant);
  });
  it("never goes negative", () => {
    expect(staggerDelay(-2)).toBe(0);
  });
  it("animates only the first six children that exist at first mount", () => {
    expect(STAGGER_CAP).toBe(6);
    expect(shouldStagger(0, 10)).toBe(true);
    expect(shouldStagger(5, 10)).toBe(true);
    expect(shouldStagger(6, 10)).toBe(false);
    expect(shouldStagger(2, 2)).toBe(false); // appended after the first mount
    expect(shouldStagger(1, 2)).toBe(true);
  });
});

describe("startup timing", () => {
  it("settles faster than the cap", () => {
    expect(LOGO_SETTLE_MS).toBeLessThan(STARTUP_EXTRA_CAP_MS);
  });
  it("when ready, waits only for the rest of the settle", () => {
    expect(msUntilReveal({ ready: true, elapsedMs: 0 })).toBe(LOGO_SETTLE_MS);
    expect(msUntilReveal({ ready: true, elapsedMs: 200 })).toBe(LOGO_SETTLE_MS - 200);
    expect(msUntilReveal({ ready: true, elapsedMs: LOGO_SETTLE_MS + 50 })).toBe(0);
  });
  it("when not ready, waits at most the hard cap", () => {
    expect(msUntilReveal({ ready: false, elapsedMs: 0 })).toBe(STARTUP_EXTRA_CAP_MS);
    expect(msUntilReveal({ ready: false, elapsedMs: 700 })).toBe(STARTUP_EXTRA_CAP_MS - 700);
    expect(msUntilReveal({ ready: false, elapsedMs: 5000 })).toBe(0);
  });
  it("never exceeds the cap even with a long settle", () => {
    expect(msUntilReveal({ ready: true, elapsedMs: 0, settleMs: 9000 })).toBe(STARTUP_EXTRA_CAP_MS);
  });
  it("reduced motion (settle 0) reveals a ready app at once", () => {
    expect(msUntilReveal({ ready: true, elapsedMs: 0, settleMs: 0 })).toBe(0);
  });
  it("a negative elapsed time is treated as zero", () => {
    expect(msUntilReveal({ ready: false, elapsedMs: -10 })).toBe(STARTUP_EXTRA_CAP_MS);
  });
});

describe("shake", () => {
  it("visits 3 oscillations of 6 px and rests at 0", () => {
    expect(shakeOffsets()).toEqual([6, -6, 6, -6, 6, -6, 0]);
  });
  it("shakes when the key changes to something meaningful", () => {
    expect(shouldShake(undefined, "Wrong password")).toBe(true);
    expect(shouldShake("a", "b")).toBe(true);
    expect(shouldShake(1, 2)).toBe(true);
  });
  it("stays still for the same key, an initial value, or a cleared error", () => {
    expect(shouldShake("a", "a")).toBe(false);
    expect(shouldShake("a", "")).toBe(false);
    expect(shouldShake("a", null)).toBe(false);
    expect(shouldShake(undefined, undefined)).toBe(false);
  });
});

describe("tab indicator", () => {
  it("is index times tab width", () => {
    expect(indicatorX(0, 90)).toBe(0);
    expect(indicatorX(2, 90)).toBe(180);
    expect(indicatorX(-1, 90)).toBe(0);
  });
});
