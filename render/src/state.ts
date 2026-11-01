/**
 * Pure state functions: everything the renderer draws is derived from these,
 * and unit tests / verify.ts assert against them. No React, no DOM.
 */
import type {Item, Scene, Timeline, DefineT} from './timeline';
import {CAPTION_AREA, CONTENT, Rect, W, H} from './theme';
import {zoneHit} from './zones';

export const sv = (v: unknown, d = ''): string =>
	typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d;

/** props of an item merged with every update that has happened by `frame`. */
export const propsAt = (item: Item, frame: number): Record<string, unknown> => {
	let p = {...item.props};
	for (const u of item.updates) if (u.frame <= frame) p = {...p, ...u.props};
	return p;
};

export const itemVisible = (item: Item, frame: number) => frame >= item.start;

// ---------------- box / note ----------------
export const boxStateAt = (item: Item, frame: number) => {
	const p = propsAt(item, frame);
	return {
		visible: itemVisible(item, frame),
		text: sv(p.text, sv(p.label)),
		sub: sv(p.sub),
		icon: sv(p.icon),
		tone: sv(p.tone, 'ink'),
	};
};

// ---------------- cache ----------------
export interface CacheEv {
	frame: number;
	result: 'hit' | 'miss';
	key: string;
	value: string;
}
export const cacheEvents = (item: Item): CacheEv[] =>
	[{frame: item.start, p: item.props}, ...item.updates.map((u) => ({frame: u.frame, p: u.props}))].map(
		({frame, p}) => ({
			frame,
			result: p.result === 'hit' ? 'hit' : 'miss',
			key: sv(p.key, 'feed:42'),
			value: sv(p.value, sv(p.label, 'posts')),
		}),
	);
export const CACHE_STAMP_DELAY = 14;
export const cacheStateAt = (item: Item, frame: number) => {
	const evs = cacheEvents(item);
	const cur = [...evs].reverse().find((e) => e.frame <= frame);
	if (!cur || frame < item.start) return {visible: false as const};
	return {
		visible: true as const,
		result: cur.result,
		key: cur.key,
		stamped: frame >= cur.frame + CACHE_STAMP_DELAY,
		filled: cur.result === 'hit' && frame >= cur.frame + CACHE_STAMP_DELAY,
	};
};

// ---------------- terminal ----------------
export interface TLine {
	text: string;
	kind: 'cmd' | 'out';
	t0: number;
	prompt: string;
	/** frames per typed character (the timeline speeds typing up when a spoken number depends on the output) */
	cpf: number;
}
export const CPF = 1.5;
export const termLines = (item: Item): TLine[] => {
	const src = [{frame: item.start, p: item.props}, ...item.updates.map((u) => ({frame: u.frame, p: u.props}))];
	const out: TLine[] = [];
	for (const {frame, p} of src) {
		let t = frame;
		const cmd = sv(p.cmd, sv(p.command, sv(p.text)));
		const prompt = sv(p.prompt, '$');
		const cpf = typeof p.cpf === 'number' ? p.cpf : CPF;
		const cmdGap = typeof p.cmd_gap === 'number' ? p.cmd_gap : 10;
		const lineGap = typeof p.line_gap === 'number' ? p.line_gap : 6;
		if (cmd) {
			out.push({text: cmd, kind: 'cmd', t0: t, prompt, cpf});
			t += Math.ceil(cmd.length * cpf) + cmdGap;
		}
		const o = p.out ?? p.output ?? p.lines;
		const lines = Array.isArray(o) ? o.map((x) => sv(x)) : typeof o === 'string' ? o.split('\n') : [];
		lines.forEach((l, i) => out.push({text: l, kind: 'out', t0: t + i * lineGap, prompt: '', cpf}));
	}
	return out;
};
/** Visible terminal text at `frame` (typed prefix for commands). */
export const termStateAt = (item: Item, frame: number): {visible: boolean; lines: string[]} => {
	if (frame < item.start) return {visible: false, lines: []};
	const lines = termLines(item)
		.filter((l) => frame >= l.t0)
		.map((l) => (l.kind === 'cmd' ? l.text.slice(0, Math.floor((frame - l.t0) / l.cpf) + 1) : l.text));
	return {visible: true, lines};
};

// ---------------- code ----------------
export const codeLines = (item: Item): string[] => {
	const p = item.props;
	const raw = p.code ?? p.text ?? p.snippet ?? '';
	return Array.isArray(raw) ? raw.map((x) => sv(x)) : sv(raw).replace(/\t/g, '  ').split('\n');
};
export const codeStateAt = (item: Item, frame: number) => {
	const all = codeLines(item);
	const shown = all.filter((_, i) => frame >= item.start + 8 + i * 3 + 4);
	return {visible: frame >= item.start, lines: shown, total: all.length, title: sv(item.props.title, sv(item.props.file))};
};

// ---------------- commit ----------------
export const COMMIT_STAGES = [
	{key: 'broke', label: 'broke'},
	{key: 'fix', label: 'fix'},
	{key: 'why', label: 'why it works'},
] as const;
/** Commit story text as known at `upTo` (updates that have not happened yet are not applied early). */
export const commitStages = (item: Item, upTo = Infinity) => {
	const src = [{frame: item.start, p: item.props}, ...item.updates.map((u) => ({frame: u.frame, p: u.props}))].filter((x) => x.frame <= upTo);
	const text: Record<string, string> = {};
	const when: Record<string, number> = {};
	let repo = '';
	let title = '';
	for (const {frame: fr, p} of src) {
		repo = sv(p.repo, repo);
		title = sv(p.title, title);
		let k = 0;
		for (const s of COMMIT_STAGES) {
			const v = sv(p[s.key] ?? (s.key === 'why' ? p.why_it_works : undefined));
			if (v) {
				text[s.key] = v;
				when[s.key] = fr + k * 30;
				k++;
			}
		}
	}
	return {repo, title, text, when};
};
export const commitStateAt = (item: Item, frame: number) => {
	const c = commitStages(item, frame);
	return {
		visible: frame >= item.start,
		repo: c.repo,
		stages: COMMIT_STAGES.filter((s) => c.when[s.key] !== undefined && frame >= c.when[s.key]).map((s) => s.key as string),
	};
};

// ---------------- scene / layout ----------------
export const sceneAt = (tl: Timeline, frame: number): Scene | undefined =>
	tl.scenes.find((s) => frame >= s.start && frame < s.end);

export interface Visible {
	key: string;
	kind: string;
	rect: Rect;
}

/** All elements on screen (items + phone) at `frame`, with their bounding boxes. */
export const visibleAt = (tl: Timeline, frame: number): Visible[] => {
	const sc = sceneAt(tl, frame);
	if (!sc) return [];
	const out: Visible[] = sc.items.filter((i) => itemVisible(i, frame)).map((i) => ({key: i.key, kind: i.kind, rect: i.rect}));
	if (sc.phone && frame >= sc.phone.start) out.push({key: 'phone', kind: 'phone', rect: sc.phone.body});
	return out;
};

export const SAFE: Rect = {x: 12, y: 12, w: W - 24, h: H - 24};

const inside = (r: Rect, o: Rect, tol = 0) =>
	r.x >= o.x - tol && r.y >= o.y - tol && r.x + r.w <= o.x + o.w + tol && r.y + r.h <= o.y + o.h + tol;
const overlap = (a: Rect, b: Rect, gap = 0) =>
	a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** Static layout problems of a scene: overlaps, outside content/safe area, bleeding into captions. */
export const layoutProblems = (sc: Scene): string[] => {
	const probs: string[] = [];
	const els: Visible[] = sc.items.map((i) => ({key: i.key, kind: i.kind, rect: i.rect}));
	if (sc.phone) els.push({key: 'phone', kind: 'phone', rect: sc.phone.body});
	for (const e of els) {
		if (!inside(e.rect, SAFE)) probs.push(`${e.kind} ${e.key} outside the safe area`);
		if (e.rect.y + e.rect.h > CAPTION_AREA.y - 4) probs.push(`${e.kind} ${e.key} runs into the caption area`);
		if (e.rect.y < CONTENT.y - 2) probs.push(`${e.kind} ${e.key} above the content area`);
		const z = zoneHit(e.rect);
		if (z) probs.push(`${e.kind} ${e.key} is inside the ${z} overlay zone`);
	}
	for (let i = 0; i < els.length; i++)
		for (let j = i + 1; j < els.length; j++)
			if (overlap(els[i].rect, els[j].rect, 0)) probs.push(`${els[i].kind} ${els[i].key} overlaps ${els[j].kind} ${els[j].key}`);
	return probs;
};

// ---------------- define ----------------
export const defineAt = (tl: Timeline, frame: number): DefineT | undefined =>
	tl.defines.find((d) => frame >= d.frame && frame < d.frame + d.frames);

/** Beat currently being captioned (line plus 6 frames of linger). */
export const beatAt = (tl: Timeline, frame: number) => {
	// the latest beat that has started: an earlier beat's linger never overlaps the next beat's caption
	let cur;
	for (const b of tl.beats) if (b.start <= frame) cur = b;
	return cur && frame <= cur.end + 6 ? cur : undefined;
};
