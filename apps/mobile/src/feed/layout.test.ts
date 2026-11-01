import zones from "../../../../packages/shared/overlay-zones.json";
import { videoBox, zoneRect } from "./layout";

const NAMES = ["topControls", "rightRail", "bottomMeta"] as const;

describe("videoBox", () => {
  it("fills the screen width and keeps 9:16", () => {
    const box = videoBox({ width: 393, height: 852 });
    expect(box.width).toBe(393);
    expect(box.height).toBeCloseTo((393 * 16) / 9, 5);
    expect(box.height).toBeCloseTo(698.67, 2);
  });

  it("centers the box when the screen is taller than 16:9", () => {
    const box = videoBox({ width: 393, height: 852 });
    expect(box.top).toBeCloseTo((852 - box.height) / 2, 5);
    expect(box.top).toBeGreaterThan(0);
  });

  it("crops symmetrically (negative top) when the screen is shorter", () => {
    const box = videoBox({ width: 360, height: 640 });
    expect(box.width).toBe(360);
    expect(box.height).toBeCloseTo(640, 5);
    const shorter = videoBox({ width: 360, height: 600 });
    expect(shorter.top).toBeCloseTo((600 - shorter.height) / 2, 5);
    expect(shorter.top).toBeLessThan(0);
    expect(shorter.top + shorter.height).toBeCloseTo(600 - shorter.top, 5);
  });
});

describe("zoneRect", () => {
  const screen = { width: 393, height: 852 };
  const box = videoBox(screen);

  it("places the right rail by overlay-zones percentages", () => {
    const rail = zoneRect("rightRail", box);
    expect(rail.left).toBeCloseTo((393 * 610) / 720, 2);
    expect(rail.width).toBeCloseTo((393 * 110) / 720, 2);
    expect(rail.top).toBeCloseTo(box.top + (box.height * 520) / 1280, 2);
    expect(rail.height).toBeCloseTo((box.height * 600) / 1280, 2);
  });

  it("keeps every zone inside the video box", () => {
    for (const name of NAMES) {
      const r = zoneRect(name, box);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(box.width + 1e-6);
      expect(r.top).toBeGreaterThanOrEqual(box.top - 1e-6);
      expect(r.top + r.height).toBeLessThanOrEqual(box.top + box.height + 1e-6);
    }
  });

  it("uses the zones from the shared JSON", () => {
    expect(Object.keys(zones.zones).sort()).toEqual([...NAMES].sort());
  });

  it("clamps zones to the visible area when the screen is shorter than 16:9", () => {
    const short = { width: 360, height: 600 };
    const cropped = videoBox(short);
    for (const name of NAMES) {
      const r = zoneRect(name, cropped, short);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.top + r.height).toBeLessThanOrEqual(short.height + 1e-6);
      expect(r.height).toBeGreaterThan(0);
    }
  });

  it("without a screen, the unclamped rect may extend past a cropped box edge", () => {
    const cropped = videoBox({ width: 360, height: 600 });
    const meta = zoneRect("bottomMeta", cropped);
    expect(meta.top + meta.height).toBeCloseTo(cropped.top + cropped.height, 2);
  });
});
