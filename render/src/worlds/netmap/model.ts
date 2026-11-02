/**
 * netmap: a network topology with packets, as a pure model.
 *
 *   world.set     {world: "netmap", title?, nodes?: [node], links?: [link]}     the map (a "console" view of a cluster)
 *   nm.node      {id, label?, kind?, x, y, cap?}     a node: kind client | router | server | replica | db | node,
 *                                                     x / y in 0..1 over the map, cap = router buffer capacity (packets)
 *   nm.link      {a, b, label?}                      an undirected link between two nodes
 *   nm.send      {from, to, kind, via?, count?, gap_ms?, hop_ms?, tone?, resets?}
 *                 a packet of `kind` ("SYN", "AppendEntries", "RequestVote" ...) moves hop by hop along the shortest
 *                 path (or through `via`). A cut link drops it (it stops, a red X bursts); a down node drops it on
 *                 arrival. count > 1 sends a train. resets: true re-arms the election timer of the receiver.
 *   nm.drop      {node, kind?}                       a packet is discarded at the node (tail drop)
 *   nm.cut       {a, b}                              the link goes dashed and red; packets in flight on it are lost
 *   nm.heal      {a?, b?}                            the link works again (no a / b: every link and partition heals)
 *   nm.partition {groups: [[ids], [ids]]}            cuts every link between the groups and draws the groups apart
 *   nm.role      {node, role?, term?}                a state badge ("follower T1"); role "leader" wears a crown
 *   nm.badge     {node, text, tone?}                 a free state badge ("ESTABLISHED"), tone ok | warn | err | info
 *   nm.down      {node}   nm.up {node}              a node crashes / returns
 *   nm.timer     {node, ms?, off?, label?}           a ring around the node drains over `ms` (screen time)
 *   nm.buffer    {node, level, cap?, ms?, overflow?} the router buffer fills to `level`; overflow sprays dropped packets
 *   nm.stat      {id, label, value, of?, unit?, node?, tone?, ms?, from?}   a live counter chip (HUD, or under a node)
 *   nm.log       {node, text | lines, tone?}         a line in the log panel at the bottom
 *   nm.focus     {node} | {off: true}                the log panel shows one node's lines only
 *
 * Signature moments: a link cut or partition, a packet dropped, a node crash, a leader taking the crown, a buffer
 * overflowing. Every frame is a pure function of the events and the frame.
 */
import type {Action} from '../../schema';
import type {WorldEvent, WorldText} from '../types';
import {msToFrames, needString, nv, optNumber, Props, sv} from '../kit';

export const NET_ID = 'netmap';
export const NET_ACTIONS = [
	'nm.node',
	'nm.link',
	'nm.send',
	'nm.drop',
	'nm.cut',
	'nm.heal',
	'nm.partition',
	'nm.role',
	'nm.badge',
	'nm.down',
	'nm.up',
	'nm.timer',
	'nm.buffer',
	'nm.stat',
	'nm.log',
	'nm.focus',
] as const;

export const NODE_KINDS = ['client', 'router', 'server', 'replica', 'db', 'node'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const TONES = ['ok', 'warn', 'err', 'info'] as const;
export type Tone = (typeof TONES)[number];
export const PACKET_TONES = ['req', 'ack', 'vote', 'beat', 'err'] as const;
export type PacketTone = (typeof PACKET_TONES)[number];

export const MAX_NODES = 8;
export const MAX_LINKS = 14;
export const MAX_NAME = 10;
export const MAX_KIND = 22;
export const MAX_BADGE = 16;
export const MAX_LOG = 46;
export const LOG_ROWS = 5;
export const DEFAULT_HOP_MS = 600;
export const DEFAULT_GAP_MS = 150;
export const DEFAULT_TWEEN_MS = 500;
export const DEFAULT_CAP = 64;
/** frames a packet waits at an intermediate node */
export const HOLD_F = 3;
/** where on a cut link a packet that set out into it stops (0..1) */
export const DROP_T = 0.5;
/** frames the red burst of a drop stays on screen */
export const BURST_F = 50;
/** frames the packet remnant stays after a drop / arrival */
export const GHOST_F = 8;
export const ARRIVE_F = 5;
export const PULSE_F = 16;
export const APPEAR_F = 10;
export const CROWN_F = 14;
export const CROWN_LOST_F = 16;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

export const linkKey = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`);

export const packetToneOf = (kind: string, explicit?: unknown): PacketTone => {
	if (typeof explicit === 'string' && (PACKET_TONES as readonly string[]).includes(explicit)) return explicit as PacketTone;
	const k = kind.toLowerCase();
	if (/rst|nack|reject|error|fail|refus|nak/.test(k)) return 'err';
	if (/granted|ack|reply|response|accept|^ok/.test(k)) return 'ack';
	if (/vote|elect/.test(k)) return 'vote';
	if (/heartbeat|append|ping|hello|keepalive/.test(k)) return 'beat';
	return 'req';
};

const roleTone = (role: string | null): Tone => (role === 'leader' ? 'ok' : role === 'candidate' ? 'warn' : 'info');

// ------------------------------------------------------------------ plan (whole session, frame independent)
export interface PNode {
	id: string;
	label: string;
	kind: NodeKind;
	x: number;
	y: number;
	cap: number;
	since: number;
}
export interface PLink {
	key: string;
	a: string;
	b: string;
	label: string;
	since: number;
}
interface Snap {
	frame: number;
	role: string | null;
	term: number | null;
	badge: string | null;
	tone: Tone;
	down: boolean;
	crown: boolean;
	crownSince: number | null;
	crownLostAt: number | null;
}
interface Leg {
	a: string;
	b: string;
	s: number;
	e: number;
	/** how far along the link (0..1) the leg gets: < 1 when the packet is lost on the link */
	t1: number;
}
interface PPacket {
	id: string;
	kind: string;
	label: string;
	tone: PacketTone;
	legs: Leg[];
	outcome: 'arrive' | 'drop';
	start: number;
	end: number;
}
interface PBurst {
	frame: number;
	/** on a link ... */
	a?: string;
	b?: string;
	t?: number;
	/** ... or at a node */
	node?: string;
}
interface TimerEv {
	frame: number;
	node: string;
	/** frames the ring takes to drain */
	ms: number;
	label: string;
	off: boolean;
	reset: boolean;
}
interface BufEv {
	frame: number;
	level: number;
	cap: number;
	ms: number;
	overflow: boolean;
}
interface StatEv {
	frame: number;
	id: string;
	label: string;
	value: number | string;
	from?: number;
	of?: number | string;
	unit: string;
	node?: string;
	tone: Tone | null;
	ms: number;
}
interface LogEv {
	frame: number;
	node: string;
	text: string;
	tone: 'out' | 'ok' | 'warn' | 'err' | 'dim';
}

/** What hangs under a node anywhere in the reel; the layout reserves those rows from the first frame so nothing jumps. */
export interface Under {
	badge: boolean;
	timer: boolean;
	buf: boolean;
	stats: number;
}

export interface NetPlan {
	nodes: PNode[];
	links: PLink[];
	titles: {frame: number; title: string}[];
	snaps: Map<string, Snap[]>;
	cuts: Map<string, {frame: number; cut: boolean}[]>;
	downs: Map<string, {frame: number; down: boolean}[]>;
	partitions: {frame: number; groups: string[][]; clear: boolean}[];
	packets: PPacket[];
	bursts: PBurst[];
	pulses: {frame: number; node: string; small: boolean}[];
	timers: Map<string, TimerEv[]>;
	buffers: Map<string, BufEv[]>;
	stats: Map<string, StatEv[]>;
	logs: LogEv[];
	focus: {frame: number; node: string | null}[];
	hasLogs: boolean;
	hasHud: boolean;
	under: Record<string, Under>;
	issues: string[];
}

const plans = new WeakMap<WorldEvent[], NetPlan>();

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const nodeKind = (v: unknown): NodeKind => ((NODE_KINDS as readonly string[]).includes(sv(v)) ? (sv(v) as NodeKind) : 'node');

export const hopFrames = (p: Props) => Math.max(4, msToFrames(nv(p.hop_ms, DEFAULT_HOP_MS)));
export const gapFrames = (p: Props) => Math.max(1, msToFrames(nv(p.gap_ms, DEFAULT_GAP_MS)));

/** Shortest path (by hops) between two nodes over the given links, or null. Ties follow the declaration order. */
export const route = (links: {a: string; b: string}[], from: string, to: string): string[] | null => {
	if (from === to) return [from];
	const prev = new Map<string, string>([[from, '']]);
	const queue = [from];
	for (let qi = 0; qi < queue.length; qi++) {
		const cur = queue[qi];
		for (const l of links) {
			const next = l.a === cur ? l.b : l.b === cur ? l.a : null;
			if (next === null || prev.has(next)) continue;
			prev.set(next, cur);
			if (next === to) {
				const out = [to];
				for (let n = cur; n; n = prev.get(n) as string) out.unshift(n);
				return out;
			}
			queue.push(next);
		}
	}
	return null;
};

const logTone = (v: unknown): LogEv['tone'] => (['out', 'ok', 'warn', 'err', 'dim'].includes(sv(v)) ? (sv(v) as LogEv['tone']) : 'out');
const tone4 = (v: unknown): Tone | null => ((TONES as readonly string[]).includes(sv(v)) ? (sv(v) as Tone) : null);

export const planNet = (events: WorldEvent[]): NetPlan => {
	const hit = plans.get(events);
	if (hit) return hit;
	const nodes: PNode[] = [];
	const links: PLink[] = [];
	const titles: NetPlan['titles'] = [];
	const snaps = new Map<string, Snap[]>();
	const cuts = new Map<string, {frame: number; cut: boolean}[]>();
	const downs = new Map<string, {frame: number; down: boolean}[]>();
	const partitions: NetPlan['partitions'] = [];
	const bursts: PBurst[] = [];
	const timerEvs: TimerEv[] = [];
	const buffers = new Map<string, BufEv[]>();
	const stats = new Map<string, StatEv[]>();
	const logs: LogEv[] = [];
	const focus: NetPlan['focus'] = [];
	const issues: string[] = [];
	const sends: WorldEvent[] = [];

	const node = (id: string) => nodes.find((n) => n.id === id);
	const need = (id: string, beat: number, what: string): PNode | undefined => {
		const n = node(id);
		if (!n) issues.push(`beat ${beat}: ${what} names unknown node "${id}"`);
		return n;
	};
	const addNode = (p: Props, frame: number, beat: number) => {
		const id = sv(p.id);
		if (!id) return;
		if (node(id)) return void issues.push(`beat ${beat}: node "${id}" is declared twice`);
		const n: PNode = {id, label: sv(p.label, id), kind: nodeKind(p.kind), x: nv(p.x, 0.5), y: nv(p.y, 0.5), cap: Math.max(1, Math.round(nv(p.cap, DEFAULT_CAP))), since: frame};
		nodes.push(n);
		snaps.set(id, [{frame, role: null, term: null, badge: null, tone: 'info', down: false, crown: false, crownSince: null, crownLostAt: null}]);
	};
	const addLink = (p: Props, frame: number, beat: number) => {
		const a = need(sv(p.a), beat, 'nm.link');
		const b = need(sv(p.b), beat, 'nm.link');
		if (!a || !b) return;
		const key = linkKey(a.id, b.id);
		if (links.some((l) => l.key === key)) return void issues.push(`beat ${beat}: link ${a.id}-${b.id} is declared twice`);
		links.push({key, a: a.id, b: b.id, label: sv(p.label), since: Math.max(frame, a.since, b.since)});
	};
	const setCut = (key: string, frame: number, cut: boolean) => {
		const arr = cuts.get(key) ?? [];
		arr.push({frame, cut});
		cuts.set(key, arr);
	};
	const isCutNow = (key: string) => {
		const arr = cuts.get(key);
		return !!arr && arr[arr.length - 1].cut;
	};
	const snapOf = (id: string, frame: number, patch: Partial<Snap>) => {
		const arr = snaps.get(id);
		if (!arr) return;
		const prev = arr[arr.length - 1];
		const next: Snap = {...prev, ...patch, frame};
		next.crown = next.role === 'leader' && !next.down;
		if (next.crown && !prev.crown) next.crownSince = frame;
		if (!next.crown && prev.crown) next.crownLostAt = frame;
		if (prev.frame === frame) arr[arr.length - 1] = next;
		else arr.push(next);
	};

	for (const e of events) {
		const p = e.action as Props;
		switch (e.action.do) {
			case 'world.set': {
				if (typeof p.title === 'string') titles.push({frame: e.frame, title: p.title});
				else if (!titles.length) titles.push({frame: e.frame, title: 'network'});
				if (Array.isArray(p.nodes)) for (const n of p.nodes) addNode(n as Props, e.frame, e.beat);
				if (Array.isArray(p.links)) for (const l of p.links) addLink(l as Props, e.frame, e.beat);
				break;
			}
			case 'nm.node':
				addNode(p, e.frame, e.beat);
				break;
			case 'nm.link':
				addLink(p, e.frame, e.beat);
				break;
			case 'nm.send':
				sends.push(e);
				break;
			case 'nm.cut': {
				const a = need(sv(p.a), e.beat, 'nm.cut');
				const b = need(sv(p.b), e.beat, 'nm.cut');
				if (!a || !b) break;
				const key = linkKey(a.id, b.id);
				if (!links.some((l) => l.key === key)) issues.push(`beat ${e.beat}: nm.cut ${a.id}-${b.id}: there is no such link`);
				else setCut(key, e.frame, true);
				break;
			}
			case 'nm.heal': {
				if (typeof p.a === 'string' && typeof p.b === 'string') {
					const key = linkKey(p.a, p.b);
					if (!links.some((l) => l.key === key)) issues.push(`beat ${e.beat}: nm.heal ${p.a}-${p.b}: there is no such link`);
					else setCut(key, e.frame, false);
				} else {
					for (const l of links) if (isCutNow(l.key)) setCut(l.key, e.frame, false);
					partitions.push({frame: e.frame, groups: [], clear: true});
				}
				break;
			}
			case 'nm.partition': {
				const groups = (Array.isArray(p.groups) ? p.groups : []).map(strList);
				const seen = new Set<string>();
				for (const g of groups) for (const id of g) {
					if (!node(id)) issues.push(`beat ${e.beat}: nm.partition names unknown node "${id}"`);
					if (seen.has(id)) issues.push(`beat ${e.beat}: nm.partition lists node "${id}" in two groups`);
					seen.add(id);
				}
				const side = new Map<string, number>();
				groups.forEach((g, i) => g.forEach((id) => side.set(id, i)));
				for (const l of links) if (side.has(l.a) && side.has(l.b) && side.get(l.a) !== side.get(l.b)) setCut(l.key, e.frame, true);
				partitions.push({frame: e.frame, groups, clear: false});
				break;
			}
			case 'nm.role': {
				const n = need(sv(p.node), e.beat, 'nm.role');
				if (!n) break;
				const last = snaps.get(n.id)![snaps.get(n.id)!.length - 1];
				const role = typeof p.role === 'string' ? p.role : last.role;
				const term = typeof p.term === 'number' ? p.term : last.term;
				snapOf(n.id, e.frame, {role, term, badge: role ? `${role}${term !== null ? ` T${term}` : ''}` : term !== null ? `T${term}` : null, tone: roleTone(role)});
				break;
			}
			case 'nm.badge': {
				const n = need(sv(p.node), e.beat, 'nm.badge');
				if (n) snapOf(n.id, e.frame, {badge: sv(p.text), tone: tone4(p.tone) ?? 'info'});
				break;
			}
			case 'nm.down':
			case 'nm.up': {
				const n = need(sv(p.node), e.beat, String(e.action.do));
				if (!n) break;
				const down = e.action.do === 'nm.down';
				const arr = downs.get(n.id) ?? [];
				arr.push({frame: e.frame, down});
				downs.set(n.id, arr);
				snapOf(n.id, e.frame, {down});
				break;
			}
			case 'nm.timer': {
				const n = need(sv(p.node), e.beat, 'nm.timer');
				if (n) timerEvs.push({frame: e.frame, node: n.id, ms: msToFrames(nv(p.ms, 0)), label: sv(p.label), off: p.off === true, reset: false});
				break;
			}
			case 'nm.buffer': {
				const n = need(sv(p.node), e.beat, 'nm.buffer');
				if (!n) break;
				const cap = Math.max(1, Math.round(nv(p.cap, buffers.get(n.id)?.slice(-1)[0]?.cap ?? n.cap)));
				const level = Math.max(0, nv(p.level, 0));
				const overflow = p.overflow === true || level >= cap;
				const arr = buffers.get(n.id) ?? [];
				arr.push({frame: e.frame, level: Math.min(level, cap), cap, ms: Math.max(1, msToFrames(nv(p.ms, DEFAULT_TWEEN_MS))), overflow});
				buffers.set(n.id, arr);
				if (overflow) bursts.push({frame: e.frame + Math.round(msToFrames(nv(p.ms, DEFAULT_TWEEN_MS)) * 0.7), node: n.id});
				break;
			}
			case 'nm.drop': {
				const n = need(sv(p.node), e.beat, 'nm.drop');
				if (n) bursts.push({frame: e.frame, node: n.id});
				break;
			}
			case 'nm.stat': {
				const id = sv(p.id);
				if (typeof p.node === 'string') need(p.node, e.beat, 'nm.stat');
				const arr = stats.get(id) ?? [];
				const prev = arr[arr.length - 1];
				arr.push({
					frame: e.frame,
					id,
					label: sv(p.label, prev?.label ?? id),
					value: typeof p.value === 'number' || typeof p.value === 'string' ? p.value : 0,
					from: typeof p.from === 'number' ? p.from : undefined,
					of: typeof p.of === 'number' || typeof p.of === 'string' ? p.of : prev?.of,
					unit: sv(p.unit, prev?.unit ?? ''),
					node: typeof p.node === 'string' ? p.node : prev?.node,
					tone: tone4(p.tone),
					ms: Math.max(1, msToFrames(nv(p.ms, DEFAULT_TWEEN_MS))),
				});
				stats.set(id, arr);
				break;
			}
			case 'nm.log': {
				const n = need(sv(p.node), e.beat, 'nm.log');
				if (!n) break;
				const lines = Array.isArray(p.lines) ? strList(p.lines) : [sv(p.text)];
				lines.forEach((text, i) => logs.push({frame: e.frame + i * 4, node: n.id, text, tone: logTone(p.tone)}));
				break;
			}
			case 'nm.focus':
				focus.push({frame: e.frame, node: p.off === true ? null : sv(p.node) || null});
				break;
		}
	}

	// ---- pass 2: packets (they need the whole history of cuts and crashes)
	const isCutAt = (key: string, f: number) => {
		let c = false;
		for (const r of cuts.get(key) ?? []) if (r.frame <= f) c = r.cut;
		return c;
	};
	const firstCutIn = (key: string, from: number, to: number): number | null => {
		let state = isCutAt(key, from);
		for (const r of cuts.get(key) ?? []) {
			if (r.frame <= from) continue;
			if (r.frame > to) break;
			if (r.cut && !state) return r.frame;
			state = r.cut;
		}
		return null;
	};
	const isDownAt = (id: string, f: number) => {
		let d = false;
		for (const r of downs.get(id) ?? []) if (r.frame <= f) d = r.down;
		return d;
	};
	const packets: PPacket[] = [];
	const pulses: NetPlan['pulses'] = [];
	const arrivals: TimerEv[] = [];
	for (const e of sends) {
		const p = e.action as Props;
		const from = sv(p.from);
		const to = sv(p.to);
		const kind = sv(p.kind);
		if (!need(from, e.beat, 'nm.send') || !need(to, e.beat, 'nm.send')) continue;
		const known = links.filter((l) => l.since <= e.frame);
		const via = strList(p.via);
		const path = via.length ? [from, ...via, to] : route(known, from, to);
		if (!path) {
			issues.push(`beat ${e.beat}: nm.send ${kind}: no link path from "${from}" to "${to}"`);
			continue;
		}
		let bad = false;
		for (let h = 0; h + 1 < path.length; h++) {
			if (!known.some((l) => l.key === linkKey(path[h], path[h + 1]))) {
				issues.push(`beat ${e.beat}: nm.send ${kind}: there is no link ${path[h]}-${path[h + 1]}`);
				bad = true;
			}
		}
		if (bad) continue;
		if (isDownAt(from, e.frame)) issues.push(`beat ${e.beat}: nm.send ${kind}: "${from}" is down and cannot send`);
		const count = Math.max(1, Math.round(nv(p.count, 1)));
		const hop = hopFrames(p);
		const gap = gapFrames(p);
		const tone = packetToneOf(kind, p.tone);
		for (let i = 0; i < count; i++) {
			let cur = e.frame + i * gap;
			const legs: Leg[] = [];
			let outcome: PPacket['outcome'] = 'arrive';
			for (let h = 0; h + 1 < path.length; h++) {
				const a = path[h];
				const b = path[h + 1];
				const key = linkKey(a, b);
				const s = cur;
				const end = s + hop;
				if (isCutAt(key, s)) {
					const stop = s + Math.round(hop * DROP_T);
					legs.push({a, b, s, e: stop, t1: DROP_T});
					bursts.push({frame: stop, a, b, t: DROP_T});
					outcome = 'drop';
					break;
				}
				const c = firstCutIn(key, s, end);
				if (c !== null) {
					const t1 = clamp01((c - s) / hop);
					legs.push({a, b, s, e: c, t1});
					bursts.push({frame: c, a, b, t: t1});
					outcome = 'drop';
					break;
				}
				legs.push({a, b, s, e: end, t1: 1});
				if (isDownAt(b, end)) {
					bursts.push({frame: end, node: b});
					outcome = 'drop';
					break;
				}
				pulses.push({frame: end, node: b, small: h + 2 < path.length});
				cur = end + HOLD_F;
			}
			const last = legs[legs.length - 1];
			packets.push({id: `${e.frame}.${packets.length}`, kind, label: i === 0 ? kind : '', tone, legs, outcome, start: legs[0].s, end: last.e});
			if (outcome === 'arrive' && p.resets === true) arrivals.push({frame: last.e, node: to, ms: 0, label: '', off: false, reset: true});
		}
	}

	// ---- timers: explicit settings plus re-arms by arriving packets, in time order (an explicit setting wins a tie)
	const timers = new Map<string, TimerEv[]>();
	const merged = [...arrivals.map((a, i) => ({a, i, w: 0})), ...timerEvs.map((a, i) => ({a, i: i + 1e6, w: 1}))].sort((x, y) => x.a.frame - y.a.frame || x.w - y.w || x.i - y.i);
	for (const {a} of merged) {
		const arr = timers.get(a.node) ?? [];
		const prev = arr[arr.length - 1];
		if (a.reset) {
			if (prev && !prev.off) arr.push({...prev, frame: a.frame, reset: true});
		} else arr.push(a);
		timers.set(a.node, arr);
	}

	const under: Record<string, Under> = {};
	for (const n of nodes) {
		under[n.id] = {
			badge: (snaps.get(n.id)?.length ?? 0) > 1,
			timer: (timers.get(n.id) ?? []).some((t) => !!t.label),
			buf: buffers.has(n.id),
			stats: [...stats.values()].filter((arr) => arr[arr.length - 1].node === n.id).length,
		};
	}

	const plan: NetPlan = {
		nodes,
		links,
		titles,
		snaps,
		cuts,
		downs,
		partitions,
		packets,
		bursts: bursts.sort((x, y) => x.frame - y.frame),
		pulses: pulses.sort((x, y) => x.frame - y.frame),
		timers,
		buffers,
		stats,
		logs: logs.sort((x, y) => x.frame - y.frame),
		focus,
		hasLogs: logs.length > 0,
		hasHud: [...stats.values()].some((arr) => arr.some((s) => !s.node)),
		under,
		issues,
	};
	plans.set(events, plan);
	return plan;
};

// ------------------------------------------------------------------ state at a frame
export interface TimerS {
	frac: number;
	ms: number;
	label: string;
	expired: boolean;
	expiredAge: number;
	/** frames since the ring was (re)armed */
	armedAge: number;
}
export interface BufferS {
	level: number;
	cap: number;
	full: boolean;
	/** frames since the latest overflow event (null when the buffer is not full) */
	overflowAge: number | null;
}
export interface StatS {
	id: string;
	label: string;
	text: string;
	node: string | null;
	tone: Tone | null;
	/** frames since the value last changed */
	age: number;
}
export interface NodeS {
	id: string;
	label: string;
	kind: NodeKind;
	x: number;
	y: number;
	appear: number;
	role: string | null;
	term: number | null;
	badge: string | null;
	tone: Tone;
	down: boolean;
	crown: boolean;
	crownAge: number;
	crownLostAge: number | null;
	timer: TimerS | null;
	buffer: BufferS | null;
	pulseAge: number | null;
	pulseSmall: boolean;
}
export interface LinkS {
	key: string;
	a: string;
	b: string;
	label: string;
	appear: number;
	cut: boolean;
	/** frames since the link last changed between cut and working */
	age: number;
}
export interface PacketS {
	id: string;
	kind: string;
	label: string;
	tone: PacketTone;
	/** the hop it is on */
	a: string;
	b: string;
	t: number;
	status: 'fly' | 'dropped' | 'arrived';
	age: number;
}
export interface BurstS {
	a?: string;
	b?: string;
	t?: number;
	node?: string;
	age: number;
}
export interface LogS {
	node: string;
	text: string;
	tone: LogEv['tone'];
	age: number;
}
export interface NetState {
	visible: boolean;
	frame: number;
	title: string;
	nodes: NodeS[];
	links: LinkS[];
	packets: PacketS[];
	bursts: BurstS[];
	partition: {groups: string[][]; age: number} | null;
	stats: StatS[];
	logs: LogS[];
	logFocus: string | null;
	/** the whole reel has log lines / counter chips: the layout reserves their band from the first frame */
	hasLogs: boolean;
	hasHud: boolean;
	under: Record<string, Under>;
	status: {left: string; right: string; bad: boolean};
}

const last = <T,>(arr: T[] | undefined, pred: (x: T) => boolean): T | undefined => {
	let out: T | undefined;
	for (const x of arr ?? []) if (pred(x)) out = x;
	return out;
};

export const bufferAt = (plan: NetPlan, id: string, frame: number): BufferS | null => {
	const arr = plan.buffers.get(id);
	const i = arr ? arr.findIndex((b) => b.frame > frame) : -1;
	const idx = (i === -1 ? (arr?.length ?? 0) : i) - 1;
	if (!arr || idx < 0) return null;
	const cur = arr[idx];
	const from = idx > 0 ? arr[idx - 1].level : 0;
	const level = from + (cur.level - from) * easeOut((frame - cur.frame) / cur.ms);
	const full = cur.level >= cur.cap || (cur.overflow && frame >= cur.frame + cur.ms);
	return {level, cap: cur.cap, full: cur.overflow && full, overflowAge: cur.overflow && full ? frame - cur.frame : null};
};

export const statText = (label: string, value: number | string, of: number | string | undefined, unit: string): string =>
	`${label} ${typeof value === 'number' ? String(Math.round(value * 10) / 10) : value}${unit}${of !== undefined ? `/${of}` : ''}`;

export const statAt = (plan: NetPlan, id: string, frame: number): StatS | null => {
	const arr = plan.stats.get(id);
	const cur = last(arr, (s) => s.frame <= frame);
	if (!arr || !cur) return null;
	const idx = arr.indexOf(cur);
	const prev = idx > 0 ? arr[idx - 1] : undefined;
	let value = cur.value;
	if (typeof cur.value === 'number') {
		const from = cur.from ?? (typeof prev?.value === 'number' ? prev.value : cur.value);
		value = from + (cur.value - from) * easeOut((frame - cur.frame) / cur.ms);
		if (frame - cur.frame >= cur.ms) value = cur.value;
	}
	return {id, label: cur.label, text: statText(cur.label, value, cur.of, cur.unit), node: cur.node ?? null, tone: cur.tone, age: frame - cur.frame};
};

export const netStateAt = (events: WorldEvent[], frame: number): NetState => {
	const plan = planNet(events);
	const visible = events.length > 0 && frame >= events[0].frame;
	let title = 'network';
	for (const t of plan.titles) if (t.frame <= frame) title = t.title;
	const liveNodes = plan.nodes.filter((n) => n.since <= frame);

	const nodes: NodeS[] = liveNodes.map((n) => {
		const snap = last(plan.snaps.get(n.id), (s) => s.frame <= frame)!;
		const ev = plan.timers.get(n.id);
		const t = last(ev, (x) => x.frame <= frame);
		let timer: TimerS | null = null;
		if (t && !t.off && t.ms > 0 && !snap.down) {
			const age = frame - t.frame;
			const expiredAge = age - t.ms;
			if (expiredAge < 20) timer = {frac: clamp01(1 - age / t.ms), ms: t.ms, label: t.label, expired: age >= t.ms, expiredAge: Math.max(0, expiredAge), armedAge: age};
		}
		const pulse = last(plan.pulses, (p) => p.node === n.id && p.frame <= frame);
		const pulseAge = pulse && frame - pulse.frame < PULSE_F ? frame - pulse.frame : null;
		return {
			id: n.id,
			label: n.label,
			kind: n.kind,
			x: n.x,
			y: n.y,
			appear: clamp01((frame - n.since) / APPEAR_F),
			role: snap.role,
			term: snap.term,
			badge: snap.down ? 'down' : snap.badge,
			tone: snap.down ? 'err' : snap.tone,
			down: snap.down,
			crown: snap.crown,
			crownAge: snap.crownSince !== null ? frame - snap.crownSince : 9999,
			crownLostAge: snap.crownLostAt !== null && !snap.crown && frame - snap.crownLostAt < CROWN_LOST_F ? frame - snap.crownLostAt : null,
			timer,
			buffer: bufferAt(plan, n.id, frame),
			pulseAge,
			pulseSmall: pulse?.small ?? false,
		};
	});
	const live = new Set(liveNodes.map((n) => n.id));

	const links: LinkS[] = plan.links
		.filter((l) => l.since <= frame && live.has(l.a) && live.has(l.b))
		.map((l) => {
			const rec = last(plan.cuts.get(l.key), (r) => r.frame <= frame);
			return {key: l.key, a: l.a, b: l.b, label: l.label, appear: clamp01((frame - l.since) / APPEAR_F), cut: !!rec?.cut, age: rec ? frame - rec.frame : 9999};
		});

	const packets: PacketS[] = [];
	for (const pk of plan.packets) {
		if (frame < pk.start) continue;
		const lastLeg = pk.legs[pk.legs.length - 1];
		if (frame > lastLeg.e) {
			const age = frame - lastLeg.e;
			if (age > (pk.outcome === 'drop' ? GHOST_F : ARRIVE_F)) continue;
			packets.push({id: pk.id, kind: pk.kind, label: pk.label, tone: pk.tone, a: lastLeg.a, b: lastLeg.b, t: lastLeg.t1, status: pk.outcome === 'drop' ? 'dropped' : 'arrived', age});
			continue;
		}
		const leg = pk.legs.find((l) => frame <= l.e && frame >= l.s) ?? pk.legs.find((l) => l.s > frame)!;
		const span = Math.max(1, leg.e - leg.s);
		packets.push({id: pk.id, kind: pk.kind, label: pk.label, tone: pk.tone, a: leg.a, b: leg.b, t: clamp01((frame - leg.s) / span) * leg.t1, status: 'fly', age: frame - leg.s});
	}

	const bursts: BurstS[] = plan.bursts.filter((b) => b.frame <= frame && frame - b.frame < BURST_F).map((b) => ({a: b.a, b: b.b, t: b.t, node: b.node, age: frame - b.frame}));

	let part: NetState['partition'] = null;
	for (const p of plan.partitions) if (p.frame <= frame) part = p.clear ? null : {groups: p.groups, age: frame - p.frame};

	const stats: StatS[] = [];
	for (const id of plan.stats.keys()) {
		const s = statAt(plan, id, frame);
		if (s && (!s.node || live.has(s.node))) stats.push(s);
	}

	const focus = last(plan.focus, (f) => f.frame <= frame)?.node ?? null;
	const shown = plan.logs.filter((l) => l.frame <= frame && (!focus || l.node === focus));
	const logs: LogS[] = shown.slice(-LOG_ROWS).map((l) => ({node: l.node, text: l.text, tone: l.tone, age: frame - l.frame}));

	const cutN = links.filter((l) => l.cut).length;
	const downN = nodes.filter((n) => n.down).length;
	const right = [part ? 'partitioned' : '', downN ? `${downN} down` : ''].filter(Boolean).join(', ');
	const status = {left: `links ${links.length - cutN}/${links.length} up`, right, bad: cutN > 0 || downN > 0};

	return {visible, frame, title, nodes, links, packets, bursts, partition: part, stats, logs, logFocus: focus, hasLogs: plan.hasLogs, hasHud: plan.hasHud, under: plan.under, status};
};

// ------------------------------------------------------------------ validation, tokens, rows, settle
const what = (a: Action) => String(a.do);
const isId = (v: unknown) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,11}$/.test(v);

const checkNode = (p: Props, w: string, i?: number): string[] => {
	const at = i === undefined ? w : `${w} nodes[${i}]`;
	const errs: string[] = [];
	if (!isId(p.id)) errs.push(`${at} needs "id": a short name such as "s1" (letters, digits, - and _)`);
	if (p.label !== undefined && (typeof p.label !== 'string' || !p.label.trim() || p.label.length > MAX_NAME)) errs.push(`${at}: "label" must be 1-${MAX_NAME} characters`);
	if (p.kind !== undefined && !(NODE_KINDS as readonly unknown[]).includes(p.kind)) errs.push(`${at}: "kind" must be one of ${NODE_KINDS.join(', ')}`);
	for (const k of ['x', 'y'] as const) {
		if (typeof p[k] !== 'number' || p[k] < 0 || p[k] > 1) errs.push(`${at} needs "${k}": a number in 0..1 (position on the map)`);
	}
	errs.push(...optNumber(p, 'cap', at, 1, 999, true));
	return errs;
};
const checkLink = (p: Props, w: string, i?: number): string[] => {
	const at = i === undefined ? w : `${w} links[${i}]`;
	const errs: string[] = [];
	if (!isId(p.a) || !isId(p.b)) errs.push(`${at} needs "a" and "b": node ids`);
	else if (p.a === p.b) errs.push(`${at}: a link needs two different nodes`);
	if (p.label !== undefined && (typeof p.label !== 'string' || p.label.length > 14)) errs.push(`${at}: "label" must be at most 14 characters`);
	return errs;
};
const nodeRef = (p: Props, key: string, w: string): string[] => (isId(p[key]) ? [] : [`${w} needs "${key}": a node id`]);

export const validateNet = (a: Action): string[] => {
	const p = a as Props;
	const w = what(a);
	const errs: string[] = [];
	switch (a.do) {
		case 'world.set': {
			if (p.title !== undefined && (typeof p.title !== 'string' || p.title.length > 34)) errs.push('world.set netmap: "title" must be a string of at most 34 characters');
			if (p.nodes !== undefined) {
				if (!Array.isArray(p.nodes)) errs.push('world.set netmap: "nodes" must be an array');
				else {
					if (p.nodes.length > MAX_NODES) errs.push(`world.set netmap: ${p.nodes.length} nodes (max ${MAX_NODES})`);
					p.nodes.forEach((n, i) => errs.push(...(n && typeof n === 'object' ? checkNode(n as Props, 'world.set netmap', i) : [`world.set netmap: nodes[${i}] must be an object`])));
				}
			}
			if (p.links !== undefined) {
				if (!Array.isArray(p.links)) errs.push('world.set netmap: "links" must be an array');
				else {
					if (p.links.length > MAX_LINKS) errs.push(`world.set netmap: ${p.links.length} links (max ${MAX_LINKS})`);
					p.links.forEach((l, i) => errs.push(...(l && typeof l === 'object' ? checkLink(l as Props, 'world.set netmap', i) : [`world.set netmap: links[${i}] must be an object`])));
				}
			}
			break;
		}
		case 'nm.node':
			errs.push(...checkNode(p, w));
			break;
		case 'nm.link':
			errs.push(...checkLink(p, w));
			break;
		case 'nm.send':
			errs.push(...nodeRef(p, 'from', w), ...nodeRef(p, 'to', w));
			errs.push(...needString(p, 'kind', w, MAX_KIND));
			if (p.via !== undefined && (!Array.isArray(p.via) || !p.via.every(isId))) errs.push(`${w}: "via" must be an array of node ids`);
			errs.push(...optNumber(p, 'count', w, 1, 9, true), ...optNumber(p, 'gap_ms', w, 40, 2000), ...optNumber(p, 'hop_ms', w, 150, 3000));
			if (p.tone !== undefined && !(PACKET_TONES as readonly unknown[]).includes(p.tone)) errs.push(`${w}: "tone" must be one of ${PACKET_TONES.join(', ')}`);
			if (p.resets !== undefined && typeof p.resets !== 'boolean') errs.push(`${w}: "resets" must be true or false`);
			break;
		case 'nm.drop':
			errs.push(...nodeRef(p, 'node', w));
			break;
		case 'nm.cut':
			errs.push(...nodeRef(p, 'a', w), ...nodeRef(p, 'b', w));
			break;
		case 'nm.heal':
			if ((p.a === undefined) !== (p.b === undefined)) errs.push(`${w}: give both "a" and "b", or neither to heal everything`);
			else if (p.a !== undefined) errs.push(...nodeRef(p, 'a', w), ...nodeRef(p, 'b', w));
			break;
		case 'nm.partition':
			if (!Array.isArray(p.groups) || p.groups.length < 2 || p.groups.length > 4 || !p.groups.every((g) => Array.isArray(g) && g.length > 0 && g.every(isId))) errs.push(`${w} needs "groups": 2-4 non-empty arrays of node ids`);
			break;
		case 'nm.role':
			errs.push(...nodeRef(p, 'node', w));
			if (p.role === undefined && p.term === undefined) errs.push(`${w} needs "role" and / or "term"`);
			if (p.role !== undefined && (typeof p.role !== 'string' || !/^[a-z][a-z-]{0,11}$/.test(p.role))) errs.push(`${w}: "role" must be a lowercase word of at most 12 letters ("follower", "candidate", "leader")`);
			errs.push(...optNumber(p, 'term', w, 0, 999, true));
			break;
		case 'nm.badge':
			errs.push(...nodeRef(p, 'node', w), ...needString(p, 'text', w, MAX_BADGE));
			if (p.tone !== undefined && !(TONES as readonly unknown[]).includes(p.tone)) errs.push(`${w}: "tone" must be one of ${TONES.join(', ')}`);
			break;
		case 'nm.down':
		case 'nm.up':
			errs.push(...nodeRef(p, 'node', w));
			break;
		case 'nm.timer':
			errs.push(...nodeRef(p, 'node', w));
			if (p.off !== true) {
				if (typeof p.ms !== 'number') errs.push(`${w} needs "ms": how long the ring takes to drain on screen (or "off": true)`);
				else errs.push(...optNumber(p, 'ms', w, 200, 20000));
			}
			if (p.label !== undefined && (typeof p.label !== 'string' || p.label.length > 14)) errs.push(`${w}: "label" must be at most 14 characters`);
			break;
		case 'nm.buffer':
			errs.push(...nodeRef(p, 'node', w));
			if (typeof p.level !== 'number') errs.push(`${w} needs "level": packets queued`);
			else errs.push(...optNumber(p, 'level', w, 0, 999));
			errs.push(...optNumber(p, 'cap', w, 1, 999, true), ...optNumber(p, 'ms', w, 100, 5000));
			if (p.overflow !== undefined && typeof p.overflow !== 'boolean') errs.push(`${w}: "overflow" must be true or false`);
			break;
		case 'nm.stat':
			if (!isId(p.id)) errs.push(`${w} needs "id": a short name for the counter`);
			if (typeof p.value !== 'number' && typeof p.value !== 'string') errs.push(`${w} needs "value": a number or text`);
			if (p.label !== undefined && (typeof p.label !== 'string' || p.label.length > 12)) errs.push(`${w}: "label" must be at most 12 characters`);
			if (p.unit !== undefined && (typeof p.unit !== 'string' || p.unit.length > 4)) errs.push(`${w}: "unit" must be at most 4 characters`);
			if (p.node !== undefined) errs.push(...nodeRef(p, 'node', w));
			if (p.tone !== undefined && !(TONES as readonly unknown[]).includes(p.tone)) errs.push(`${w}: "tone" must be one of ${TONES.join(', ')}`);
			errs.push(...optNumber(p, 'ms', w, 100, 5000), ...optNumber(p, 'from', w, -1e9, 1e9));
			break;
		case 'nm.log': {
			errs.push(...nodeRef(p, 'node', w));
			const lines = Array.isArray(p.lines) ? p.lines : p.text !== undefined ? [p.text] : [];
			if (!lines.length) errs.push(`${w} needs "text" or "lines"`);
			if (lines.length > 4) errs.push(`${w}: ${lines.length} lines (max 4 per action)`);
			lines.forEach((l, i) => {
				if (typeof l !== 'string' || !l.trim()) errs.push(`${w}: line ${i} must be text`);
				else if (l.length > MAX_LOG) errs.push(`${w}: line ${i} is ${l.length} characters (max ${MAX_LOG}); keep log lines short`);
			});
			if (p.tone !== undefined && !['out', 'ok', 'warn', 'err', 'dim'].includes(String(p.tone))) errs.push(`${w}: "tone" must be one of out, ok, warn, err, dim`);
			break;
		}
		case 'nm.focus':
			if (p.off !== true) errs.push(...nodeRef(p, 'node', w));
			break;
	}
	return errs;
};

const nodesOf = (p: Props): Props[] => (Array.isArray(p.nodes) ? (p.nodes as Props[]) : []);
const linksOf = (p: Props): Props[] => (Array.isArray(p.links) ? (p.links as Props[]) : []);

export const netTokens = (a: Action): WorldText[] => {
	const p = a as Props;
	const out: WorldText[] = [];
	const add = (text: string, off: number) => text && out.push({text, off});
	switch (a.do) {
		case 'world.set':
			add(sv(p.title), 0);
			for (const n of nodesOf(p)) add(sv(n.label, sv(n.id)), APPEAR_F);
			for (const l of linksOf(p)) add(sv(l.label), APPEAR_F);
			break;
		case 'nm.node':
			add(sv(p.label, sv(p.id)), APPEAR_F);
			break;
		case 'nm.link':
			add(sv(p.label), APPEAR_F);
			break;
		case 'nm.send':
			add(sv(p.kind), 0);
			break;
		case 'nm.role': {
			const role = sv(p.role);
			const term = typeof p.term === 'number' ? `T${p.term}` : '';
			add([role, term].filter(Boolean).join(' '), 2);
			break;
		}
		case 'nm.badge':
			add(sv(p.text), 2);
			break;
		case 'nm.timer':
			if (p.off !== true) add(sv(p.label), 0);
			break;
		case 'nm.buffer': {
			const ms = Math.max(1, msToFrames(nv(p.ms, DEFAULT_TWEEN_MS)));
			add(`${Math.round(nv(p.level, 0))}/${Math.round(nv(p.cap, DEFAULT_CAP))}`, ms);
			break;
		}
		case 'nm.stat': {
			const ms = Math.max(1, msToFrames(nv(p.ms, DEFAULT_TWEEN_MS)));
			add(statText(sv(p.label, sv(p.id)), p.value as number | string, p.of as number | string | undefined, sv(p.unit)), typeof p.value === 'number' ? ms : 0);
			break;
		}
		case 'nm.log': {
			const lines = Array.isArray(p.lines) ? strList(p.lines) : [sv(p.text)];
			lines.forEach((l, i) => add(l, i * 4));
			break;
		}
	}
	return out;
};

/** Travel time of a send in frames (the longest hop chain is unknown statically: assume a two-hop path at most). */
export const sendFrames = (p: Props): number => {
	const via = Array.isArray(p.via) ? p.via.length : 0;
	const hops = via + 1;
	return hops * hopFrames(p) + (hops - 1) * HOLD_F + (Math.max(1, Math.round(nv(p.count, 1))) - 1) * gapFrames(p);
};

export const netRows = (a: Action): number => {
	const p = a as Props;
	switch (a.do) {
		case 'nm.send':
			return Math.ceil((sendFrames(p) / 30) * (1000 / 300));
		case 'nm.log':
			return Array.isArray(p.lines) ? p.lines.length : 1;
		case 'world.set':
			return nodesOf(p).length + linksOf(p).length;
		case 'nm.timer':
			return p.off === true ? 0 : Math.min(8, Math.ceil(nv(p.ms, 0) / 300));
		case 'nm.node':
		case 'nm.link':
			return 1;
	}
	return 0;
};

export const netSettle = (a: Action): number => {
	const p = a as Props;
	switch (a.do) {
		case 'nm.send':
			return sendFrames(p) + 3;
		case 'nm.buffer':
			return Math.max(1, msToFrames(nv(p.ms, DEFAULT_TWEEN_MS))) + 2;
		case 'nm.stat':
			return Math.max(1, msToFrames(nv(p.ms, DEFAULT_TWEEN_MS))) + 2;
		case 'nm.role':
			return CROWN_F + 2;
		case 'world.set':
		case 'nm.node':
		case 'nm.link':
			return APPEAR_F + 4;
		case 'nm.cut':
		case 'nm.partition':
		case 'nm.drop':
		case 'nm.down':
			return 10;
	}
	return 3;
};

/** A cut, a partition, a dropped packet, a crash, a leader taking the crown, a buffer overflowing. */
export const netIsSignature = (a: Action): boolean => {
	const p = a as Props;
	switch (a.do) {
		case 'nm.cut':
		case 'nm.partition':
		case 'nm.drop':
		case 'nm.down':
			return true;
		case 'nm.role':
			return p.role === 'leader';
		case 'nm.buffer':
			return p.overflow === true || (typeof p.cap === 'number' && typeof p.level === 'number' && p.level >= p.cap);
	}
	return false;
};

/** Problems that need the whole timeline: unknown nodes, no route, sends from a crashed node, a twice-declared id. */
export const netTimelineProblems = (events: WorldEvent[]): string[] => planNet(events).issues;
