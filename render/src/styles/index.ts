import {sketch} from './sketch';
import {editorialDark} from './editorialDark';
import {blueprint} from './blueprint';
import {terminal} from './terminal';
import {paperCutout} from './paperCutout';
import {newsprint} from './newsprint';
import type {Style, Tokens} from './types';

export * from './types';

/** The registry. Add a style here and the schema, QA gate and style sheet all pick it up. */
export const STYLES: Style[] = [sketch, editorialDark, blueprint, terminal, paperCutout, newsprint];
export const STYLE_IDS = STYLES.map((s) => s.id) as [string, ...string[]];
export const DEFAULT_STYLE = 'sketch';

export const styleById = (id?: string): Style => STYLES.find((s) => s.id === id) ?? STYLES[0];

// ---- active style (pure code such as text measuring has no React context; Story sets both) ----
let active: Style = STYLES[0];
export const setActiveStyle = (id?: string): Style => (active = styleById(id));
export const getStyle = (): Style => active;

// ---- colour maths ----
const rgb = (hex: string): [number, number, number] => {
	const h = hex.replace('#', '');
	const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
	return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as [number, number, number];
};
export const luminance = (hex: string): number => {
	const [r, g, b] = rgb(hex).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const luminanceRgb = (c: number[]): number => luminance('#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
export const contrast = (a: string, b: string): number => {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
export const contrastRgb = (a: number[], b: number[]): number => {
	const la = luminanceRgb(a);
	const lb = luminanceRgb(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
export const toRgb = rgb;
/** `#rrggbb` + alpha 0..1 -> `rgba(...)` (so skins never hard-code colour literals) */
export const alpha = (hex: string, a: number): string => {
	const [r, g, b] = rgb(hex);
	return `rgba(${r},${g},${b},${a})`;
};
/** Linear blend of two hex colours, t = 0 -> a, 1 -> b. */
export const mixHex = (a: string, b: string, t: number): string => {
	const pa = rgb(a);
	const pb = rgb(b);
	return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
};
export const mixHexRaw = (a: string, b: string, t: number): string =>
	'#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

// ---- cast colours ----
export const MIN_TEXT_CONTRAST = 4.5;

/** The colour a cast member gets in a style (script colour when allowed and legible, else the palette). */
export const castColor = (style: Style, scriptColor: string | undefined, index: number): string => {
	const t = style.tokens;
	if (style.castFromScript && scriptColor && contrast(scriptColor, t.captionBg) >= MIN_TEXT_CONTRAST && contrast(scriptColor, t.paper) >= MIN_TEXT_CONTRAST) return scriptColor;
	return t.cast[index % t.cast.length];
};

// ---- the text pairs a style promises to keep legible ----
export interface TextPair {
	name: string;
	fg: string;
	bg: string;
	min: number;
}

export const textPairs = (s: Style): TextPair[] => {
	const t: Tokens = s.tokens;
	const p = (name: string, fg: string, bg: string, min = MIN_TEXT_CONTRAST): TextPair => ({name, fg, bg, min});
	const pairs: TextPair[] = [
		p('caption', t.captionFg, t.captionBg),
		p('ink on paper', t.ink, t.paper),
		p('ink on card', t.ink, t.card),
		p('ink on fill', t.ink, t.fill),
		p('ink on soft', t.ink, t.soft),
		p('ink on accent tint', t.ink, t.accentTint),
		p('muted on paper', t.muted, t.paper),
		p('muted on card', t.muted, t.card),
		p('muted on fill', t.muted, t.fill),
		p('muted on caption bg', t.muted, t.captionBg),
		p('accent text on paper', t.accentText, t.paper),
		p('accent text on card', t.accentText, t.card),
		p('accent text on caption bg', t.accentText, t.captionBg),
		p('on-accent text on accent', t.onAccent, t.accent),
		p('terminal text', t.termFg, t.termBg),
		p('terminal dim text', t.termDim, t.termBg),
		p('terminal prompt', t.termPrompt, t.termBg),
		p('code text', t.codeFg, t.codeBg),
		p('code text on highlight', t.codeFg, t.accentTint),
		p('ink on highlighted table row', t.ink, mixHexRaw(t.card, t.accent, 0.34)),
		p('accent text on accent tint', t.accentText, t.accentTint),
		p('on-accent text on like', t.onAccent, t.like, 3),
		p('toast text', t.toastFg, t.toastBg),
		p('phone ink on screen', t.ink, t.screen),
		p('phone muted on screen', t.muted, t.screen),
		p('like heart on screen', t.like, t.screen, 3),
		p('like heart on card', t.like, t.card, 3),
	];
	t.cast.forEach((c, i) => {
		pairs.push(p(`cast[${i}] on paper`, c, t.paper), p(`cast[${i}] on caption bg`, c, t.captionBg));
	});
	return pairs;
};

/** Problems with a style's own tokens (empty = fine). */
export const styleProblems = (s: Style): string[] => {
	const probs: string[] = [];
	for (const pr of textPairs(s)) {
		const c = contrast(pr.fg, pr.bg);
		if (c < pr.min) probs.push(`${s.id}: ${pr.name} ${c.toFixed(2)}:1 < ${pr.min}:1 (${pr.fg} on ${pr.bg})`);
	}
	const t = s.tokens;
	// the like colour must be visibly different from the ink and the screen, or a tap cannot be seen
	for (const [name, other] of [['ink', t.ink], ['screen', t.screen], ['bezel', t.bezel]] as const) {
		if (hexDist(t.like, other) < 90) probs.push(`${s.id}: like colour too close to ${name}`);
	}
	return probs;
};

export const hexDist = (a: string, b: string): number => {
	const [r1, g1, b1] = rgb(a);
	const [r2, g2, b2] = rgb(b);
	return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

/** Of two candidate text colours, the one with more contrast on `bg`. */
export const bestOn = (bg: string, a: string, b: string): string => (contrast(bg, a) >= contrast(bg, b) ? a : b);

/** CSS box-shadow for skins that cast a flat offset shadow ('none' otherwise). */
export const shadowCss = (s: Style): string => {
	const sh = s.skin.panel.shadow;
	return sh ? `${sh.dx}px ${sh.dy}px 0 ${alpha(s.tokens.shadow, sh.opacity)}` : 'none';
};
