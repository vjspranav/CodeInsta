/**
 * Voice <-> screen sync: word timing estimates and token matching.
 *
 * A visual that shows something the line names (a number, an identifier, a table / box name)
 * must be on screen BEFORE the word is spoken (decisions.md: "The voice never runs ahead of the screen").
 *
 *  - estimateWordTimes(text, durationMs): word-level timing, weighted by spoken length
 *    (digits are expanded to their spoken words, "4812" -> "four thousand eight hundred twelve").
 *  - lineTokens(text, durationMs): spoken numbers (digits or words: "Forty-eight hundred" = 4800) and words, with times.
 *  - visualTokens(action): the numbers / identifiers / names an action puts on screen, with their offset
 *    (frames) from the action's trigger.
 *  - matchToken(v, line): the earliest line token that names v.
 */

export const SYNC_LEAD_MS = 250; // the scheduler reveals this long before the word
export const SYNC_MIN_MS = 150; // the QA gate requires at least this much
export const SYNC_MAX_LEAD_MS = 450; // a visual may fire this long before its line starts at the earliest

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 4812 -> "four thousand eight hundred twelve" (the length model of how it is spoken). */
export const numberWords = (n: number): string => {
	if (!Number.isFinite(n)) return '';
	if (n < 0) return `minus ${numberWords(-n)}`;
	if (!Number.isInteger(n)) {
		const [i, f] = String(n).split('.');
		return `${numberWords(Number(i))} point ${f.split('').map((d) => ONES[Number(d)]).join(' ')}`;
	}
	if (n < 20) return ONES[n];
	if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
	if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ' ' + numberWords(n % 100) : ''}`;
	if (n < 1e6) return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ' ' + numberWords(n % 1000) : ''}`;
	if (n < 1e9) return `${numberWords(Math.floor(n / 1e6))} million${n % 1e6 ? ' ' + numberWords(n % 1e6) : ''}`;
	return `${numberWords(Math.floor(n / 1e9))} billion${n % 1e9 ? ' ' + numberWords(n % 1e9) : ''}`;
};

const NUM_RE = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const toNum = (s: string) => Number(s.replace(/,/g, ''));

/** Replace every number in `text` by its spoken words. */
export const digitsToWords = (text: string): string => text.replace(NUM_RE, (m) => numberWords(toNum(m)));

// ---------------------------------------------------------------- word timing
export interface WordTime {
	w: string;
	start_ms: number;
	end_ms: number;
}

const PAUSE: [RegExp, number][] = [
	[/(\.\.\.|…)["')\]]*$/, 5],
	[/[.?!]["')\]]*$/, 4],
	[/[;:]["')\]]*$/, 2.5],
	[/[,—–-]["')\]]*$/, 2],
];

const letters = (s: string) => s.replace(/[^a-z0-9]/gi, '');

/** Spoken length (characters) of one written word. */
export const spokenLength = (word: string): number => Math.max(1, letters(digitsToWords(word)).length);

/**
 * Word-level timing of a trimmed line (speech starts at ~0 ms, ends at durationMs).
 * Each word's share of the time is its spoken length plus a small per-word cost; punctuation adds a pause after the word.
 */
export const estimateWordTimes = (text: string, durationMs: number): WordTime[] => {
	const words = text.split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const weights = words.map((w) => spokenLength(w) + 1.5);
	const pauses = words.map((w, i) => (i === words.length - 1 ? 0 : PAUSE.find(([re]) => re.test(w))?.[1] ?? 0));
	const total = weights.reduce((a, b) => a + b, 0) + pauses.reduce((a, b) => a + b, 0);
	let acc = 0;
	return words.map((w, i) => {
		const start = (acc / total) * durationMs;
		acc += weights[i];
		const end = (acc / total) * durationMs;
		acc += pauses[i];
		return {w, start_ms: start, end_ms: end};
	});
};

// ---------------------------------------------------------------- spoken numbers
const WORD_VAL: Record<string, number> = {};
ONES.forEach((w, i) => (WORD_VAL[w] = i));
TENS.forEach((w, i) => w && (WORD_VAL[w] = i * 10));
const SCALE: Record<string, number> = {thousand: 1e3, million: 1e6, billion: 1e9};

const clean = (w: string) => w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

export interface SpokenNumber {
	value: number;
	i0: number; // index of the first word of the number phrase
	i1: number;
}

/** Numbers in a word list: digits ("4,812") and spelled out ("forty-eight hundred", "a hundred thousand"). */
export const spokenNumbers = (words: string[]): SpokenNumber[] => {
	const out: SpokenNumber[] = [];
	let i = 0;
	while (i < words.length) {
		const w = clean(words[i]);
		if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(w)) {
			out.push({value: toNum(w), i0: i, i1: i});
			i++;
			continue;
		}
		const nextBig = (k: number) => {
			const n = clean(words[k + 1] ?? '');
			return n === 'hundred' || n in SCALE;
		};
		const startsHere = w in WORD_VAL || w === 'hundred' || w in SCALE || w.includes('-') || ((w === 'a' || w === 'an') && nextBig(i));
		const parts = (x: string) => clean(x).split('-').filter(Boolean);
		if (!startsHere || !parts(words[i]).every((p) => p in WORD_VAL || p === 'hundred' || p in SCALE || p === 'a' || p === 'an')) {
			i++;
			continue;
		}
		let total = 0;
		let cur = 0;
		let last: 'none' | 'ones' | 'tens' | 'big' = 'none';
		let j = i;
		let any = false;
		for (; j < words.length; j++) {
			const ps = parts(words[j]);
			if (!ps.length) break;
			let ok = true;
			const save = {total, cur, last};
			for (const p of ps) {
				if ((p === 'a' || p === 'an') && j === i && nextBig(j)) {
					cur = 1;
					last = 'ones';
				} else if (p === 'hundred') {
					cur = (cur || 1) * 100;
					last = 'big';
				} else if (p in SCALE) {
					total += (cur || 1) * SCALE[p];
					cur = 0;
					last = 'big';
				} else if (p in WORD_VAL) {
					const v = WORD_VAL[p];
					const isTens = v >= 20;
					// "twenty one" continues one number; "one two" starts a new one
					if (last === 'ones' || (last === 'tens' && v >= 10)) {
						ok = false;
						break;
					}
					cur += v;
					last = isTens ? 'tens' : 'ones';
				} else {
					ok = false;
					break;
				}
			}
			if (!ok) {
				total = save.total;
				cur = save.cur;
				last = save.last;
				break;
			}
			any = true;
		}
		if (any) {
			out.push({value: total + cur, i0: i, i1: j - 1});
			i = j;
		} else i++;
	}
	return out;
};

// ---------------------------------------------------------------- line tokens
export interface LineTok {
	kind: 'num' | 'word';
	value?: number;
	norm: string; // normalised word (lower-case a-z0-9)
	word: string;
	idx: number; // word index of the first word
	i1: number; // word index of the last word
	startMs: number;
	endMs: number;
}

export const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Spoken numbers and words of a line with their estimated times (ms from the start of the line). */
export const lineTokens = (text: string, durationMs: number): LineTok[] => {
	const times = estimateWordTimes(text, durationMs);
	const words = times.map((t) => t.w);
	const toks: LineTok[] = words.map((w, i) => ({kind: 'word', norm: norm(w), word: w, idx: i, i1: i, startMs: times[i].start_ms, endMs: times[i].end_ms}));
	for (const n of spokenNumbers(words)) {
		toks.push({kind: 'num', value: n.value, norm: String(n.value), word: words.slice(n.i0, n.i1 + 1).join(' '), idx: n.i0, i1: n.i1, startMs: times[n.i0].start_ms, endMs: times[n.i1].end_ms});
	}
	return toks;
};

/** "forty-eight hundred" (4800) names 4812; exact equality always matches. */
export const numMatches = (spoken: number, shown: number): boolean => {
	if (spoken === shown) return true;
	if (shown >= 1000 && spoken >= 1000 && spoken % 100 === 0 && Math.abs(shown - spoken) <= 50) return true;
	if (shown >= 10000 && spoken % 1000 === 0 && Math.abs(shown - spoken) <= spoken * 0.05) return true;
	return false;
};

// ---------------------------------------------------------------- visual tokens
export interface VisTok {
	kind: 'num' | 'id' | 'name';
	value?: number;
	parts?: string[]; // id / name: normalised words
	text: string;
	/** frames after the action's trigger at which this token is on screen (rows stagger in, code types) */
	off: number;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'are', 'was', 'per', 'one', 'app']);
const SKIP_KEYS = new Set(['do', 'id', 'at', 'icon', 'tone', 'template', 'target', 'lang', 'kind', 'side', 'emoji', 'app', 'highlight', 'hold_ms', 'step_ms', 'speed', 'cpf', 'rows_hl', 'from', 'to', 'result', 'points', 'span', 'playhead', 'start', 'end', 'ms', 'path', 'layout', 'op', 'lane', 'drop', 'retry', 'reply', 'dashed']);

/** identifier-shaped: has a digit, an underscore, camelCase or an inner dot ("p99", "follower_id", "initRc", "init.rc"). */
const isIdent = (w: string) => /[a-z]\d|\d[a-z]/i.test(w) || /[a-z0-9]_[a-z0-9]/i.test(w) || /[a-z][A-Z]/.test(w) || /[a-z]\.[a-z]/i.test(w);
const sigWords = (s: string) =>
	s
		.split(/[^A-Za-z0-9]+/)
		.map((w) => w.toLowerCase())
		.filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));

const strs = (v: unknown, out: string[] = [], key = ''): string[] => {
	if (SKIP_KEYS.has(key)) return out;
	if (typeof v === 'string') out.push(v);
	else if (typeof v === 'number') out.push(String(v));
	else if (Array.isArray(v)) for (const x of v) strs(x, out, key);
	else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strs(x, out, k);
	return out;
};

const textTokens = (text: string, off: number, out: VisTok[]) => {
	for (const m of text.matchAll(NUM_RE)) {
		const i = m.index ?? 0;
		if (text[i - 1] === ':' || text[i + m[0].length] === ':') continue; // clock times ("10:02") are not spoken as separate numbers
		out.push({kind: 'num', value: toNum(m[0]), text: m[0], off});
	}
	for (const w of text.split(/[\s,;:()[\]{}"'`=<>+*/\\|!?]+/)) {
		const x = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
		if (x.length >= 2 && isIdent(x)) out.push({kind: 'id', parts: x.split(/[_.\s]+|(?<=[a-z])(?=[A-Z])/).map(norm).filter(Boolean), text: x, off});
	}
};

const asStr = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Names (all significant words must be spoken) an action introduces: tables, columns, boxes, actors, nodes. */
const namesOf = (a: Record<string, unknown>): string[] => {
	const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : asStr((x as Record<string, unknown>)?.label ?? (x as Record<string, unknown>)?.name ?? (x as Record<string, unknown>)?.id))).filter(Boolean) : []);
	switch (a.do) {
		case 'db.table':
			return [asStr(a.name), ...list(a.columns ?? a.cols)];
		case 'sketch.box':
			return [asStr(a.text ?? a.label)];
		case 'seq.diagram':
			return list(a.actors);
		case 'tree':
			return list(a.nodes);
		case 'timeline.track':
			return list(a.lanes);
		case 'packet.flow':
			return list(a.nodes);
		case 'chart.plot':
			return list(a.series);
		default:
			return [];
	}
};

/** frames-per-row offsets of progressive content (must match the models in dbmodel.ts / state.ts). */
const rowOffset = (kind: string, i: number): number => {
	switch (kind) {
		case 'db.table':
			return 10 + i * 5;
		case 'db.result':
			return 24 + i * 6;
		case 'db.insert':
			return 4 + i * 8;
		case 'code.show':
			return 12 + i * 3;
		default:
			return 0;
	}
};

/** All tokens an action puts on screen, with their offsets from its trigger. */
export const visualTokens = (a: Record<string, unknown>): VisTok[] => {
	const k = String(a.do);
	if (k === 'layout' || k === 'clear' || k === 'focus' || k === 'sketch.arrow') return [];
	const out: VisTok[] = [];
	for (const n of namesOf(a)) {
		const parts = sigWords(n);
		if (parts.length) out.push({kind: 'name', parts, text: n, off: 0});
	}
	if (k === 'define') {
		textTokens(asStr(a.term ?? a.id), 0, out);
		return out;
	}
	if (k === 'db.table' || k === 'db.result' || k === 'db.insert') {
		if (k !== 'db.insert') textTokens(strs(a.name).join(' ') + ' ' + strs(a.sub).join(' '), 2, out);
		const rows = Array.isArray(a.rows) ? a.rows : Array.isArray(a.row) ? [a.row] : [];
		rows.forEach((r, i) => textTokens(strs(r).join(' ; '), rowOffset(k, i), out));
		return out;
	}
	if (k === 'db.join') {
		const steps = Array.isArray(a.steps) ? (a.steps as Record<string, unknown>[]) : [];
		const stepFrames = Math.round(((typeof a.step_ms === 'number' ? a.step_ms : 700) / 1000) * 30);
		steps.forEach((s, i) => textTokens(asStr(s.label), i * stepFrames + 2, out));
		return out;
	}
	if (k === 'code.show') {
		const raw = a.code ?? a.text ?? a.snippet ?? '';
		const lines = Array.isArray(raw) ? raw.map(asStr) : asStr(raw).split('\n');
		lines.forEach((l, i) => textTokens(l, rowOffset(k, i), out));
		textTokens(asStr(a.title ?? a.file), 2, out);
		return out;
	}
	if (k === 'term.type') {
		// offsets depend on the typing speed: see termTokenOffsets() in the timeline
		const cmd = asStr(a.cmd ?? a.command ?? a.text);
		const o = a.out ?? a.output ?? a.lines;
		const lines = Array.isArray(o) ? o.map(asStr) : typeof o === 'string' ? o.split('\n') : [];
		const cpf = typeof a.cpf === 'number' ? a.cpf : 1.5;
		const gap = typeof a.cmd_gap === 'number' ? a.cmd_gap : 10;
		const lineGap = typeof a.line_gap === 'number' ? a.line_gap : 6;
		if (cmd) textTokens(cmd, Math.ceil(cmd.length * cpf) + 1, out);
		const t0 = cmd ? Math.ceil(cmd.length * cpf) + gap : 0;
		lines.forEach((l, i) => textTokens(l, t0 + i * lineGap + 1, out));
		return out;
	}
	const all: string[] = [];
	for (const [key, v] of Object.entries(a)) strs(v, all, key);
	textTokens(all.join(' ; '), 0, out);
	return out;
};

/** The earliest line token that names the visual token (or undefined). */
export const matchToken = (v: VisTok, line: LineTok[]): LineTok | undefined => {
	let best: LineTok | undefined;
	const take = (t: LineTok) => {
		if (!best || t.startMs < best.startMs) best = t;
	};
	if (v.kind === 'num') {
		for (const t of line) if (t.kind === 'num' && numMatches(t.value!, v.value!)) take(t);
		return best;
	}
	const words = line.filter((t) => t.kind === 'word');
	const parts = v.parts ?? [];
	if (!parts.length) return undefined;
	if (v.kind === 'id') {
		const joined = parts.join('');
		for (const t of words) if (t.norm === joined || t.norm === parts[0] + (parts[1] ?? '') && parts.length === 2) take(t);
		for (let i = 0; i + parts.length <= words.length; i++) if (parts.every((p, k) => words[i + k].norm === p)) take(words[i]);
		return best;
	}
	// name: every significant word must be spoken; the time is the first of them
	const found = parts.map((p) => words.find((t) => t.norm === p || t.norm === p + 's' || t.norm + 's' === p));
	if (found.every(Boolean)) for (const t of found) take(t!);
	return best;
};
