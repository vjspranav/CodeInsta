import overlay from "../../../../packages/shared/overlay-zones.json";
import { zonePercent } from "@shared/overlay-zones";

export type Screen = { width: number; height: number };
export type VideoBox = { width: number; height: number; top: number };
export type ZoneName = "topControls" | "rightRail" | "bottomMeta";
export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Full-bleed 9:16 video box: always the screen width, no gutters.
 * `top` centers the box on a taller screen and is negative (symmetric crop) on a shorter one.
 */
export function videoBox(screen: Screen): VideoBox {
  const height = (screen.width * overlay.video.height) / overlay.video.width;
  return { width: screen.width, height, top: (screen.height - height) / 2 };
}

/**
 * Pixel rect of an overlay zone in screen coordinates. When `screen` is given, the rect is clamped
 * to the visible area, so controls stay reachable when a short screen crops the video.
 */
export function zoneRect(name: ZoneName, box: VideoBox, screen?: Screen): Rect {
  const p = zonePercent(overlay.zones[name]);
  let left = (box.width * p.left) / 100;
  let top = box.top + (box.height * p.top) / 100;
  let right = left + (box.width * p.width) / 100;
  let bottom = top + (box.height * p.height) / 100;
  if (screen) {
    top = Math.max(top, 0);
    bottom = Math.min(bottom, screen.height);
    left = Math.max(left, 0);
    right = Math.min(right, screen.width);
  }
  return { left, top, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}
