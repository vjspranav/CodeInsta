import zonesJson from '../../packages/shared/overlay-zones.json';
import type {Rect} from './theme';

/** App overlay zones in 720x1280 video coordinates (shared with web and mobile): text and key visuals stay out of them. */
export const ZONES = zonesJson.zones as Record<'topControls' | 'rightRail' | 'bottomMeta', Rect & {holds: string}>;
export type ZoneName = keyof typeof ZONES;

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Name of the first zone the rect intersects (rects that merely touch do not), or null. */
export const zoneHit = (r: Rect): ZoneName | null => {
	for (const name of Object.keys(ZONES) as ZoneName[]) if (hit(r, ZONES[name])) return name;
	return null;
};

export interface ZoneBox {
	/** what it is: "text", "visual", "avatar" ... */
	kind: string;
	label: string;
	rect: Rect;
}

/** One message per box that intersects a zone. Tiny boxes (< 2 px) are ignored. */
export const zoneProblems = (boxes: ZoneBox[]): string[] => {
	const out: string[] = [];
	for (const b of boxes) {
		if (b.rect.w < 2 || b.rect.h < 2) continue;
		const z = zoneHit(b.rect);
		if (z) out.push(`${b.kind} "${b.label.slice(0, 30)}" (x${Math.round(b.rect.x)} y${Math.round(b.rect.y)} ${Math.round(b.rect.w)}x${Math.round(b.rect.h)}) is inside the ${z} zone`);
	}
	return out;
};
