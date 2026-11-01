import type { CSSProperties } from "react";
import shared from "../../../packages/shared/overlay-zones.json";

export type Zone = { x: number; y: number; w: number; h: number };
export type ZoneName = keyof typeof shared.zones;
export type ZonePercent = { left: number; top: number; width: number; height: number; bottom: number };

const round = (value: number) => Math.round(value * 10000) / 10000;

/** Converts a zone in video pixels (720x1280) to percentages of the rendered video box. */
export function zonePercent(zone: Zone, video: { width: number; height: number } = shared.video): ZonePercent {
  return {
    left: round((zone.x / video.width) * 100),
    top: round((zone.y / video.height) * 100),
    width: round((zone.w / video.width) * 100),
    height: round((zone.h / video.height) * 100),
    bottom: round(((video.height - zone.y - zone.h) / video.height) * 100),
  };
}

const pct = (value: number) => `${value}%`;

/** Absolute box for a named shared zone. */
export function zoneStyle(name: ZoneName): CSSProperties {
  const p = zonePercent(shared.zones[name]);
  return { left: pct(p.left), top: pct(p.top), width: pct(p.width), height: pct(p.height) };
}

/** Bottom-anchored box: the zone's height is a minimum so content can grow upward. */
export function zoneStyleGrowUp(name: ZoneName): CSSProperties {
  const p = zonePercent(shared.zones[name]);
  return { left: pct(p.left), width: pct(p.width), bottom: pct(p.bottom), minHeight: pct(p.height) };
}
