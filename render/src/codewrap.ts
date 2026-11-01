import {measure} from './text';

/** Code and terminal text never renders below this (the QA gate enforces the same floor). */
export const CODE_MIN_PX = 16;
/** Wrapped continuation rows are indented by this many columns beyond the line's own indent. */
export const CONT_INDENT = 4;

/** Width of one monospace column at `size` px, measured with the active style's mono face. */
export const colW = (size: number): number => measure('M', 'mono', size) || size * 0.6;

/** structural break points (read as a pause) beat weak ones (inside a path or name) */
const STRONG = new Set([':', ',', ';', ' ', '=', '+', '|', '&']);
const WEAK = new Set(['/', ')', ']', '}', '.', '_', '-', '\\']);

/** Index just after the last sensible break position within `cols` (after `from`), or -1. */
const breakIn = (s: string, cols: number, from: number): number => {
	let strong = -1;
	let weak = -1;
	const lim = Math.min(s.length, cols);
	for (let i = from + 1; i <= lim; i++) {
		const prev = s[i - 1];
		// never split an operator such as "+=", ":=", "=="
		if (s[i] === '=' && '+:?!<>='.includes(prev)) continue;
		if (STRONG.has(prev)) strong = i;
		else if (WEAK.has(prev)) weak = i;
	}
	// a strong break wins unless it would leave the row mostly empty
	return strong > from + (lim - from) * 0.4 || weak < 0 ? strong : Math.max(strong, weak);
};

export interface Wrapped {
	rows: string[];
	/** false when a token wider than the box had to be cut mid-token (no sensible break point) */
	clean: boolean;
}

/**
 * Wraps one code line to `cols` columns at sensible break points (after : / , ; space = += ) . _ -),
 * indenting continuation rows. Only where rows end changes, never the characters.
 */
export const wrapCodeLine = (line: string, cols: number): Wrapped => {
	cols = Math.max(8, Math.floor(cols));
	if (line.length <= cols) return {rows: [line], clean: true};
	const indent = (line.match(/^\s*/)?.[0] ?? '').length;
	const cont = ' '.repeat(Math.min(indent + CONT_INDENT, Math.floor(cols / 2)));
	const rows: string[] = [];
	let clean = true;
	let rest = line;
	let first = true;
	while (rest.length > 0) {
		const lead = first ? '' : cont;
		const room = cols - lead.length;
		if (rest.length <= room) {
			rows.push(lead + rest);
			break;
		}
		const keep = first ? indent : 0;
		let cut = breakIn(rest, room, keep);
		if (cut <= keep) {
			cut = room; // unbreakable token: cut at the box edge (reported as not clean)
			clean = false;
		}
		rows.push(lead + rest.slice(0, cut).replace(/\s+$/, ''));
		rest = rest.slice(cut).replace(/^\s+/, '');
		first = false;
	}
	return {rows, clean};
};

export interface CodeFit {
	fs: number;
	lh: number;
	/** wrapped rows per source line */
	rows: string[][];
	total: number;
	wrapped: boolean;
	clean: boolean;
	/** all rows fit the height at `fs` (>= CODE_MIN_PX) */
	fits: boolean;
}

export interface CodeFitOpts {
	maxFs?: number;
	lhRatio?: number;
	/** an unwrapped fit at or above this size is kept as it is */
	comfy?: number;
	/** wrapped text is not enlarged beyond this */
	wrapMax?: number;
}

/**
 * Largest comfortable size for `lines` in a w x h box: no wrapping when that reads at `comfy` px or more,
 * else wrap long lines (never below CODE_MIN_PX). If even 16 px does not fit the height the result says so.
 */
export const fitCode = (lines: string[], w: number, h: number, o: CodeFitOpts = {}): CodeFit => {
	const {maxFs = 34, lhRatio = 1.5, comfy = 20, wrapMax = 24} = o;
	const lhOf = (fs: number) => fs * lhRatio;
	const at = (fs: number) => {
		const cols = w / colW(fs);
		const ws = lines.map((l) => wrapCodeLine(l, cols));
		const rows = ws.map((x) => x.rows);
		const total = rows.reduce((a, r) => a + r.length, 0);
		return {fs, lh: lhOf(fs), rows, total, wrapped: total > lines.length, clean: ws.every((x) => x.clean)};
	};
	const widest = Math.max(1, ...lines.map((l) => l.length));
	let nw = Math.min(maxFs, Math.floor(h / (Math.max(1, lines.length) * lhRatio)));
	while (nw >= CODE_MIN_PX && colW(nw) * widest > w) nw--;
	if (nw >= comfy) return {...at(nw), fits: true};
	for (let fs = Math.min(wrapMax, maxFs); fs >= CODE_MIN_PX; fs--) {
		const r = at(fs);
		if (r.total * r.lh <= h + 0.5) return {...r, fits: true};
	}
	if (nw >= CODE_MIN_PX) return {...at(nw), fits: true};
	return {...at(CODE_MIN_PX), fits: false};
};

/**
 * Which part of each wrapped row is shown once `n` characters of the whole line have been typed.
 * Continuation rows keep their indent; the whitespace dropped at a break counts as one typed character.
 */
export const revealRows = (rows: string[], n: number): string[] => {
	let left = n;
	return rows.map((row, ri) => {
		const ind = ri === 0 ? 0 : row.length - row.trimStart().length;
		const body = row.slice(ind);
		const take = Math.max(0, Math.min(body.length, left));
		left -= body.length + 1;
		return take > 0 ? row.slice(0, ind + take) : '';
	});
};
