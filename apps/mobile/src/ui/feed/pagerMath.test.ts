import { dragOffset, dragTarget, pageOffset } from "./pagerMath";

const H = 700;
const base = { base: 2, height: H, count: 10, minIndex: 0, maxIndex: 9, velocityY: 0 };

describe("dragTarget", () => {
  it("stays on the page for a small drag", () => {
    expect(dragTarget({ ...base, offset: pageOffset(2, H) - 100 })).toBe(2);
    expect(dragTarget({ ...base, offset: pageOffset(2, H) + 100 })).toBe(2);
  });

  it("turns the page after a long drag in either direction", () => {
    expect(dragTarget({ ...base, offset: pageOffset(2, H) - 200 })).toBe(3);
    expect(dragTarget({ ...base, offset: pageOffset(2, H) + 200 })).toBe(1);
  });

  it("turns the page on a short fast flick", () => {
    expect(dragTarget({ ...base, offset: pageOffset(2, H) - 60, velocityY: -1500 })).toBe(3);
    expect(dragTarget({ ...base, offset: pageOffset(2, H) + 60, velocityY: 1500 })).toBe(1);
  });

  it("moves at most one page per swipe", () => {
    expect(dragTarget({ ...base, offset: pageOffset(2, H) - 5000, velocityY: -9000 })).toBe(3);
  });

  it("never leaves the list or the mounted window", () => {
    expect(dragTarget({ ...base, base: 0, offset: 300, velocityY: 2000 })).toBe(0);
    expect(dragTarget({ ...base, base: 9, offset: pageOffset(9, H) - 400 })).toBe(9);
    expect(dragTarget({ ...base, base: 3, maxIndex: 3, offset: pageOffset(3, H) - 400 })).toBe(3);
    expect(dragTarget({ ...base, base: 3, minIndex: 3, offset: pageOffset(3, H) + 400 })).toBe(3);
  });

  it("handles an empty list", () => {
    expect(dragTarget({ ...base, count: 0, offset: 0 })).toBe(0);
  });
});

describe("dragOffset", () => {
  it("follows the finger inside the list", () => {
    expect(dragOffset(-700, -20, -2000, 0)).toBe(-720);
  });

  it("resists once past the first or last page", () => {
    expect(dragOffset(30, 10, -2000, 0)).toBeCloseTo(34);
    expect(dragOffset(-2030, -10, -2000, 0)).toBeCloseTo(-2034);
  });

  it("pulling back from past the end is also damped, so the rubber band is symmetric", () => {
    expect(dragOffset(30, -10, -2000, 0)).toBeCloseTo(26);
  });
});
