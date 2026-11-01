import {getStyle} from './styles';
import type {FontKey} from './styles';

let ctx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

/**
 * Widths measured before a face is loaded come from a fallback font and must never be reused.
 * Fonts.tsx calls this when the style's faces are registered.
 */
export const resetMeasureCache = () => {
	widthCache.clear();
};

const getCtx = () => {
	if (ctx) return ctx;
	if (typeof document === 'undefined') return null;
	ctx = document.createElement('canvas').getContext('2d');
	return ctx;
};

export type {FontKey};

/** Text width in px with the active style's font for `font` (hand = display, ui = body, mono). */
export const measure = (text: string, font: FontKey, size: number, weight?: number): number => {
	const st = getStyle();
	const face = st.font[font];
	const wt = weight ?? face.fontWeight;
	const key = `${st.id}|${font}|${size}|${wt}|${text}`;
	const hit = widthCache.get(key);
	if (hit !== undefined) return hit;
	const c = getCtx();
	let w: number;
	const hook = (globalThis as {__measureText?: (t: string, family: string, s: number, w: number) => number}).__measureText;
	if (hook && !c) {
		w = hook(text, face.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), size, wt);
	} else if (c) {
		c.font = `${wt} ${size}px ${face.fontFamily}`;
		w = c.measureText(text).width;
	} else {
		w = text.length * size * (font === 'mono' ? 0.6 : 0.55);
	}
	widthCache.set(key, w);
	return w;
};

/** Greedy word wrap at spaces only. A word wider than maxW stays whole on its own line (it is never split). */
export const wrap = (text: string, font: FontKey, size: number, maxW: number, weight?: number): string[] => {
	const out: string[] = [];
	for (const para of text.split('\n')) {
		const words = para.split(/\s+/).filter(Boolean);
		let line = '';
		const push = () => {
			if (line) out.push(line);
			line = '';
		};
		for (const w of words) {
			const cand = line ? `${line} ${w}` : w;
			if (measure(cand, font, size, weight) <= maxW) line = cand;
			else {
				push();
				line = w;
			}
		}
		push();
		if (words.length === 0) out.push('');
	}
	return out;
};

/** True when every line fits `maxW` (i.e. no single word is wider than the box). */
export const linesFit = (lines: string[], font: FontKey, size: number, maxW: number, weight?: number) =>
	lines.every((l) => measure(l, font, size, weight) <= maxW + 0.5);

/** Same line count, narrower measure: evens out the lines ("read the feed / once, cache it"). */
export const balance = (text: string, font: FontKey, size: number, maxW: number, weight?: number): string[] => {
	const base = wrap(text, font, size, maxW, weight);
	if (base.length < 2 || text.includes('\n')) return base;
	let lo = 0;
	for (const wd of text.split(/\s+/)) lo = Math.max(lo, measure(wd, font, size, weight));
	let hi = maxW;
	let best = base;
	for (let i = 0; i < 14 && hi - lo > 1; i++) {
		const mid = (lo + hi) / 2;
		const l = wrap(text, font, size, mid, weight);
		if (l.length === base.length && linesFit(l, font, size, maxW, weight)) {
			best = l;
			hi = mid;
		} else lo = mid;
	}
	return best;
};

export interface Fitted {
	lines: string[];
	size: number;
	lineH: number;
	height: number;
	width: number;
}

/** Largest font size in [min,max] such that wrapped text fits (w,h). */
export const fitText = (
	text: string,
	font: FontKey,
	w: number,
	h: number,
	max: number,
	min = 12,
	lh = 1.22,
	weight?: number,
	maxLines = 99,
): Fitted => {
	let size = max;
	let lines: string[] = [];
	for (; size >= min; size -= 1) {
		lines = wrap(text, font, size, w, weight);
		if (lines.length <= maxLines && lines.length * size * lh <= h && linesFit(lines, font, size, w, weight)) break;
	}
	size = Math.max(size, min);
	lines = balance(text, font, size, w, weight);
	const widest = lines.reduce((m, l) => Math.max(m, measure(l, font, size, weight)), 0);
	return {lines, size, lineH: size * lh, height: lines.length * size * lh, width: widest};
};
