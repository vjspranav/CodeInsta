import {Easing, interpolate} from 'remotion';

export const W = 720;
export const H = 1280;
export const FPS = 30;

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

// Frame areas (px) in the 720x1280 video. The app floats controls over the full-bleed video
// (packages/shared/overlay-zones.json, src/zones.ts): topControls x>=440 y<110, rightRail x>=610 y 520..1120,
// bottomMeta y>=1140. Everything below stays out of them: content and captions live left of the rail
// (x <= 596) and the captions end above the bottom meta strip (y <= 1130).
export const SPEAKER_ROW: Rect = {x: 28, y: 20, w: 396, h: 76}; // ends left of topControls (x 440)
export const CONTENT: Rect = {x: 20, y: 116, w: 576, h: 696}; // y 116: clear of topControls (y < 110) even for a card tilted a little
export const LOWER_THIRD: Rect = {x: 28, y: 818, w: 568, h: 106}; // bottom-anchored; wraps up to 2 lines + note
export const CAPTION_AREA: Rect = {x: 28, y: 944, w: 568, h: 186}; // name row 50 + 8 + two lines at 52 px
/** the rule above the captions sits this far above CAPTION_AREA */
export const CAPTION_RULE_GAP = 14;

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const easeOut = Easing.out(Easing.cubic);
export const easeInOut = Easing.inOut(Easing.cubic);

/** Eased 0..1 progress of `frame` over [start, start+dur]. */
export const prog = (frame: number, start: number, dur: number) =>
	easeOut(clamp01((frame - start) / Math.max(1, dur)));

export const lin = (frame: number, start: number, dur: number) =>
	clamp01((frame - start) / Math.max(1, dur));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const hash = (s: string): number => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) % 2147483647 || 1;
};

export const rand = (seed: number, i = 0) => {
	const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
	return x - Math.floor(x);
};

export const shrinkRect = (r: Rect, n: number): Rect => ({
	x: r.x + n,
	y: r.y + n,
	w: r.w - 2 * n,
	h: r.h - 2 * n,
});

export const mapRange = (v: number, a: number, b: number, c: number, d: number) =>
	interpolate(v, [a, b], [c, d], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
