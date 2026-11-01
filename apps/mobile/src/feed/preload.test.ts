import { preloadWindow } from "./preload";

describe("preloadWindow", () => {
  it("clamps for empty and tiny libraries", () => {
    expect(preloadWindow(0, 0)).toEqual([]);
    expect(preloadWindow(0, 1)).toEqual([0]);
    expect(preloadWindow(0, 2)).toEqual([0, 1]);
    expect(preloadWindow(1, 2)).toEqual([0, 1]);
  });

  it("clamps at the end and the start", () => {
    expect(preloadWindow(5, 6)).toEqual([4, 5]);
    expect(preloadWindow(0, 20)).toEqual([0, 1, 2]);
  });

  it("keeps one behind and two ahead in the middle", () => {
    expect(preloadWindow(3, 20)).toEqual([2, 3, 4, 5]);
  });

  it("honours custom ahead and behind", () => {
    expect(preloadWindow(3, 20, 2, 0)).toEqual([3, 4, 5]);
    expect(preloadWindow(3, 20, 0, 0)).toEqual([3]);
    expect(preloadWindow(10, 12, 5, 1)).toEqual([9, 10, 11]);
  });

  it("tolerates an out-of-range active index", () => {
    expect(preloadWindow(-3, 5)).toEqual([0, 1, 2]);
    expect(preloadWindow(9, 5)).toEqual([3, 4]);
    expect(preloadWindow(0, -1)).toEqual([]);
  });

  it("is always ascending, unique and within bounds", () => {
    for (let length = 0; length < 8; length++) {
      for (let active = -1; active <= length; active++) {
        const w = preloadWindow(active, length);
        expect([...w].sort((a, b) => a - b)).toEqual(w);
        expect(new Set(w).size).toBe(w.length);
        for (const i of w) {
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(length);
        }
      }
    }
  });
});
