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

// Frame areas (px). Captions own the bottom 22% (y >= ~998).
export const SPEAKER_ROW: Rect = {x: 36, y: 20, w: 648, h: 70};
export const CONTENT: Rect = {x: 36, y: 104, w: 648, h: 762};
export const LOWER_THIRD: Rect = {x: 36, y: 874, w: 648, h: 114}; // bottom-anchored; wraps up to 2 lines + note
export const CAPTION_AREA: Rect = {x: 36, y: 1000, w: 648, h: 250};

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
