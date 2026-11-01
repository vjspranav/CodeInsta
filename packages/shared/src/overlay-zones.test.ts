import { describe, expect, it } from "vitest";
import shared from "../overlay-zones.json";
import { zonePercent } from "./overlay-zones";

describe("zonePercent", () => {
  it("converts 720x1280 zones to percentages of the video box", () => {
    expect(zonePercent({ x: 440, y: 0, w: 280, h: 110 })).toEqual({
      left: 61.1111, top: 0, width: 38.8889, height: 8.5938, bottom: 91.4063,
    });
    expect(zonePercent({ x: 360, y: 640, w: 360, h: 320 }, { width: 720, height: 1280 })).toEqual({
      left: 50, top: 50, width: 50, height: 25, bottom: 25,
    });
  });
  it("keeps every shared zone inside the video", () => {
    for (const zone of Object.values(shared.zones)) {
      const p = zonePercent(zone);
      expect(p.left + p.width).toBeLessThanOrEqual(100.0001);
      expect(p.top + p.height).toBeLessThanOrEqual(100.0001);
      expect(p.bottom).toBeGreaterThanOrEqual(0);
    }
  });
});
