import { describe, expect, it } from "vitest";
import {
  edge,
  fitScene,
  intersects,
  labelRect,
  routeArrow,
  type Rect,
} from "./stage-layout";
const a = { x: 10, y: 20, w: 20, h: 20 };
const c = { x: 70, y: 20, w: 20, h: 20 };
describe("stage geometry", () => {
  it("clips horizontal and diagonal arrows to the actual rectangle edges", () => {
    expect(edge(a, { x: 80, y: 30 })).toEqual({ x: 30, y: 30 });
    expect(edge(a, { x: 40, y: 50 })).toEqual({ x: 30, y: 40 });
    const route = routeArrow(a, c, [], 1);
    expect(route.start).toEqual({ x: 30, y: 30 });
    expect(route.end).toEqual({ x: 70, y: 30 });
    expect(route.offset).toBe(0);
  });
  it("bows around the intervening box instead of crossing its text", () => {
    const obstacle = { x: 40, y: 15, w: 20, h: 30 };
    const route = routeArrow(a, c, [obstacle], 1);
    expect(route.offset).not.toBe(0);
    expect(route.hits).toBe(0);
    expect(
      route.points
        .slice(1)
        .some((p, i) => intersects(route.points[i], p, obstacle)),
    ).toBe(false);
  });
  it("handles vertical arrows, zero-length references and empty scenes", () => {
    const route = routeArrow(
      a,
      { ...a, y: 90 },
      [{ x: 5, y: 50, w: 30, h: 20 }],
      1,
    );
    expect(route.hits).toBe(0);
    expect(route.offset).not.toBe(0);
    expect(routeArrow(a, a, [], 1).d).not.toMatch(/NaN|Infinity/);
    expect(fitScene([], 0, 0)).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it("keeps the entire measured scene in the safe band and caps enlargement", () => {
    for (const rects of [
      [a, c],
      [{ x: 0, y: 0, w: 100, h: 300 }],
      [{ x: -40, y: -20, w: 180, h: 200 }],
    ]) {
      const fit = fitScene(rects, 100, 180);
      expect(fit.scale).toBeLessThanOrEqual(1.25);
      for (const r of rects) {
        expect(r.y * fit.scale + fit.y).toBeGreaterThanOrEqual(
          180 * 0.06 - 1e-8,
        );
        expect((r.y + r.h) * fit.scale + fit.y).toBeLessThanOrEqual(
          180 * 0.74 + 1e-8,
        );
        expect(r.x * fit.scale + fit.x).toBeGreaterThanOrEqual(4 - 1e-8);
        expect((r.x + r.w) * fit.scale + fit.x).toBeLessThanOrEqual(96 + 1e-8);
      }
    }
  });
  it("places label pills outside every box", () => {
    const obstacles: Rect[] = [a, c, { x: 35, y: 10, w: 30, h: 40 }];
    const label = labelRect(
      { x: 50, y: 30 },
      { x: 0, y: 1 },
      30,
      10,
      obstacles,
    );
    expect(
      obstacles.some(
        (o) =>
          label.x < o.x + o.w &&
          label.x + label.w > o.x &&
          label.y < o.y + o.h &&
          label.y + label.h > o.y,
      ),
    ).toBe(false);
  });
});
