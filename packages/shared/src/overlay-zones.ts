import shared from "../overlay-zones.json";

export type Zone = { x: number; y: number; w: number; h: number };
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
