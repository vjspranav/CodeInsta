/** Small pure helpers shared by world views and models (no React). */
import {contrast, luminance, mixHexRaw} from '../styles';

export type Props = Record<string, unknown>;

export const sv = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
export const nv = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const msToFrames = (ms: number) => Math.round((ms / 1000) * 30);

/**
 * `fg` moved toward white (dark `bg`) or black (light `bg`) just far enough to reach `min`:1 contrast.
 * Keeps a style's hue (its red stays red) while guaranteeing legible text in every style.
 */
export const legible = (fg: string, bg: string, min = 4.5): string => {
	if (contrast(fg, bg) >= min) return fg;
	const target = luminance(bg) < 0.4 ? '#ffffff' : '#000000';
	for (let i = 1; i <= 20; i++) {
		const c = mixHexRaw(fg, target, i / 20);
		if (contrast(c, bg) >= min) return c;
	}
	return target;
};

/** Checks shared by world validators. */
export const needString = (p: Props, key: string, what: string, max?: number): string[] => {
	const v = p[key];
	if (typeof v !== 'string' || !v.trim()) return [`${what} needs "${key}": "<text>"`];
	if (max !== undefined && v.length > max) return [`${what}: "${key}" is ${v.length} characters (max ${max}); keep it short and readable`];
	return [];
};
export const optNumber = (p: Props, key: string, what: string, min: number, max: number, int = false): string[] => {
	const v = p[key];
	if (v === undefined) return [];
	if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
		return [`${what}: "${key}" must be ${int ? 'an integer' : 'a number'} in ${min}..${max}`];
	}
	return [];
};
