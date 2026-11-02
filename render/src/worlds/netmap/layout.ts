/**
 * netmap geometry, shared by the view, the gate's `texts` and `problems`: one pure function turns a state and a slot
 * into every box, link, packet position and text the viewer sees, so what the gate checks is what the view draws.
 * Coordinates are local to the world's slot (0,0 = its top-left corner).
 */
import type {Rect} from '../../theme';
import {measure} from '../../text';
import type {BurstS, LinkS, NetState, NodeS, PacketS} from './model';

export const TITLE_H = 38;
export const HUD_H = 40;
export const LOG_HEAD_H = 28;
export const LOG_ROW_H = 24;
export const LOG_H = LOG_HEAD_H + 5 * LOG_ROW_H + 10;
export const CODE_PX = 17;
export const LABEL_PX = 24;
export const NODE_H = 54;
export const CROWN_W = 34;
export const CROWN_H = 24;
export const CHIP_H = 26;
export const ROW = {badge: 30, timer: 30, buf: 46, stat: 30} as const;
export const PKT_W = 30;
export const PKT_H = 20;

export interface Pt {
	x: number;
	y: number;
}

export type ItemKind = 'title' | 'status' | 'node' | 'badge' | 'timer' | 'buf' | 'stat' | 'hud' | 'link' | 'packet' | 'burst' | 'logHead' | 'log';

/** One piece of text on screen. `box` is its chip (or row); `transient` items (flying packets) skip the overlap check. */
export interface TItem {
	id: string;
	kind: ItemKind;
	text: string;
	box: Rect;
	size: number;
	font: 'hand' | 'mono';
	/** a node name: drawn as a label (>= 22 px) */
	label: boolean;
	tone?: string;
	transient: boolean;
	/** log rows: the node tag and the line */
	tag?: string;
	body?: string;
}

export interface NodeG {
	n: NodeS;
	box: Rect;
	cx: number;
	cy: number;
	/** the bar under the node (buffer), when there is one */
	bar?: Rect;
}
export interface LinkG {
	l: LinkS;
	p1: Pt;
	p2: Pt;
	mid: Pt;
}
export interface PacketG {
	p: PacketS;
	at: Pt;
	label?: TItem;
}
export interface BurstG {
	b: BurstS;
	at: Pt;
	label?: TItem;
}

export interface NetScene {
	W: number;
	H: number;
	title: Rect;
	hud: Rect | null;
	map: Rect;
	log: Rect | null;
	nodes: NodeG[];
	links: LinkG[];
	packets: PacketG[];
	bursts: BurstG[];
	halos: {rect: Rect; group: number}[];
	items: TItem[];
	problems: string[];
}

const rectsHit = (a: Rect, b: Rect, tol = 1) => a.x + a.w > b.x + tol && b.x + b.w > a.x + tol && a.y + a.h > b.y + tol && b.y + b.h > a.y + tol;
const inflate = (r: Rect, n: number): Rect => ({x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n});

export const nodeWidth = (label: string): number => Math.max(88, Math.ceil(measure(label, 'hand', LABEL_PX)) + 64);

/** The point where a ray from the box centre towards `to` leaves the box (plus a small gap). */
const edgePoint = (box: Rect, to: Pt, gap = 5): Pt => {
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	const dx = to.x - cx;
	const dy = to.y - cy;
	if (dx === 0 && dy === 0) return {x: cx, y: cy};
	const tx = dx === 0 ? Infinity : (box.w / 2 + gap) / Math.abs(dx);
	const ty = dy === 0 ? Infinity : (box.h / 2 + gap) / Math.abs(dy);
	const t = Math.min(tx, ty);
	return {x: cx + dx * t, y: cy + dy * t};
};

/** Does the segment p-q cross the rect (Liang-Barsky)? */
const segmentHits = (p: Pt, q: Pt, r: Rect): boolean => {
	let t0 = 0;
	let t1 = 1;
	const dx = q.x - p.x;
	const dy = q.y - p.y;
	const clip = (pp: number, qq: number) => {
		if (pp === 0) return qq >= 0;
		const t = qq / pp;
		if (pp < 0) {
			if (t > t1) return false;
			if (t > t0) t0 = t;
		} else {
			if (t < t0) return false;
			if (t < t1) t1 = t;
		}
		return true;
	};
	return clip(-dx, p.x - r.x) && clip(dx, r.x + r.w - p.x) && clip(-dy, p.y - r.y) && clip(dy, r.y + r.h - p.y) && t1 - t0 > 0.001;
};

const chipW = (text: string, size = CODE_PX) => Math.ceil(measure(text, 'mono', size)) + 16;

export const netScene = (s: NetState, rect: Rect): NetScene => {
	const W = rect.w;
	const H = rect.h;
	const problems: string[] = [];
	const items: TItem[] = [];
	const title: Rect = {x: 0, y: 0, w: W, h: TITLE_H};
	const hud: Rect | null = s.hasHud ? {x: 0, y: TITLE_H, w: W, h: HUD_H} : null;
	const log: Rect | null = s.hasLogs ? {x: 10, y: H - LOG_H - 10, w: W - 20, h: LOG_H} : null;
	const mapTop = TITLE_H + (hud ? HUD_H : 0);
	const mapBottom = log ? log.y - 6 : H - 6;
	const map: Rect = {x: 0, y: mapTop, w: W, h: mapBottom - mapTop};

	// title bar
	items.push({id: 'title', kind: 'title', text: s.title, box: {x: 12, y: 6, w: Math.ceil(measure(s.title, 'mono', CODE_PX)) + 4, h: TITLE_H - 12}, size: CODE_PX, font: 'mono', label: false, transient: false});
	const stText = [s.status.left, s.status.right].filter(Boolean).join(', ');
	const stW = Math.ceil(measure(stText, 'mono', CODE_PX)) + 4;
	items.push({id: 'status', kind: 'status', text: stText, box: {x: W - 12 - stW, y: 6, w: stW, h: TITLE_H - 12}, size: CODE_PX, font: 'mono', label: false, tone: s.status.bad ? 'err' : 'info', transient: false});

	// node sizes and the room under them (frame independent: the rows are reserved from the plan)
	const widths = new Map(s.nodes.map((n) => [n.id, nodeWidth(n.label)]));
	const underRows = (id: string) => {
		const u = s.under[id];
		if (!u) return 0;
		return (u.badge ? ROW.badge : 0) + (u.timer ? ROW.timer : 0) + (u.buf ? ROW.buf : 0) + u.stats * ROW.stat;
	};
	const U = Math.max(0, ...s.nodes.map((n) => underRows(n.id)));
	const maxW = Math.max(88, ...[...widths.values()]);
	const padX = maxW / 2 + 12;
	const padTop = CROWN_H + 12 + NODE_H / 2;
	const padBottom = NODE_H / 2 + U + 8;
	const spanX = Math.max(0, map.w - 2 * padX);
	const spanY = Math.max(0, map.h - padTop - padBottom);
	if (spanY < 40 && s.nodes.length) problems.push(`the map has only ${Math.round(map.h)} px of height for its nodes (slot ${Math.round(W)}x${Math.round(H)})`);

	const nodes: NodeG[] = s.nodes.map((n) => {
		const w = widths.get(n.id)!;
		const cx = map.x + padX + n.x * spanX;
		const cy = map.y + padTop + n.y * spanY;
		const box: Rect = {x: cx - w / 2, y: cy - NODE_H / 2, w, h: NODE_H};
		return {n, box, cx, cy};
	});
	const byId = new Map(nodes.map((g) => [g.n.id, g]));

	for (const g of nodes) {
		items.push({id: `node.${g.n.id}`, kind: 'node', text: g.n.label, box: g.box, size: LABEL_PX, font: 'hand', label: true, transient: false});
		// rows under the node, in a fixed order
		const u = s.under[g.n.id];
		if (!u) continue;
		let y = g.box.y + g.box.h + 4;
		const chip = (kind: ItemKind, id: string, text: string, tone?: string) => {
			const w = chipW(text);
			items.push({id, kind, text, box: {x: g.cx - w / 2, y, w, h: CHIP_H}, size: CODE_PX, font: 'mono', label: false, tone, transient: false});
		};
		if (u.badge) {
			if (g.n.badge) chip('badge', `badge.${g.n.id}`, g.n.badge, g.n.tone);
			y += ROW.badge;
		}
		if (u.timer) {
			if (g.n.timer?.label) chip('timer', `timer.${g.n.id}`, g.n.timer.label, g.n.timer.expired ? 'err' : 'info');
			y += ROW.timer;
		}
		if (u.buf) {
			if (g.n.buffer) {
				g.bar = {x: g.box.x, y: y + 2, w: g.box.w, h: 10};
				const text = `buf ${Math.round(g.n.buffer.level)}/${g.n.buffer.cap}`;
				const w = chipW(text);
				items.push({id: `buf.${g.n.id}`, kind: 'buf', text, box: {x: g.cx - w / 2, y: y + 16, w, h: CHIP_H}, size: CODE_PX, font: 'mono', label: false, tone: g.n.buffer.full ? 'err' : 'info', transient: false});
			}
			y += ROW.buf;
		}
		const mine = s.stats.filter((st) => st.node === g.n.id);
		for (let i = 0; i < u.stats; i++) {
			if (mine[i]) chip('stat', `stat.${mine[i].id}`, mine[i].text, mine[i].tone ?? undefined);
			y += ROW.stat;
		}
	}

	// HUD counters
	if (hud) {
		let x = 12;
		for (const st of s.stats.filter((x) => !x.node)) {
			const w = chipW(st.text);
			items.push({id: `stat.${st.id}`, kind: 'hud', text: st.text, box: {x, y: hud.y + 6, w, h: CHIP_H}, size: CODE_PX, font: 'mono', label: false, tone: st.tone ?? undefined, transient: false});
			x += w + 8;
		}
	}

	// links
	const links: LinkG[] = [];
	for (const l of s.links) {
		const ga = byId.get(l.a);
		const gb = byId.get(l.b);
		if (!ga || !gb) continue;
		const p1 = edgePoint(ga.box, {x: gb.cx, y: gb.cy});
		const p2 = edgePoint(gb.box, {x: ga.cx, y: ga.cy});
		const mid = {x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2};
		links.push({l, p1, p2, mid});
		if (l.label) {
			const w = chipW(l.label);
			items.push({id: `link.${l.key}`, kind: 'link', text: l.label, box: {x: mid.x - w / 2, y: mid.y - CHIP_H / 2, w, h: CHIP_H}, size: CODE_PX, font: 'mono', label: false, tone: l.cut ? 'err' : undefined, transient: false});
		}
		for (const o of nodes) {
			if (o.n.id !== l.a && o.n.id !== l.b && segmentHits(p1, p2, inflate(o.box, 2))) problems.push(`link ${ga.n.label}-${gb.n.label} runs through node ${o.n.label}; move a node`);
		}
	}
	const linkOf = (a: string, b: string) => links.find((x) => (x.l.a === a && x.l.b === b) || (x.l.a === b && x.l.b === a));
	const along = (a: string, b: string, t: number): Pt | null => {
		const lg = linkOf(a, b);
		if (!lg) return null;
		const [from, to] = lg.l.a === a ? [lg.p1, lg.p2] : [lg.p2, lg.p1];
		return {x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t};
	};

	// packets: their labels sit above the packet, or below it when a node is in the way
	const place = (id: string, kind: ItemKind, text: string, at: Pt, tone: string | undefined, lift: number): TItem => {
		const w = chipW(text);
		const x = Math.min(W - 6 - w, Math.max(6, at.x - w / 2));
		const mk = (y: number): TItem => ({id, kind, text, box: {x, y: Math.max(TITLE_H + 2, Math.min(H - CHIP_H - 2, y)), w, h: CHIP_H}, size: CODE_PX, font: 'mono', label: false, tone, transient: true});
		const up = mk(at.y - lift - CHIP_H);
		if (!nodes.some((g) => rectsHit(up.box, inflate(g.box, 2)))) return up;
		const down = mk(at.y + lift);
		return !nodes.some((g) => rectsHit(down.box, inflate(g.box, 2))) ? down : up;
	};
	const packets: PacketG[] = [];
	for (const p of s.packets) {
		const at = along(p.a, p.b, p.t);
		if (!at) continue;
		const g: PacketG = {p, at};
		if (p.label && p.status !== 'arrived') {
			g.label = place(`pkt.${p.id}`, 'packet', p.label, at, p.tone, 16);
			items.push(g.label);
		}
		packets.push(g);
	}
	const bursts: BurstG[] = [];
	for (const b of s.bursts) {
		let at: Pt | null = null;
		if (b.node) {
			const g = byId.get(b.node);
			if (g) at = {x: g.box.x + g.box.w - 6, y: g.box.y - 4};
		} else if (b.a && b.b) at = along(b.a, b.b, b.t ?? 0.5);
		if (!at) continue;
		const bg: BurstG = {b, at};
		if (b.age < 36) {
			bg.label = place(`burst.${bursts.length}`, 'burst', 'dropped', at, 'err', 18);
			items.push(bg.label);
		}
		bursts.push(bg);
	}

	// partition halos: a dashed outline around each side
	const halos: NetScene['halos'] = [];
	if (s.partition) {
		s.partition.groups.forEach((ids, i) => {
			const gs = ids.map((id) => byId.get(id)).filter((g): g is NodeG => !!g);
			if (!gs.length) return;
			const x0 = Math.min(...gs.map((g) => g.box.x)) - 14;
			const x1 = Math.max(...gs.map((g) => g.box.x + g.box.w)) + 14;
			const y0 = Math.min(...gs.map((g) => g.box.y)) - CROWN_H - 8;
			const y1 = Math.max(...gs.map((g) => g.box.y + g.box.h + underRows(g.n.id))) + 8;
			halos.push({rect: {x: x0, y: y0, w: x1 - x0, h: y1 - y0}, group: i});
		});
	}

	// log panel
	if (log && (s.logs.length > 0 || s.logFocus)) {
		const focusLabel = s.logFocus ? (s.nodes.find((n) => n.id === s.logFocus)?.label ?? s.logFocus) : '';
		const head = s.logFocus ? `log ${focusLabel}` : 'log';
		items.push({id: 'logHead', kind: 'logHead', text: head, box: {x: log.x + 10, y: log.y + 3, w: Math.ceil(measure(head, 'mono', CODE_PX)) + 4, h: LOG_HEAD_H - 6}, size: CODE_PX, font: 'mono', label: false, transient: false});
		s.logs.forEach((l, i) => {
			const tag = s.nodes.find((n) => n.id === l.node)?.label ?? l.node;
			const text = `${tag} ${l.text}`;
			items.push({id: `log.${i}`, kind: 'log', text, box: {x: log.x + 10, y: log.y + LOG_HEAD_H + i * LOG_ROW_H, w: Math.ceil(measure(text, 'mono', CODE_PX)) + 4, h: LOG_ROW_H}, size: CODE_PX, font: 'mono', label: false, tone: l.tone, transient: false, tag, body: l.text});
		});
	}

	// problems: nothing outside the slot, no two things on top of each other, crowns clear of the title
	const area: Rect = {x: 0, y: 0, w: W, h: H};
	for (const it of items) {
		const b = it.box;
		if (b.x < area.x - 0.5 || b.y < area.y - 0.5 || b.x + b.w > area.w + 0.5 || b.y + b.h > area.h + 0.5) problems.push(`"${it.text}" does not fit inside the slot`);
		if (it.kind === 'log' && log && b.x + b.w > log.x + log.w - 4) problems.push(`log line "${it.text}" is wider than the log panel`);
	}
	const fixed = items.filter((it) => !it.transient);
	for (let i = 0; i < fixed.length; i++) {
		for (let j = i + 1; j < fixed.length; j++) {
			if (rectsHit(fixed[i].box, fixed[j].box)) problems.push(`"${fixed[i].text}" overlaps "${fixed[j].text}"`);
		}
	}
	if (hud) {
		const end = Math.max(0, ...items.filter((it) => it.kind === 'hud').map((it) => it.box.x + it.box.w));
		if (end > W - 8) problems.push('the counter chips are wider than the slot');
	}
	for (const g of nodes) {
		if (g.n.crown || g.n.crownLostAge !== null) {
			const top = g.box.y - CROWN_H - 4;
			if (top < mapTop - 2) problems.push(`the crown of ${g.n.label} sits above the map (lower its y)`);
		}
		if (g.box.x < 0 || g.box.x + g.box.w > W) problems.push(`node ${g.n.label} sticks out of the slot`);
		if (g.box.y + g.box.h + underRows(g.n.id) > map.y + map.h + 2) problems.push(`the rows under ${g.n.label} reach below the map`);
	}
	return {W, H, title, hud, map, log, nodes, links, packets, bursts, halos, items, problems: [...new Set(problems)]};
};

/** What a viewer can read: every text of the scene (the gate looks for each in the rendered DOM). */
export const netTexts = (s: NetState, rect: Rect): string[] => (s.visible ? netScene(s, rect).items.map((it) => it.text) : []);

/** Geometry and legibility problems of the state inside `rect` (empty = fine). */
export const netProblems = (s: NetState, rect: Rect): string[] => {
	if (!s.visible) return [];
	const out: string[] = [];
	if (rect.w < 420 || rect.h < 360) out.push(`the network map needs at least 420x360 px (slot ${Math.round(rect.w)}x${Math.round(rect.h)})`);
	return [...out, ...netScene(s, rect).problems];
};
