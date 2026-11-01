import type { CSSProperties } from "react";
import shared from "../../../packages/shared/overlay-zones.json";
import { zonePercent, type Zone, type ZonePercent } from "../../../packages/shared/src/overlay-zones";

export { zonePercent };
export type { Zone, ZonePercent };
export type ZoneName = keyof typeof shared.zones;

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
