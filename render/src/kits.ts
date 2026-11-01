/**
 * Visualization kits (decisions.md: "Visualization type follows the scenario"): pure models, state-at-frame
 * functions and geometry for the six scenario components. No React, no DOM: the renderer
 * (components/Kits.tsx), the QA gate (verify-lib.ts) and vitest all use these.
 *
 *   seq.diagram    sequence diagram: lifelines, messages animate between actors, the latest step is highlighted
 *   tree           AST / file tree / build graph: nodes appear, a path is highlighted step by step
 *   timeline.track scheduler / boot timeline: lanes, blocks slide in, a playhead moves
 *   packet.flow    packets travel between nodes, with drop and retry
 *   code.editor    typing with a cursor, or a diff with +/- lines
 *   chart.plot     scatter / line / loss curve drawn on
 *
 * Every kit item can be built up over several beats: a later action with the same `id` appends actors,
 * messages, nodes, blocks, packets, lines or points (and may replace `path` / `playhead`).
 */
import type {Item} from './timeline';
import {measure} from './text';
import {fitCode, revealRows} from './codewrap';
import {clamp01, lerp} from './theme';

export const KIT_KINDS = ['seq', 'tree', 'track', 'packets', 'editor', 'plot'] as const;
export type KitKind = (typeof KIT_KINDS)[number];

/** action `do` -> item kind */
export const KIT_ACTIONS: Record<string, KitKind> = {
	'seq.diagram': 'seq',
	tree: 'tree',
	'timeline.track': 'track',
	'packet.flow': 'packets',
	'code.editor': 'editor',
	'chart.plot': 'plot',
};
export const isKitKind = (k: string): k is KitKind => (KIT_KINDS as readonly string[]).includes(k);

export const LABEL_PX = 22;
export const CODE_PX_MIN = 16;
const PAD = 14;

type Props = Record<string, unknown>;
const sv = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const nv = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Props => (v && typeof v === 'object' ? (v as Props) : {});

export interface Src {
	frame: number;
	p: Props;
}
export const srcsOf = (item: Item): Src[] => [{frame: item.start, p: item.props}, ...item.updates.map((u) => ({frame: u.frame, p: u.props}))];

const textW = (s: string, size = LABEL_PX) => measure(s, 'hand', size);

export interface KRect {
	x: number;
	y: number;
	w: number;
	h: number;
}
const within = (r: KRect, w: number, h: number, tol = 1) => r.x >= -tol && r.y >= -tol && r.x + r.w <= w + tol && r.y + r.h <= h + tol;
const overlaps = (a: KRect, b: KRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** What the QA gate checks about a kit item at a frame. */
export interface KitSnap {
	kind: KitKind;
	/** revealed elements (== [data-kel] nodes in the DOM) */
	els: number;
	/** highlighted "current step" elements (== [data-kcur] nodes) */
	cur: number;
	/** the kit declares a step / path / playhead, so one element must be highlighted once it is all revealed */
	wantsCur: boolean;
	/** text a viewer can read at this frame */
	texts: string[];
	/** frame at which everything declared has finished animating */
	settle: number;
	/** geometry problems at the item's rect */
	problems: string[];
}

// ------------------------------------------------------------------------------------------ seq.diagram
export const SEQ_STEP = 26; // frames between messages of one action
export const SEQ_ANIM = 18; // frames an arrow takes to travel
export const SEQ_HEAD = 56;

export interface SeqActor {
	id: string;
	label: string;
}
export interface SeqMsg {
	idx: number;
	from: string;
	to: string;
	label: string;
	t0: number;
	/** return / reply arrows are dashed */
	reply: boolean;
}

const actorOf = (a: unknown): SeqActor => {
	if (typeof a === 'string') return {id: a, label: a};
	const o = rec(a);
	const label = sv(o.label, sv(o.name, sv(o.id)));
	return {id: sv(o.id, label), label};
};

export const seqModel = (item: Item): {actors: SeqActor[]; msgs: SeqMsg[]} => {
	const actors: SeqActor[] = [];
	const msgs: SeqMsg[] = [];
	const resolve = (x: string) => actors.find((a) => a.id === x || a.label.toLowerCase() === x.toLowerCase())?.id ?? x;
	for (const {frame, p} of srcsOf(item)) {
		for (const a of arr(p.actors).map(actorOf)) if (a.id && !actors.some((x) => x.id === a.id)) actors.push(a);
		arr(p.messages).forEach((m, k) => {
			const o = rec(m);
			msgs.push({idx: msgs.length, from: resolve(sv(o.from)), to: resolve(sv(o.to)), label: sv(o.label, sv(o.text)), t0: frame + k * SEQ_STEP, reply: o.reply === true || o.dashed === true});
		});
	}
	for (const m of msgs) for (const id of [m.from, m.to]) if (id && !actors.some((a) => a.id === id)) actors.push({id, label: id});
	return {actors, msgs};
};

export const seqStateAt = (item: Item, frame: number) => {
	const {actors, msgs} = seqModel(item);
	const shown = msgs.filter((m) => frame >= m.t0).map((m) => ({...m, p: clamp01((frame - m.t0) / SEQ_ANIM)}));
	return {actors, msgs: shown, total: msgs.length, current: shown.length ? shown[shown.length - 1].idx : -1};
};

export interface SeqGeom {
	actors: (SeqActor & {box: KRect; cx: number})[];
	rowY: number[];
	labels: KRect[];
	bottom: number;
}
export const seqLayout = (item: Item, w: number, h: number): SeqGeom => {
	const {actors, msgs} = seqModel(item);
	const n = Math.max(1, actors.length);
	const colW = (w - PAD * 2) / n;
	const boxes = actors.map((a, i) => {
		const bw = Math.min(colW - 6, textW(a.label) + 22);
		const cx = PAD + colW * (i + 0.5);
		return {...a, cx, box: {x: cx - bw / 2, y: 8, w: bw, h: SEQ_HEAD - 12}};
	});
	const top = SEQ_HEAD + 18;
	const rowH = Math.min(78, (h - top - 12) / Math.max(1, msgs.length));
	const rowY = msgs.map((_, i) => top + rowH * (i + 0.5) + 10);
	const cxOf = (id: string) => boxes.find((b) => b.id === id)?.cx ?? w / 2;
	const labels = msgs.map((m, i) => {
		const lw = textW(m.label) + 12;
		const mid = (cxOf(m.from) + cxOf(m.to)) / 2;
		return {x: mid - lw / 2, y: rowY[i] - 34, w: lw, h: 30};
	});
	return {actors: boxes, rowY, labels, bottom: top + rowH * msgs.length};
};

export const seqSnap = (item: Item, frame: number, w: number, h: number): KitSnap => {
	const st = seqStateAt(item, frame);
	const g = seqLayout(item, w, h);
	const problems: string[] = [];
	const colW = (w - PAD * 2) / Math.max(1, g.actors.length);
	for (const a of g.actors) if (textW(a.label) + 16 > colW) problems.push(`actor "${a.label}" is wider than its column (${Math.round(textW(a.label) + 16)} > ${Math.round(colW)} px)`);
	if (st.total && (h - SEQ_HEAD - 30) / st.total < 52) problems.push(`${st.total} messages do not fit in ${Math.round(h)} px (need >= 52 px per row)`);
	g.labels.forEach((l, i) => {
		if (!within(l, w, h)) problems.push(`message ${i + 1} label "${seqModel(item).msgs[i].label}" leaves the diagram`);
		for (let j = 0; j < i; j++) if (overlaps(l, g.labels[j])) problems.push(`message ${i + 1} label overlaps message ${j + 1}`);
	});
	const last = seqModel(item).msgs;
	return {
		kind: 'seq',
		els: st.actors.length + st.msgs.length,
		cur: st.current >= 0 ? 1 : 0,
		wantsCur: st.total > 0,
		texts: [...st.actors.map((a) => a.label), ...st.msgs.filter((m) => m.p > 0.5).map((m) => m.label)],
		settle: last.length ? Math.max(...last.map((m) => m.t0)) + SEQ_ANIM + 4 : item.start + 10,
		problems,
	};
};

// ------------------------------------------------------------------------------------------ tree
export const TREE_STEP = 8;
export const TREE_PATH_STEP = 12;
export const NODE_H = 46;

export interface TreeNode {
	id: string;
	label: string;
	parent?: string;
	t0: number;
}
export const treeModel = (item: Item): {nodes: TreeNode[]; path: {id: string; t0: number}[]; indent: boolean} => {
	const nodes: TreeNode[] = [];
	let path: {id: string; t0: number}[] = [];
	let indent = false;
	for (const {frame, p} of srcsOf(item)) {
		arr(p.nodes).forEach((n, k) => {
			const o = typeof n === 'string' ? {id: n, label: n} : rec(n);
			const id = sv(o.id, sv(o.label));
			if (id && !nodes.some((x) => x.id === id)) nodes.push({id, label: sv(o.label, id), parent: o.parent === undefined ? undefined : sv(o.parent), t0: frame + k * TREE_STEP});
		});
		if (Array.isArray(p.path)) path = p.path.map((x, k) => ({id: sv(x), t0: frame + k * TREE_PATH_STEP}));
		if (p.layout === 'indent' || p.layout === 'files') indent = true;
	}
	return {nodes, path, indent};
};

export interface TreeGeom {
	boxes: Map<string, KRect>;
	depth: Map<string, number>;
	/** file-tree rows with elbow connectors instead of a top-down tree */
	indent: boolean;
}
export const treeLayout = (item: Item, w: number, h: number): TreeGeom => {
	const {nodes, indent} = treeModel(item);
	const kids = new Map<string | undefined, TreeNode[]>();
	const ids = new Set(nodes.map((n) => n.id));
	for (const n of nodes) {
		const par = n.parent !== undefined && ids.has(n.parent) ? n.parent : undefined;
		kids.set(par, [...(kids.get(par) ?? []), n]);
	}
	const boxes = new Map<string, KRect>();
	const depth = new Map<string, number>();
	const width = (n: TreeNode) => Math.max(56, textW(n.label) + 24);
	if (indent) {
		let row = 0;
		const walk = (n: TreeNode, d: number) => {
			depth.set(n.id, d);
			boxes.set(n.id, {x: 10 + d * 34, y: 6 + row * (NODE_H + 4), w: width(n), h: NODE_H});
			row++;
			for (const c of kids.get(n.id) ?? []) walk(c, d + 1);
		};
		for (const r of kids.get(undefined) ?? []) walk(r, 0);
		return {boxes, depth, indent: true};
	}
	// tidy tree: leaves get consecutive slots, parents sit above the middle of their children
	let cursor = 0;
	const cx = new Map<string, number>();
	let maxD = 0;
	const place = (n: TreeNode, d: number) => {
		depth.set(n.id, d);
		maxD = Math.max(maxD, d);
		const ch = kids.get(n.id) ?? [];
		if (!ch.length) {
			cx.set(n.id, cursor + width(n) / 2);
			cursor += width(n) + 14;
		} else {
			ch.forEach((c) => place(c, d + 1));
			cx.set(n.id, (cx.get(ch[0].id)! + cx.get(ch[ch.length - 1].id)!) / 2);
		}
	};
	for (const r of kids.get(undefined) ?? []) place(r, 0);
	const total = Math.max(0, cursor - 14);
	const x0 = Math.max(PAD / 2, (w - total) / 2);
	const lvl = maxD ? Math.min(110, (h - NODE_H - 16) / maxD) : 0;
	for (const n of nodes) {
		if (!cx.has(n.id)) continue;
		const bw = width(n);
		boxes.set(n.id, {x: x0 + cx.get(n.id)! - bw / 2, y: 8 + depth.get(n.id)! * lvl, w: bw, h: NODE_H});
	}
	return {boxes, depth, indent: false};
};

export const treeStateAt = (item: Item, frame: number) => {
	const m = treeModel(item);
	const visible = m.nodes.filter((n) => frame >= n.t0).map((n) => ({...n, p: clamp01((frame - n.t0) / 10)}));
	const on = m.path.filter((x) => frame >= x.t0).map((x) => x.id);
	return {nodes: visible, path: on, current: on.length ? on[on.length - 1] : undefined, total: m.nodes.length};
};

export const treeSnap = (item: Item, frame: number, w: number, h: number): KitSnap => {
	const st = treeStateAt(item, frame);
	const m = treeModel(item);
	const g = treeLayout(item, w, h);
	const problems: string[] = [];
	const list = [...g.boxes.entries()];
	for (const [id, r] of list) if (!within(r, w, h)) problems.push(`node "${m.nodes.find((n) => n.id === id)?.label}" leaves the tree area (${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)} in ${Math.round(w)}x${Math.round(h)})`);
	for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlaps(list[i][1], list[j][1])) problems.push(`nodes ${list[i][0]} and ${list[j][0]} overlap`);
	for (const x of m.path) if (!m.nodes.some((n) => n.id === x.id)) problems.push(`path node "${x.id}" is not in the tree`);
	const ends = [...m.nodes.map((n) => n.t0 + 12), ...m.path.map((x) => x.t0 + 12)];
	return {
		kind: 'tree',
		els: st.nodes.length,
		cur: st.current ? 1 : 0,
		wantsCur: m.path.length > 0,
		texts: st.nodes.map((n) => n.label),
		settle: (ends.length ? Math.max(...ends) : item.start) + 4,
		problems,
	};
};

// ------------------------------------------------------------------------------------------ timeline.track
export const TRACK_STEP = 7;
export const TRACK_SLIDE = 16;
export const TRACK_AXIS = 34;

export interface TrackBlock {
	lane: string;
	start: number;
	end: number;
	label: string;
	t0: number;
	tone: string;
}
export const trackModel = (item: Item) => {
	const lanes: {id: string; label: string}[] = [];
	const blocks: TrackBlock[] = [];
	let span: [number, number] | undefined;
	let head: {from: number; to: number; frames: number; frame: number} | undefined;
	for (const {frame, p} of srcsOf(item)) {
		for (const l of arr(p.lanes)) {
			const a = actorOf(l);
			if (a.id && !lanes.some((x) => x.id === a.id)) lanes.push(a);
		}
		arr(p.blocks).forEach((b, k) => {
			const o = rec(b);
			const lane = sv(o.lane);
			if (lane && !lanes.some((x) => x.id === lane || x.label === lane)) lanes.push({id: lane, label: lane});
			const l = lanes.find((x) => x.id === lane || x.label === lane);
			blocks.push({lane: l?.id ?? lane, start: nv(o.start, 0), end: nv(o.end, nv(o.start, 0) + 1), label: sv(o.label), t0: frame + k * TRACK_STEP, tone: sv(o.tone, 'ink')});
		});
		if (Array.isArray(p.span) && p.span.length === 2) span = [nv(p.span[0], 0), nv(p.span[1], 1)];
		const ph = rec(p.playhead);
		if (p.playhead !== undefined) head = {from: nv(ph.from, span?.[0] ?? 0), to: nv(ph.to, span?.[1] ?? 1), frames: Math.max(1, Math.round((nv(ph.ms, 1500) / 1000) * 30)), frame};
	}
	const s0 = span?.[0] ?? Math.min(0, ...blocks.map((b) => b.start));
	const s1 = span?.[1] ?? Math.max(s0 + 1, ...blocks.map((b) => b.end));
	return {lanes, blocks, span: [s0, s1] as [number, number], head};
};

export const trackGeom = (item: Item, w: number, h: number) => {
	const m = trackModel(item);
	const labelW = Math.min(170, Math.max(60, ...m.lanes.map((l) => textW(l.label) + 18)));
	const x0 = labelW + 10;
	const W = w - x0 - 12;
	const laneH = Math.min(96, (h - TRACK_AXIS - 10) / Math.max(1, m.lanes.length));
	const X = (t: number) => x0 + ((t - m.span[0]) / (m.span[1] - m.span[0])) * W;
	const lanes = m.lanes.map((l, i) => ({...l, y: 6 + i * laneH, h: laneH}));
	const blocks = m.blocks.map((b) => {
		const li = Math.max(0, m.lanes.findIndex((l) => l.id === b.lane));
		return {...b, rect: {x: X(b.start), y: 6 + li * laneH + 8, w: Math.max(2, X(b.end) - X(b.start)), h: laneH - 16}};
	});
	return {...m, labelW, x0, W, laneH, X, lanes, blocks, axisY: 6 + m.lanes.length * laneH + 4};
};

export const trackStateAt = (item: Item, frame: number) => {
	const g = trackGeom(item, 600, 400);
	const blocks = g.blocks.filter((b) => frame >= b.t0).map((b) => ({...b, p: clamp01((frame - b.t0) / TRACK_SLIDE)}));
	const hd = g.head;
	const t = hd ? lerp(hd.from, hd.to, clamp01((frame - hd.frame) / hd.frames)) : undefined;
	const active = t === undefined ? [] : blocks.filter((b) => b.p >= 1 && t >= b.start && t <= b.end);
	return {lanes: g.lanes, blocks, playhead: t, active, total: g.blocks.length};
};

export const trackSnap = (item: Item, frame: number, w: number, h: number): KitSnap => {
	const g = trackGeom(item, w, h);
	const st = trackStateAt(item, frame);
	const problems: string[] = [];
	if (g.laneH < 40) problems.push(`${g.lanes.length} lanes do not fit in ${Math.round(h)} px`);
	for (const b of g.blocks) {
		if (!within(b.rect, w, h)) problems.push(`block "${b.label}" leaves the track area`);
		if (b.label && textW(b.label) + 12 > b.rect.w) problems.push(`block "${b.label}" is narrower than its label (${Math.round(b.rect.w)} < ${Math.round(textW(b.label) + 12)} px)`);
	}
	for (let i = 0; i < g.blocks.length; i++) for (let j = i + 1; j < g.blocks.length; j++) if (g.blocks[i].lane === g.blocks[j].lane && overlaps(g.blocks[i].rect, g.blocks[j].rect)) problems.push(`blocks "${g.blocks[i].label}" and "${g.blocks[j].label}" overlap in lane ${g.blocks[i].lane}`);
	const hd = g.head;
	const ends = [...g.blocks.map((b) => b.t0 + TRACK_SLIDE), ...(hd ? [hd.frame + hd.frames] : [])];
	return {
		kind: 'track',
		els: st.lanes.length + st.blocks.length,
		cur: st.active.length,
		wantsCur: g.head !== undefined,
		texts: [...st.lanes.map((l) => l.label), ...st.blocks.filter((b) => b.p > 0.5).map((b) => b.label)],
		settle: (ends.length ? Math.max(...ends) : item.start) + 4,
		problems,
	};
};

// ------------------------------------------------------------------------------------------ packet.flow
export const PK_STEP = 34;
export const PK_TRAVEL = 26;
export const PK_DROP_AT = 0.55;

export interface Pkt {
	idx: number;
	from: string;
	to: string;
	label: string;
	drop: boolean;
	retry: boolean;
	t0: number;
}
export const packetModel = (item: Item) => {
	const nodes: SeqActor[] = [];
	const packets: Pkt[] = [];
	for (const {frame, p} of srcsOf(item)) {
		for (const n of arr(p.nodes).map(actorOf)) if (n.id && !nodes.some((x) => x.id === n.id)) nodes.push(n);
		arr(p.packets).forEach((q, k) => {
			const o = rec(q);
			const find = (x: string) => nodes.find((n) => n.id === x || n.label.toLowerCase() === x.toLowerCase())?.id ?? x;
			packets.push({idx: packets.length, from: find(sv(o.from)), to: find(sv(o.to)), label: sv(o.label), drop: o.drop === true, retry: o.retry === true, t0: frame + k * PK_STEP});
		});
	}
	for (const q of packets) for (const id of [q.from, q.to]) if (id && !nodes.some((n) => n.id === id)) nodes.push({id, label: id});
	return {nodes, packets};
};

export const packetGeom = (item: Item, w: number, h: number) => {
	const {nodes, packets} = packetModel(item);
	const n = Math.max(1, nodes.length);
	const colW = (w - PAD * 2) / n;
	const cy = Math.round(h * 0.4);
	const boxes = nodes.map((nd, i) => {
		const bw = Math.min(colW - 10, textW(nd.label) + 26);
		const cx = PAD + colW * (i + 0.5);
		return {...nd, cx, box: {x: cx - bw / 2, y: cy - 34, w: bw, h: 68}};
	});
	return {nodes: boxes, packets, cy, colW};
};

export const packetStateAt = (item: Item, frame: number) => {
	const {nodes, packets} = packetModel(item);
	const shown = packets.filter((q) => frame >= q.t0).map((q) => {
		const p = clamp01((frame - q.t0) / PK_TRAVEL);
		const status = p < 1 ? 'moving' : q.drop ? 'dropped' : 'delivered';
		return {...q, p, pos: q.drop ? Math.min(p, 1) * PK_DROP_AT : p, status: status as 'moving' | 'dropped' | 'delivered'};
	});
	return {
		nodes,
		packets: shown,
		delivered: shown.filter((q) => q.status === 'delivered').length,
		dropped: shown.filter((q) => q.status === 'dropped').length,
		current: shown.length ? shown[shown.length - 1] : undefined,
		total: packets.length,
	};
};

export const packetSnap = (item: Item, frame: number, w: number, h: number): KitSnap => {
	const g = packetGeom(item, w, h);
	const st = packetStateAt(item, frame);
	const problems: string[] = [];
	for (const n of g.nodes) if (textW(n.label) + 18 > g.colW) problems.push(`node "${n.label}" is wider than its column (${Math.round(textW(n.label) + 18)} > ${Math.round(g.colW)} px)`);
	for (const q of g.packets) {
		for (const id of [q.from, q.to]) if (!g.nodes.some((n) => n.id === id)) problems.push(`packet ${q.idx + 1} refers to unknown node "${id}"`);
		if (q.from === q.to) problems.push(`packet ${q.idx + 1} starts and ends at "${q.from}"`);
	}
	for (const n of g.nodes) if (!within(n.box, w, h)) problems.push(`node "${n.label}" leaves the area`);
	const ends = g.packets.map((q) => q.t0 + PK_TRAVEL);
	return {
		kind: 'packets',
		els: st.nodes.length + st.packets.length,
		cur: st.current ? 1 : 0,
		wantsCur: st.total > 0,
		texts: [...st.nodes.map((n) => n.label), ...(st.current && st.current.label ? [st.current.label] : []), `delivered ${st.delivered}`, `dropped ${st.dropped}`],
		settle: (ends.length ? Math.max(...ends) : item.start) + 4,
		problems,
	};
};

// ------------------------------------------------------------------------------------------ code.editor
export const ED_GAP = 4;
export const ED_HEAD = 46;
export const ED_GUTTER = 46;

export interface EdLine {
	idx: number;
	text: string;
	op: ' ' | '+' | '-';
	t0: number;
	frames: number;
	diff: boolean;
}
export const editorModel = (item: Item): {title: string; lines: EdLine[]} => {
	const lines: EdLine[] = [];
	let title = '';
	let free = item.start; // the frame the next line may start at
	for (const {frame, p} of srcsOf(item)) {
		title = sv(p.file, sv(p.title, title));
		const diff = arr(p.diff);
		const typed = arr(p.lines ?? p.code);
		const add = (text: string, op: EdLine['op'], isDiff: boolean) => {
			const frames = isDiff ? 5 : Math.min(42, Math.ceil(text.length * 1.1) + 2);
			const t0 = Math.max(frame, free);
			lines.push({idx: lines.length, text, op, t0, frames, diff: isDiff});
			free = t0 + frames + ED_GAP;
		};
		for (const d of diff) {
			if (typeof d === 'string') {
				const op = d[0] === '+' || d[0] === '-' ? (d[0] as '+' | '-') : ' ';
				add(op === ' ' ? d : d.slice(1).replace(/^ /, ''), op, true);
			} else {
				const o = rec(d);
				const op = o.op === '+' || o.op === '-' ? (o.op as '+' | '-') : ' ';
				add(sv(o.text), op, true);
			}
		}
		for (const t of typed) add(sv(t).replace(/\t/g, '  '), ' ', false);
	}
	return {title, lines};
};

export const editorGeom = (item: Item, w: number, h: number) => {
	const m = editorModel(item);
	const maxChars = Math.max(8, ...m.lines.map((l) => l.text.length + (l.diff ? 2 : 0)));
	const areaW = w - ED_GUTTER - 36 - 4;
	const areaH = h - ED_HEAD - 16;
	// long lines wrap at sensible break points; the font never drops below CODE_PX_MIN
	const fit = fitCode(
		m.lines.map((l) => (l.diff ? '  ' : '') + l.text),
		areaW,
		areaH,
		{maxFs: 26},
	);
	const fs = Math.max(CODE_PX_MIN, fit.fs);
	const lh = Math.round(fs * 1.5);
	const cap = Math.max(1, Math.floor(areaH / lh));
	return {...m, fs, lh, cap, fits: fit.clean, maxChars, rowsOf: fit.rows, areaW};
};

/** Visible visual rows of the editor at `frame` (wrapped source lines, newest `cap` rows). */
export const editorRowsAt = (item: Item, frame: number, w: number, h: number) => {
	const g = editorGeom(item, w, h);
	const s = editorStateAt(item, frame);
	const flat = s.lines.flatMap((l) => {
		const rows = g.rowsOf[l.idx] ?? [l.text];
		const vis = revealRows(rows, (l.diff ? 2 : 0) + l.typed.length);
		return rows.map((full, ri) => ({line: l, ri, first: ri === 0, full, text: vis[ri]}));
	});
	return {g, s, rows: flat.slice(Math.max(0, flat.length - g.cap))};
};

export const editorStateAt = (item: Item, frame: number) => {
	const g = editorGeom(item, 600, 400);
	const started = g.lines.filter((l) => frame >= l.t0);
	const lines = started.map((l) => {
		const n = l.diff ? l.text.length : Math.min(l.text.length, Math.floor(((frame - l.t0) / l.frames) * l.text.length) + 1);
		const done = frame >= l.t0 + l.frames;
		return {...l, typed: done || l.diff ? l.text : l.text.slice(0, n), done, shown: l.diff ? frame >= l.t0 + 1 : true};
	});
	const typing = lines.find((l) => !l.done && !l.diff);
	// the current line is the one being typed, else the newest line (a diff has no cursor, but its newest line is the step)
	const cur = typing ?? lines[lines.length - 1];
	return {title: g.title, lines, cursor: cur ? {line: cur.idx, col: cur.typed.length} : undefined, total: g.lines.length, typing: !!typing};
};

export const editorSnap = (item: Item, frame: number, w: number, h: number): KitSnap => {
	const {g, s: st, rows} = editorRowsAt(item, frame, w, h);
	const problems: string[] = [];
	if (!g.fits) problems.push(`a line with no break point (longest ${g.maxChars} chars) needs a font < ${CODE_PX_MIN} px in ${Math.round(w)} px`);
	const ends = g.lines.map((l) => l.t0 + l.frames);
	return {
		kind: 'editor',
		els: rows.filter((r) => r.first).length,
		cur: st.lines.length ? 1 : 0,
		wantsCur: st.total > 0,
		texts: st.lines.filter((l) => l.done).map((l) => l.text),
		settle: (ends.length ? Math.max(...ends) : item.start) + 4,
		problems,
	};
};

// ------------------------------------------------------------------------------------------ chart.plot
export const PT_STEP = 4;
export const PLOT_L = 92;
export const PLOT_B = 64;
export const PLOT_T = 44;

export interface PlotPt {
	x: number;
	y: number;
	t0: number;
}
export interface PlotSeries {
	name: string;
	points: PlotPt[];
}
export const plotModel = (item: Item) => {
	const series: PlotSeries[] = [];
	let kind = 'line';
	let xlabel = '';
	let ylabel = '';
	const get = (name: string) => {
		let s = series.find((x) => x.name === name);
		if (!s) series.push((s = {name, points: []}));
		return s;
	};
	for (const {frame, p} of srcsOf(item)) {
		kind = sv(p.kind, kind);
		xlabel = sv(p.xlabel, xlabel);
		ylabel = sv(p.ylabel, ylabel);
		const lists: {name: string; pts: unknown[]}[] = Array.isArray(p.series) ? p.series.map((s) => ({name: sv(rec(s).name, 'y'), pts: arr(rec(s).points)})) : Array.isArray(p.points) ? [{name: sv(p.name, 'y'), pts: p.points}] : [];
		for (const l of lists) {
			const s = get(l.name);
			l.pts.forEach((q, k) => {
				const a = arr(q);
				const x = nv(a[0], s.points.length);
				const y = nv(a[1], 0);
				s.points.push({x, y, t0: frame + k * PT_STEP});
			});
		}
	}
	const dom1 = (vals: number[], padFrac: number): [number, number] => {
		if (!vals.length) return [0, 1];
		const lo = Math.min(...vals);
		const hi = Math.max(...vals);
		const d = hi - lo || 1;
		return [lo - d * padFrac, hi + d * padFrac];
	};
	const [x0, x1] = dom1(series.flatMap((s) => s.points.map((q) => q.x)), 0.04);
	const [y0, y1] = dom1(series.flatMap((s) => s.points.map((q) => q.y)), 0.08);
	return {series, kind, xlabel, ylabel, dom: {x0, x1, y0, y1}};
};

export const plotGeom = (item: Item, w: number, h: number) => {
	const m = plotModel(item);
	const area: KRect = {x: PLOT_L, y: PLOT_T, w: w - PLOT_L - 18, h: h - PLOT_T - PLOT_B};
	const X = (x: number) => area.x + ((x - m.dom.x0) / (m.dom.x1 - m.dom.x0)) * area.w;
	const Y = (y: number) => area.y + area.h - ((y - m.dom.y0) / (m.dom.y1 - m.dom.y0)) * area.h;
	return {...m, area, X, Y};
};

export const plotStateAt = (item: Item, frame: number) => {
	const m = plotModel(item);
	const series = m.series.map((s) => {
		const vis = s.points.filter((q) => frame >= q.t0);
		const next = s.points[vis.length];
		// the segment to the next point is drawn on as the point arrives
		const grow = next ? clamp01((frame - (next.t0 - PT_STEP)) / PT_STEP) : 0;
		return {name: s.name, visible: vis, grow, head: vis[vis.length - 1], total: s.points.length};
	});
	return {series, kind: m.kind, count: series.reduce((a, s) => a + s.visible.length, 0), total: series.reduce((a, s) => a + s.total, 0)};
};

export const plotSnap = (item: Item, frame: number, w: number, h: number): KitSnap => {
	const g = plotGeom(item, w, h);
	const st = plotStateAt(item, frame);
	const problems: string[] = [];
	for (const s of g.series)
		for (const q of s.points) {
			const px = g.X(q.x);
			const py = g.Y(q.y);
			if (px < g.area.x - 1 || px > g.area.x + g.area.w + 1 || py < g.area.y - 1 || py > g.area.y + g.area.h + 1) problems.push(`point (${q.x}, ${q.y}) of "${s.name}" is outside the plot`);
		}
	if (g.area.h < 120) problems.push(`plot area only ${Math.round(g.area.h)} px high`);
	const ends = g.series.flatMap((s) => s.points.map((q) => q.t0));
	return {
		kind: 'plot',
		els: st.count,
		cur: st.series.some((s) => s.head) ? 1 : 0,
		wantsCur: st.total > 0,
		texts: st.series.filter((s) => s.head).map((s) => `${s.name} ${Math.round(s.head!.y * 100) / 100}`),
		settle: (ends.length ? Math.max(...ends) : item.start) + 6,
		problems,
	};
};

// ------------------------------------------------------------------------------------------ dispatch
export const kitSnap = (item: Item, frame: number, w = item.rect.w, h = item.rect.h): KitSnap | undefined => {
	switch (item.kind) {
		case 'seq':
			return seqSnap(item, frame, w, h);
		case 'tree':
			return treeSnap(item, frame, w, h);
		case 'track':
			return trackSnap(item, frame, w, h);
		case 'packets':
			return packetSnap(item, frame, w, h);
		case 'editor':
			return editorSnap(item, frame, w, h);
		case 'plot':
			return plotSnap(item, frame, w, h);
	}
	return undefined;
};
