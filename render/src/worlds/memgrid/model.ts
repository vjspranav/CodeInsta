/**
 * memgrid: virtual memory as a machine you can watch, as a pure model.
 *
 *   world.set   {world: "memgrid", levels?: 1..4, bits?: [9,9,9,9], page_bits?: 12, frames?: 4..12, tlb?: 2..5,
 *                title?, proc?: "shell", pid?: "4242", names?: ["PML4","PDPT","PD","PT"]}
 *   mem.addr    {va: "0x00007f3a5c2e1a48", proc?, op?: "read"|"write"}   the CPU issues an address (bits typed in)
 *   mem.split   {}                       the address splits into one index per level and the page offset
 *   mem.lookup  {expect?: "hit"|"miss"}  the TLB is searched; the row that matches lights up (hit) or none does (miss)
 *   mem.walk    {step_ms?, fill?}        the MMU walks the page table from CR3, one table (one RAM read) per level
 *   mem.tlbfill {}                       the finished translation is cached in the TLB (oldest entry evicted)
 *   mem.fault   {frame?, src?, label?, flags?}   page fault: a frame goes from free to allocated to filled, the entry turns present
 *   mem.cow     {proc?, va?}             a write to a shared copy-on-write page splits its frame in two
 *   mem.map     {va, frame, flags?, label?, proc?}   set-up: map a page to a frame (no fault counted)
 *   mem.fork    {child, pid?}            the child gets copies of the page table; every page becomes copy-on-write
 *   mem.vfork   {child, pid?}            the child shares the parent's address space; the parent is suspended
 *   mem.exec    {proc?, image, pages?, va?}   the address space is replaced, the pid stays
 *   mem.flush   {proc?}                  TLB flush (all entries, or one process's)
 * Every action also takes `note`: the text of the status line (default text is written from the state).
 *
 * The model is a small simulation: the TLB result of a lookup, the entries of a walk, the free frame a fault takes
 * and the refcounts of shared frames all come from the machine state the earlier actions built, never from the
 * script, so the picture cannot contradict itself. `expect` lets the script assert what it narrates.
 * Timing rule: every action starts at its own frame; an action started while the previous one is still animating
 * makes the rest of the previous one happen at once (and the gate reports it).
 */
import type {Action} from '../../schema';
import type {Rect} from '../../theme';
import {hash, lin, prog} from '../../theme';
import {colW} from '../../codewrap';
import {getStyle} from '../../styles';
import type {WorldEvent, WorldText} from '../types';
import {msToFrames, needString, nv, optNumber, Props, sv} from '../kit';

export const MEM_ID = 'memgrid';
export const MEM_ACTIONS = ['mem.addr', 'mem.split', 'mem.lookup', 'mem.walk', 'mem.tlbfill', 'mem.fault', 'mem.cow', 'mem.map', 'mem.fork', 'mem.vfork', 'mem.exec', 'mem.flush'] as const;
export const MEM_SIGNATURE = ['mem.lookup', 'mem.walk', 'mem.fault', 'mem.cow'] as const;

// ------------------------------------------------------------------ timing (frames at 30 fps)
export const ADDR_FRAMES = 18;
export const SPLIT_FRAMES = 26;
export const LOOKUP_RESULT = 14;
export const LOOKUP_FRAMES = 36;
export const WALK_LEAD = 8;
export const WALK_TAIL = 20;
export const FILL_FRAMES = 16;
export const FAULT_ALLOC = 14;
export const FAULT_FILLED = 44;
export const FAULT_PTE = 48;
export const FAULT_FRAMES = 62;
export const COW_ALLOC = 12;
export const COW_FILLED = 40;
export const COW_PTE = 44;
export const COW_FRAMES = 58;
export const FORK_FLAG = 16;
export const FORK_FRAMES = 32;
export const EXEC_PAGE = 8;
export const MAP_FRAMES = 14;
export const FLUSH_FRAMES = 14;
export const MIN_STEP_FRAMES = 12;
export const DEFAULT_STEP_MS = 600;
export const MAX_NOTE = 52;
export const MAX_LABEL = 10;

export type Flags = 'rw' | 'ro' | 'cow' | 'x';
export const FLAGS: readonly Flags[] = ['rw', 'ro', 'cow', 'x'];
export type Tone = 'info' | 'ok' | 'bad' | 'warn';
export const SRCS = ['disk', 'zero', 'file', 'swap'] as const;
/** how the status line says where the page came from ({f} is the frame) */
const SRC_TEXT: Record<string, string> = {
	disk: 'page read from disk into {f}',
	zero: 'zero page filled into {f}',
	file: 'file page read into {f}',
	swap: 'page read back from swap into {f}',
};

// ------------------------------------------------------------------ configuration (from the first world.set)
export interface Cfg {
	title: string;
	levels: number;
	bits: number[];
	names: string[];
	pageBits: number;
	nFrames: number;
	nTlb: number;
	proc: string;
	pid: string;
	totalBits: number;
	vpnDigits: number;
}

const DEFAULT_BITS: Record<number, number[]> = {1: [20], 2: [10, 10], 3: [2, 9, 9], 4: [9, 9, 9, 9]};
const DEFAULT_NAMES: Record<number, string[]> = {1: ['vpn'], 2: ['PD', 'PT'], 3: ['PDPT', 'PD', 'PT'], 4: ['PML4', 'PDPT', 'PD', 'PT']};

export const cfgOf = (events: WorldEvent[]): Cfg => {
	const first = events.find((e) => e.action.do === 'world.set');
	const p = (first?.action ?? {}) as Props;
	const levels = typeof p.levels === 'number' && p.levels >= 1 && p.levels <= 4 ? Math.round(p.levels) : 1;
	const bits = Array.isArray(p.bits) && p.bits.length === levels && p.bits.every((b) => typeof b === 'number') ? (p.bits as number[]) : DEFAULT_BITS[levels];
	const names = Array.isArray(p.names) && p.names.length === levels && p.names.every((n) => typeof n === 'string') ? (p.names as string[]) : DEFAULT_NAMES[levels];
	const pageBits = typeof p.page_bits === 'number' ? Math.round(p.page_bits) : 12;
	const totalBits = bits.reduce((a, b) => a + b, 0) + pageBits;
	return {
		title: sv(p.title, 'memgrid'),
		levels,
		bits,
		names,
		pageBits,
		nFrames: Math.min(12, Math.max(4, Math.round(nv(p.frames, 12)))),
		nTlb: Math.min(5, Math.max(2, Math.round(nv(p.tlb, 4)))),
		proc: sv(p.proc, 'proc'),
		pid: sv(p.pid),
		totalBits,
		vpnDigits: Math.ceil((totalBits - pageBits) / 4),
	};
};

// ------------------------------------------------------------------ addresses
const big = (v: string) => BigInt('0x' + (v || '0'));
export interface Split {
	/** canonical virtual address, hex digits without 0x */
	va: string;
	slices: number[];
	offset: number;
	/** page number, hex without 0x, padded to the page-number width */
	vpn: string;
}

export const vaDigits = (cfg: Cfg) => (cfg.totalBits === 48 ? 16 : Math.ceil(cfg.totalBits / 4));

/** The address as the CPU shows it (x86-64: bits 48..63 repeat bit 47), hex digits without 0x. */
export const canonVa = (cfg: Cfg, raw: string): string => {
	const mask = (BigInt(1) << BigInt(cfg.totalBits)) - BigInt(1);
	let v = BigInt('0x' + (raw.replace(/^0x/i, '') || '0')) & mask;
	if (cfg.totalBits === 48 && (v >> BigInt(47)) & BigInt(1)) v |= ((BigInt(1) << BigInt(16)) - BigInt(1)) << BigInt(48);
	return v.toString(16).padStart(vaDigits(cfg), '0');
};

export const splitAddr = (cfg: Cfg, raw: string): Split => {
	const va = canonVa(cfg, raw);
	const v = big(va) & ((BigInt(1) << BigInt(cfg.totalBits)) - BigInt(1));
	const slices: number[] = [];
	for (let k = 0; k < cfg.levels; k++) {
		const low = cfg.bits.slice(k + 1).reduce((a, b) => a + b, 0) + cfg.pageBits;
		slices.push(Number((v >> BigInt(low)) & ((BigInt(1) << BigInt(cfg.bits[k])) - BigInt(1))));
	}
	const offset = Number(v & ((BigInt(1) << BigInt(cfg.pageBits)) - BigInt(1)));
	return {va, slices, offset, vpn: (v >> BigInt(cfg.pageBits)).toString(16).padStart(cfg.vpnDigits, '0')};
};

export const hexVa = (va: string) => '0x' + va;
const padBin = (n: number, bits: number) => n.toString(2).padStart(bits, '0');
/** the bits of slice `i` (0..levels-1) or of the offset (i === levels), as 0/1 characters */
export const sliceBits = (cfg: Cfg, sp: Split, i: number): string => (i < cfg.levels ? padBin(sp.slices[i], cfg.bits[i]) : padBin(sp.offset, cfg.pageBits));
export const sliceWidth = (cfg: Cfg, i: number) => (i < cfg.levels ? cfg.bits[i] : cfg.pageBits);
/** the value shown under a slice: decimal for an index, hex for wide slices and the offset */
export const sliceValue = (cfg: Cfg, sp: Split, i: number): string => {
	if (i === cfg.levels) return '0x' + sp.offset.toString(16);
	const v = sp.slices[i];
	return cfg.bits[i] > 11 ? '0x' + v.toString(16) : String(v);
};
export const sliceName = (cfg: Cfg, i: number) => (i < cfg.levels ? cfg.names[i] : 'offset');

export const pageSizeText = (cfg: Cfg) => {
	const n = Math.pow(2, cfg.pageBits);
	return n >= 1048576 ? `${n / 1048576} MiB` : `${n / 1024} KiB`;
};

const physText = (cfg: Cfg, frame: number, offset: number) => '0x' + ((frame << cfg.pageBits) | offset).toString(16).padStart(4, '0');

/** Physical address of a page-table page: derived, stable and clear of the user frame grid. */
const tableAddr = (key: string) => '0x' + ((0x20 + (hash(key) % 0x1c0)) << 12).toString(16);

// ------------------------------------------------------------------ machine
export interface Pte {
	vpn: string;
	/** frame number, -1 while not present */
	frame: number;
	flags: Flags;
	present: boolean;
	label: string;
	/** frame this entry last changed (flash) */
	at: number;
}
export interface Space {
	id: string;
	label: string;
	pid: string;
	/** vfork: the id of the space whose tables this process uses */
	shares: string;
	dim: boolean;
	at: number;
	ptes: Pte[];
	/** frame of the latest exec (the pid tag flashes) */
	execAt: number;
}
export interface Cell {
	state: 'empty' | 'alloc' | 'filled';
	label: string;
	refs: number;
	owners: string[];
	/** frame of the last change (flash) */
	at: number;
	/** an allocated frame fills (page read in / copied) between these frames */
	from: number;
	to: number;
	/** frame it is being copied from (-1: read in) */
	copyFrom: number;
	/** the translation reads this frame now */
	hot: number;
}
export interface TlbRow {
	space: string;
	vpn: string;
	frame: number;
	flags: Flags;
	at: number;
}
export interface WalkEntry {
	level: number;
	idx: number;
	present: boolean;
	/** "0x1b000" (next table) or "F5 rw" (the page) or "not present" */
	target: string;
}
export interface Walk {
	at: number;
	space: string;
	vpn: string;
	entries: WalkEntry[];
	/** level the walk stopped at (entry not present), -1 when it reached the page */
	failAt: number;
	/** frame at which each level was read so far */
	stepAt: number[];
	/** frame the walk finished (-1 while running) */
	doneAt: number;
	frame: number;
	leafAt: number;
}
export interface M {
	addr: {va: string; proc: string; op: 'read' | 'write'; at: number; splitAt: number} | null;
	phys: {addr: string; frame: number; at: number; via: 'tlb' | 'walk'} | null;
	lookup: {at: number; resultAt: number; result: 'hit' | 'miss' | null; slot: number} | null;
	walk: Walk | null;
	fault: {at: number; kind: 'fault' | 'cow'; cr2: string; label: string; src: string; from: number; to: number} | null;
	spaces: Space[];
	cur: string;
	frames: Cell[];
	tlb: (TlbRow | null)[];
	tlbNext: number;
	flushAt: number;
	fillAt: number;
	fillSlot: number;
	c: {hit: number; miss: number; fault: number; cow: number; ram: number};
	bump: {hit: number; miss: number; fault: number; cow: number; ram: number};
	status: {text: string; tone: Tone; at: number};
}

const initM = (cfg: Cfg): M => ({
	addr: null,
	phys: null,
	lookup: null,
	walk: null,
	fault: null,
	spaces: [{id: cfg.proc, label: cfg.proc, pid: cfg.pid, shares: '', dim: false, at: -1, ptes: [], execAt: -1}],
	cur: cfg.proc,
	frames: Array.from({length: cfg.nFrames}, () => ({state: 'empty' as const, label: '', refs: 0, owners: [], at: -1, from: -1, to: -1, copyFrom: -1, hot: -1})),
	tlb: Array.from({length: cfg.nTlb}, () => null),
	tlbNext: 0,
	flushAt: -1,
	fillAt: -1,
	fillSlot: -1,
	c: {hit: 0, miss: 0, fault: 0, cow: 0, ram: 0},
	bump: {hit: -1, miss: -1, fault: -1, cow: -1, ram: -1},
	status: {text: '', tone: 'info', at: -1},
});

const clone = <T,>(x: T): T => structuredClone(x);
export const spaceIndex = (m: Pick<M, 'spaces'>, id: string) => Math.max(0, m.spaces.findIndex((x) => x.id === id));
const spaceOf = (m: M, id: string) => m.spaces.find((s) => s.id === id);
/** the space whose tables translate for process `id` (a vfork child uses its parent's) */
const keyOf = (m: M, id: string) => spaceOf(m, id)?.shares || id;
const pteOf = (m: M, id: string, vpn: string) => spaceOf(m, keyOf(m, id))?.ptes.find((p) => p.vpn === vpn);
const recount = (m: M) => {
	m.frames.forEach((c, i) => {
		const own = new Set<string>();
		let refs = 0;
		for (const s of m.spaces) for (const p of s.ptes) if (p.present && p.frame === i) {
			own.add(s.id);
			refs++;
		}
		c.refs = refs;
		c.owners = [...own];
	});
};
const firstFree = (m: M) => m.frames.findIndex((c) => c.state === 'empty');
/** an exec (or exit) drops a process's own mappings; frames nobody maps any more become free */
const releaseSpace = (m: M, sid: string, at: number) => {
	const sp = spaceOf(m, sid);
	if (!sp) return;
	sp.ptes = [];
	recount(m);
	for (const c of m.frames) if (c.refs === 0 && c.state === 'filled') Object.assign(c, {state: 'empty', label: '', at, from: -1, to: -1, copyFrom: -1});
};
const invalidate = (m: M, space: string, vpn?: string) => {
	m.tlb = m.tlb.map((r) => (r && r.space === space && (vpn === undefined || r.vpn === vpn) ? null : r));
};

export const walkOf = (cfg: Cfg, m: M, spaceId: string, sp: Split): {entries: WalkEntry[]; failAt: number; frame: number} => {
	const space = spaceOf(m, keyOf(m, spaceId));
	const ptes = space?.ptes ?? [];
	const vpn = big(sp.vpn);
	const entries: WalkEntry[] = [];
	let failAt = -1;
	let frame = -1;
	for (let k = 0; k < cfg.levels; k++) {
		const low = BigInt(cfg.bits.slice(k + 1).reduce((a, b) => a + b, 0));
		const prefix = vpn >> low;
		const leaf = k === cfg.levels - 1;
		const hit = ptes.filter((p) => (big(p.vpn) >> low) === prefix);
		const idx = sp.slices[k];
		if (failAt >= 0 || !hit.length) {
			if (failAt < 0) failAt = k;
			entries.push({level: k, idx, present: false, target: 'not present'});
			continue;
		}
		if (leaf) {
			const p = hit.find((x) => x.vpn === sp.vpn);
			if (p && p.present) {
				frame = p.frame;
				entries.push({level: k, idx, present: true, target: `F${p.frame} ${p.flags}`});
			} else {
				failAt = k;
				entries.push({level: k, idx, present: false, target: 'not present'});
			}
		} else entries.push({level: k, idx, present: true, target: tableAddr(`${k + 1}:${prefix.toString(16)}:${space?.id ?? ''}`)});
	}
	return {entries, failAt, frame};
};

export const cr3Of = (m: M, spaceId: string) => tableAddr(`cr3:${keyOf(m, spaceId)}`);

// ------------------------------------------------------------------ plan (whole session, frame independent)
interface Mut {
	frame: number;
	op: number;
	fn: (m: M) => void;
}
interface OpInfo {
	kind: string;
	beat: number;
	start: number;
	end: number;
}
interface Plan {
	cfg: Cfg;
	base: M;
	muts: Mut[];
	ops: OpInfo[];
	issues: string[];
}

const plans = new WeakMap<WorldEvent[], Plan>();

export const rowCap = (_cfg: Cfg, nSpaces: number) => (nSpaces <= 1 ? 6 : 3);
const noteOf = (p: Props, dflt: string) => (typeof p.note === 'string' && p.note.trim() ? p.note : dflt);
const flagsOf = (v: unknown, d: Flags): Flags => ((FLAGS as readonly unknown[]).includes(v) ? (v as Flags) : d);

export const planMem = (events: WorldEvent[]): Plan => {
	const hit = plans.get(events);
	if (hit) return hit;
	const cfg = cfgOf(events);
	const base = initM(cfg);
	const sim = clone(base);
	const muts: Mut[] = [];
	const ops: OpInfo[] = [];
	const issues: string[] = [];
	let op = -1;
	let start = 0;
	let beat = 0;

	const put = (off: number, fn: (m: M) => void) => {
		muts.push({frame: start + off, op, fn});
		fn(sim);
	};
	const status = (off: number, text: string, tone: Tone = 'info') => {
		const at = start + off;
		put(off, (m) => {
			m.status = {text, tone, at};
		});
	};
	const bump = (off: number, key: keyof M['c']) => {
		const at = start + off;
		put(off, (m) => {
			m.c[key]++;
			m.bump[key] = at;
		});
	};
	const bad = (msg: string) => issues.push(`beat ${beat}: ${msg}`);
	const checkRows = (kind: string) => {
		if (cfg.levels > 1) return;
		const cap = rowCap(cfg, sim.spaces.length);
		for (const s of sim.spaces) if (s.ptes.length > cap) bad(`${kind}: ${s.label} has ${s.ptes.length} page-table rows (the view shows ${cap} with ${sim.spaces.length} process${sim.spaces.length > 1 ? 'es' : ''}); map fewer pages`);
	};
	const checkFrame = (kind: string, f: number) => {
		if (f < 0 || f >= cfg.nFrames) {
			bad(`${kind}: frame ${f} is outside the ${cfg.nFrames} frames of the grid`);
			return false;
		}
		return true;
	};

	for (const e of events) {
		const a = e.action as Props;
		const kind = String(e.action.do);
		if (kind === 'world.set') continue;
		// the previous action is cut short by this one
		const cut: string[] = [];
		for (const mu of muts) if (mu.op < op + 1 && mu.frame > e.frame) {
			if (!cut.includes(ops[mu.op].kind)) cut.push(ops[mu.op].kind);
			mu.frame = e.frame;
		}
		if (cut.length) bad(`${kind} starts while ${cut.join(', ')} is still animating; the rest of it appears at once (start it later)`);
		op = ops.length;
		start = e.frame;
		beat = e.beat;
		const S = e.frame;
		ops.push({kind, beat: e.beat, start: e.frame, end: e.frame + 1});
		const finish = (frames: number) => {
			ops[op].end = S + frames;
		};
		const proc = sv(a.proc, sim.cur);
		if (!spaceOf(sim, proc)) {
			bad(`${kind}: no process "${proc}" (known: ${sim.spaces.map((s) => s.id).join(', ')})`);
			finish(1);
			continue;
		}

		switch (kind) {
			case 'mem.addr': {
				const va = canonVa(cfg, sv(a.va, '0'));
				const raw = BigInt('0x' + (sv(a.va, '0x0').replace(/^0x/i, '') || '0'));
				if (raw >> BigInt(cfg.totalBits) !== BigInt(0) && !(cfg.totalBits === 48 && (raw >> BigInt(48) === BigInt(0xffff) || raw >> BigInt(48) === BigInt(0)))) bad(`mem.addr: ${sv(a.va)} is wider than the ${cfg.totalBits}-bit address space`);
				const opn = a.op === 'write' ? 'write' : 'read';
				put(0, (m) => {
					m.addr = {va, proc, op: opn, at: S, splitAt: -1};
					m.phys = null;
					m.lookup = null;
					m.walk = null;
					m.fault = null;
					m.cur = proc;
				});
				status(0, noteOf(a, `${opn === 'write' ? 'store to' : 'load from'} ${hexVa(va)}`));
				finish(ADDR_FRAMES);
				break;
			}
			case 'mem.split': {
				if (!sim.addr) {
					bad('mem.split before mem.addr');
					finish(1);
					break;
				}
				put(0, (m) => {
					if (m.addr) m.addr.splitAt = S;
				});
				status(0, noteOf(a, `split: ${cfg.bits.join(' + ')} index bits, ${cfg.pageBits} offset bits`));
				finish(SPLIT_FRAMES + 8);
				break;
			}
			case 'mem.lookup': {
				if (!sim.addr) {
					bad('mem.lookup before mem.addr');
					finish(1);
					break;
				}
				const sp = splitAddr(cfg, sim.addr.va);
				const key = keyOf(sim, sim.addr.proc);
				const slot = sim.tlb.findIndex((r) => r && r.space === key && r.vpn === sp.vpn);
				const result = slot >= 0 ? 'hit' : 'miss';
				if (typeof a.expect === 'string' && a.expect !== result) bad(`mem.lookup expects a TLB ${a.expect} but the TLB holds ${result === 'hit' ? 'this page' : 'no entry for this page'} at this point`);
				put(0, (m) => {
					m.lookup = {at: S, resultAt: S + LOOKUP_RESULT, result: null, slot: -1};
				});
				const row = slot >= 0 ? sim.tlb[slot] : null;
				put(LOOKUP_RESULT, (m) => {
					if (m.lookup) {
						m.lookup.result = result;
						m.lookup.slot = slot;
					}
					if (row) {
						m.phys = {addr: physText(cfg, row.frame, sp.offset), frame: row.frame, at: S + LOOKUP_RESULT, via: 'tlb'};
						if (m.frames[row.frame]) m.frames[row.frame].hot = S + LOOKUP_RESULT;
					}
				});
				bump(LOOKUP_RESULT, result === 'hit' ? 'hit' : 'miss');
				status(LOOKUP_RESULT, noteOf(a, result === 'hit' ? `TLB hit: frame F${row?.frame}, no page walk` : 'TLB miss: the page table must be walked'), result === 'hit' ? 'ok' : 'bad');
				finish(LOOKUP_FRAMES);
				break;
			}
			case 'mem.walk': {
				if (!sim.addr) {
					bad('mem.walk before mem.addr');
					finish(1);
					break;
				}
				const sp = splitAddr(cfg, sim.addr.va);
				const w = walkOf(cfg, sim, sim.addr.proc, sp);
				const step = Math.max(MIN_STEP_FRAMES, msToFrames(nv(a.step_ms, DEFAULT_STEP_MS)));
				const reached = w.failAt >= 0 ? w.failAt + 1 : cfg.levels;
				const spaceKey = keyOf(sim, sim.addr.proc);
				put(0, (m) => {
					m.walk = {at: S, space: spaceKey, vpn: sp.vpn, entries: w.entries.map((x) => ({...x})), failAt: w.failAt, stepAt: [], doneAt: -1, frame: w.frame, leafAt: -1};
					m.phys = null;
				});
				for (let k = 0; k < reached; k++) {
					const at = S + WALK_LEAD + k * step;
					put(WALK_LEAD + k * step, (m) => {
						m.walk?.stepAt.push(at);
						m.c.ram++;
						m.bump.ram = at;
					});
				}
				const done = WALK_LEAD + reached * step + 4;
				status(WALK_LEAD, `walking ${cfg.levels} level${cfg.levels > 1 ? 's' : ''}, one RAM read each`, 'info');
				if (w.failAt < 0) {
					const pte = pteOf(sim, sim.addr.proc, sp.vpn);
					put(done, (m) => {
						if (m.walk) m.walk.doneAt = S + done;
						m.phys = {addr: physText(cfg, w.frame, sp.offset), frame: w.frame, at: S + done, via: 'walk'};
						if (m.frames[w.frame]) m.frames[w.frame].hot = S + done;
					});
					status(done, noteOf(a, `walk done after ${reached} RAM read${reached > 1 ? 's' : ''}: frame F${w.frame}`), 'ok');
					if (a.fill === true && pte) {
						const row: TlbRow = {space: spaceKey, vpn: sp.vpn, frame: w.frame, flags: pte.flags, at: S + done + 6};
						const ex = sim.tlb.findIndex((r) => r && r.space === spaceKey && r.vpn === sp.vpn);
						const free = sim.tlb.findIndex((r) => r === null);
						const slot = ex >= 0 ? ex : free >= 0 ? free : sim.tlbNext;
						put(done + 6, (m) => {
							m.tlb[slot] = {...row};
							if (ex < 0 && free < 0) m.tlbNext = (m.tlbNext + 1) % cfg.nTlb;
							m.fillAt = row.at;
							m.fillSlot = slot;
						});
						status(done + 6, noteOf(a, `walk done, TLB filled: next access skips the walk`), 'ok');
						finish(done + 6 + FILL_FRAMES);
						break;
					}
				} else {
					put(done, (m) => {
						if (m.walk) m.walk.doneAt = S + done;
					});
					status(done, noteOf(a, `walk stopped: ${cfg.names[w.failAt]} entry not present`), 'bad');
				}
				finish(done + WALK_TAIL);
				break;
			}
			case 'mem.tlbfill': {
				if (!sim.addr) {
					bad('mem.tlbfill before mem.addr');
					finish(1);
					break;
				}
				const sp = splitAddr(cfg, sim.addr.va);
				const spaceKey = keyOf(sim, sim.addr.proc);
				const pte = pteOf(sim, sim.addr.proc, sp.vpn);
				if (!pte || !pte.present) {
					bad(`mem.tlbfill: page ${sp.vpn} is not mapped, there is nothing to cache`);
					finish(1);
					break;
				}
				const ex = sim.tlb.findIndex((r) => r && r.space === spaceKey && r.vpn === sp.vpn);
				const free = sim.tlb.findIndex((r) => r === null);
				const slot = ex >= 0 ? ex : free >= 0 ? free : sim.tlbNext;
				const row: TlbRow = {space: spaceKey, vpn: sp.vpn, frame: pte.frame, flags: pte.flags, at: S};
				put(0, (m) => {
					m.tlb[slot] = {...row};
					if (ex < 0 && free < 0) m.tlbNext = (m.tlbNext + 1) % cfg.nTlb;
					m.fillAt = S;
					m.fillSlot = slot;
				});
				status(0, noteOf(a, `TLB filled: ${sp.vpn} -> F${pte.frame}`), 'ok');
				finish(FILL_FRAMES);
				break;
			}
			case 'mem.fault': {
				if (!sim.addr) {
					bad('mem.fault before mem.addr');
					finish(1);
					break;
				}
				const sp = splitAddr(cfg, sim.addr.va);
				const space = spaceOf(sim, keyOf(sim, sim.addr.proc))!;
				const have = space.ptes.find((p) => p.vpn === sp.vpn);
				if (have?.present) {
					bad(`mem.fault: page ${sp.vpn} is already present in F${have.frame}; a fault needs a page that is not`);
					finish(1);
					break;
				}
				const f = typeof a.frame === 'number' ? Math.round(a.frame) : firstFree(sim);
				if (f < 0 || !checkFrame('mem.fault', f)) {
					if (f < 0) bad('mem.fault: no free frame left (map fewer pages)');
					finish(1);
					break;
				}
				if (sim.frames[f].state !== 'empty') {
					bad(`mem.fault: frame F${f} is not free`);
					finish(1);
					break;
				}
				const label = sv(a.label, have?.label || 'page').slice(0, MAX_LABEL);
				const src = SRCS.includes(a.src as never) ? (a.src as string) : 'disk';
				const flags = flagsOf(a.flags, 'rw');
				const sid = space.id;
				const cr2 = hexVa(sim.addr.va);
				put(0, (m) => {
					const sp2 = spaceOf(m, sid)!;
					if (!sp2.ptes.some((p) => p.vpn === sp.vpn)) sp2.ptes.push({vpn: sp.vpn, frame: -1, flags, present: false, label, at: S});
					m.fault = {at: S, kind: 'fault', cr2, label, src, from: -1, to: f};
				});
				bump(0, 'fault');
				status(0, '#PF: the page is not present, the OS handler runs', 'bad');
				put(FAULT_ALLOC, (m) => {
					Object.assign(m.frames[f], {state: 'alloc', label, at: S + FAULT_ALLOC, from: S + FAULT_ALLOC, to: S + FAULT_FILLED, copyFrom: -1});
				});
				put(FAULT_FILLED, (m) => {
					Object.assign(m.frames[f], {state: 'filled', at: S + FAULT_FILLED});
				});
				put(FAULT_PTE, (m) => {
					const sp2 = spaceOf(m, sid)!;
					const pte = sp2.ptes.find((p) => p.vpn === sp.vpn)!;
					Object.assign(pte, {frame: f, flags, present: true, label, at: S + FAULT_PTE});
					recount(m);
					if (m.walk && m.walk.space === sid && m.walk.vpn === sp.vpn && m.walk.entries.length) {
						const last = m.walk.entries[m.walk.entries.length - 1];
						if (m.walk.failAt === cfg.levels - 1) {
							last.present = true;
							last.target = `F${f} ${flags}`;
							m.walk.frame = f;
							m.walk.leafAt = S + FAULT_PTE;
						}
					}
				});
				status(FAULT_PTE, noteOf(a, `${SRC_TEXT[src].replace('{f}', `F${f}`)}, entry now present`), 'ok');
				checkRows('mem.fault');
				finish(FAULT_FRAMES);
				break;
			}
			case 'mem.cow': {
				const sa = sim.addr;
				const vaRaw = typeof a.va === 'string' ? a.va : sa?.va;
				if (!vaRaw) {
					bad('mem.cow needs an address (mem.addr first, or "va")');
					finish(1);
					break;
				}
				const sp = splitAddr(cfg, vaRaw);
				const space = spaceOf(sim, keyOf(sim, proc))!;
				const pte = space.ptes.find((p) => p.vpn === sp.vpn);
				if (!pte || !pte.present) {
					bad(`mem.cow: page ${sp.vpn} is not mapped in ${proc}`);
					finish(1);
					break;
				}
				if (pte.flags === 'rw') {
					bad(`mem.cow: page ${sp.vpn} of ${proc} is writable already, there is no copy-on-write fault`);
					finish(1);
					break;
				}
				const from = pte.frame;
				const sid = space.id;
				const cell = sim.frames[from];
				const label = pte.label || cell.label;
				if (cell.refs <= 1) {
					put(0, (m) => {
						m.fault = {at: S, kind: 'cow', cr2: hexVa(canonVa(cfg, vaRaw)), label, src: '', from, to: from};
					});
					bump(0, 'fault');
					status(0, '#PF: write to a read-only page', 'bad');
					put(14, (m) => {
						const p2 = spaceOf(m, sid)!.ptes.find((p) => p.vpn === sp.vpn)!;
						Object.assign(p2, {flags: 'rw', at: S + 14});
						invalidate(m, sid, sp.vpn);
						m.frames[from].at = S + 14;
					});
					bump(14, 'cow');
					status(14, noteOf(a, `F${from} has one owner left: made writable, no copy`), 'ok');
					finish(30);
					break;
				}
				const to = firstFree(sim);
				if (to < 0) {
					bad('mem.cow: no free frame for the copy');
					finish(1);
					break;
				}
				put(0, (m) => {
					m.fault = {at: S, kind: 'cow', cr2: hexVa(canonVa(cfg, vaRaw)), label, src: '', from, to};
				});
				bump(0, 'fault');
				status(0, '#PF: write to a shared read-only page', 'bad');
				put(COW_ALLOC, (m) => {
					Object.assign(m.frames[to], {state: 'alloc', label, at: S + COW_ALLOC, from: S + COW_ALLOC, to: S + COW_FILLED, copyFrom: from});
				});
				put(COW_FILLED, (m) => {
					Object.assign(m.frames[to], {state: 'filled', at: S + COW_FILLED});
				});
				put(COW_PTE, (m) => {
					const p2 = spaceOf(m, sid)!.ptes.find((p) => p.vpn === sp.vpn)!;
					Object.assign(p2, {frame: to, flags: 'rw', at: S + COW_PTE});
					invalidate(m, sid, sp.vpn);
					recount(m);
					m.frames[from].at = S + COW_PTE;
					if (m.walk && m.walk.space === sid && m.walk.vpn === sp.vpn && m.walk.failAt < 0) {
						const last = m.walk.entries[m.walk.entries.length - 1];
						last.target = `F${to} rw`;
						m.walk.frame = to;
						m.walk.leafAt = S + COW_PTE;
					}
				});
				bump(COW_PTE, 'cow');
				status(COW_PTE, noteOf(a, `COW: ${proc} gets its own copy in F${to}`), 'ok');
				finish(COW_FRAMES);
				break;
			}
			case 'mem.map': {
				const sp = splitAddr(cfg, sv(a.va, '0'));
				const f = Math.round(nv(a.frame, -1));
				if (!checkFrame('mem.map', f)) {
					finish(1);
					break;
				}
				const flags = flagsOf(a.flags, 'rw');
				const label = sv(a.label, 'page').slice(0, MAX_LABEL);
				const sid = keyOf(sim, proc);
				if (sim.frames[f].state === 'alloc') {
					bad(`mem.map: frame F${f} is being filled`);
					finish(1);
					break;
				}
				put(0, (m) => {
					const space = spaceOf(m, sid)!;
					const ex = space.ptes.find((p) => p.vpn === sp.vpn);
					if (ex) Object.assign(ex, {frame: f, flags, present: true, label, at: S});
					else space.ptes.push({vpn: sp.vpn, frame: f, flags, present: true, label, at: S});
					if (m.frames[f].state === 'empty') Object.assign(m.frames[f], {state: 'filled', label});
					m.frames[f].at = S;
					recount(m);
				});
				status(0, noteOf(a, `mapped ${sp.vpn} to F${f} (${flags})`), 'info');
				checkRows('mem.map');
				finish(MAP_FRAMES);
				break;
			}
			case 'mem.fork':
			case 'mem.vfork': {
				const child = sv(a.child, 'child');
				if (spaceOf(sim, child)) {
					bad(`${kind}: process "${child}" exists already`);
					finish(1);
					break;
				}
				const parent = spaceOf(sim, keyOf(sim, proc))!;
				const pid = sv(a.pid);
				if (kind === 'mem.vfork') {
					put(0, (m) => {
						m.spaces.push({id: child, label: child, pid, shares: parent.id, dim: false, at: S, ptes: [], execAt: -1});
						spaceOf(m, parent.id)!.dim = true;
					});
					status(0, noteOf(a, `vfork: ${child} borrows ${parent.label}'s memory`), 'warn');
					finish(FORK_FRAMES);
					break;
				}
				put(0, (m) => {
					const par = spaceOf(m, parent.id)!;
					m.spaces.push({id: child, label: child, pid, shares: '', dim: false, at: S, ptes: par.ptes.map((p) => ({...p, at: S})), execAt: -1});
					recount(m);
					for (const c of m.frames) if (c.refs > 1) c.at = S;
				});
				put(FORK_FLAG, (m) => {
					for (const s of m.spaces) if (s.id === parent.id || s.id === child) for (const p of s.ptes) if (p.present && p.flags === 'rw') {
						p.flags = 'cow';
						p.at = S + FORK_FLAG;
					}
					invalidate(m, parent.id);
					m.flushAt = S + FORK_FLAG;
				});
				status(FORK_FLAG, noteOf(a, `fork: ${child} shares every frame, now copy-on-write`), 'warn');
				checkRows('mem.fork');
				finish(FORK_FRAMES);
				break;
			}
			case 'mem.exec': {
				const space = spaceOf(sim, proc)!;
				const image = sv(a.image, 'prog').slice(0, 6);
				const pages = Math.min(4, Math.max(1, Math.round(nv(a.pages, 2))));
				const baseVa = splitAddr(cfg, sv(a.va, '0x400000'));
				const parts = ['text', 'data', 'stack', 'heap'];
				const sid = space.id;
				const probe = clone(sim);
				releaseSpace(probe, sid, 0);
				const freeNow = probe.frames.filter((c) => c.state === 'empty').length;
				if (pages > freeNow) {
					bad(`mem.exec: ${pages} pages need ${pages} free frames, only ${freeNow} will be free`);
					finish(1);
					break;
				}
				put(0, (m) => {
					const sp2 = spaceOf(m, sid)!;
					const parentId = sp2.shares;
					if (parentId) {
						sp2.shares = '';
						const par = spaceOf(m, parentId);
						if (par) par.dim = false;
					}
					sp2.execAt = S;
					invalidate(m, sid);
					releaseSpace(m, sid, S);
				});
				status(0, 'execve: old memory dropped, the pid stays', 'warn');
				for (let i = 0; i < pages; i++) {
					const off = 14 + i * EXEC_PAGE;
					const f = sim.frames.findIndex((c) => c.state === 'empty');
					const vpnBig = big(baseVa.vpn) + BigInt(i);
					const vpn = vpnBig.toString(16).padStart(cfg.vpnDigits, '0');
					const label = `${image}.${parts[i]}`.slice(0, MAX_LABEL);
					put(off, (m) => {
						Object.assign(m.frames[f], {state: 'filled', label, at: S + off, from: -1, to: -1, copyFrom: -1});
						spaceOf(m, sid)!.ptes.push({vpn, frame: f, flags: i === 0 ? 'x' : 'rw', present: true, label, at: S + off});
						recount(m);
					});
				}
				status(14 + pages * EXEC_PAGE, noteOf(a, `${image} is loaded: ${pages} fresh page${pages > 1 ? 's' : ''}, same pid`), 'ok');
				checkRows('mem.exec');
				finish(14 + pages * EXEC_PAGE + 12);
				break;
			}
			case 'mem.flush': {
				const all = typeof a.proc !== 'string';
				const sid = keyOf(sim, proc);
				put(0, (m) => {
					if (all) m.tlb = m.tlb.map(() => null);
					else invalidate(m, sid);
					m.tlbNext = 0;
					m.flushAt = S;
				});
				status(0, noteOf(a, all ? 'TLB flushed: every entry is gone' : `TLB flushed for ${proc}`), 'warn');
				finish(FLUSH_FRAMES);
				break;
			}
		}
	}
	// every action that is still going when the next one starts was cut short above; sort and freeze
	muts.sort((x, y) => x.frame - y.frame);
	const plan: Plan = {cfg, base, muts, ops, issues};
	plans.set(events, plan);
	return plan;
};

// ------------------------------------------------------------------ state at a frame
export interface MemState extends M {
	visible: boolean;
	frame: number;
	cfg: Cfg;
}

export const memStateAt = (events: WorldEvent[], frame: number): MemState => {
	const plan = planMem(events);
	const m = clone(plan.base);
	for (const mu of plan.muts) {
		if (mu.frame > frame) break;
		mu.fn(m);
	}
	return {...m, visible: events.length > 0 && frame >= events[0].frame, frame, cfg: plan.cfg};
};

/** frame at which the latest action that started by `frame` ends (for the gate and the view) */
export const opEnd = (events: WorldEvent[], frame: number): number => {
	let end = 0;
	for (const o of planMem(events).ops) if (o.start <= frame) end = Math.max(end, o.end);
	return end;
};

// ------------------------------------------------------------------ layout (shared by the view, the QA gate and the tests)
export const PAD = 12;
export const TITLE_Y = 12;
export const TITLE_H = 28;
export const ADDR_Y = 44;
export const MID_Y = 188;
export const MID_BODY_Y = 214;
export const MID_BODY_H = 216;
export const FRAMES_Y = 438;
export const CELLS_Y = 462;
export const CELL_H = 46;
export const CELL_GAP = 6;
export const FOOT_GAP = 8;
export const CHIP_H = 30;
export const STATUS_H = 26;
export const LEFT_W = 330;
export const COL_GAP = 12;
export const CARD_H = 46;
export const CARD_GAP = 8;
export const ROW_H = 26;
export const TLB_ROW_H = 26;
export const FS_S = 16;
export const FS_M = 17;
export const FS_HEX = 24;
export const FS_CHIP = 18;
export const GAP_MAX = 8;
export const NEED_H = 690;

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
export interface Txt extends Box {
	text: string;
	fs: number;
}
export interface SliceBox extends Box {
	i: number;
	bits: Txt & {ls: number};
	name: Txt;
	val: Txt;
}
export interface CardL extends Box {
	level: number;
	text: Txt;
	ram: Txt | null;
	lit: boolean;
	litAt: number;
	entry: WalkEntry | null;
}
export interface RowL extends Box {
	segs: Txt[];
	ram: Txt | null;
	pte: Pte | null;
	space: string;
}
export interface SpaceL extends Box {
	id: string;
	index: number;
	head: Txt;
	rows: RowL[];
	dim: boolean;
}
export interface TlbL extends Box {
	i: number;
	row: TlbRow | null;
	segs: Txt[];
}
export interface CellL extends Box {
	i: number;
	cell: Cell;
	id: Txt;
	badge: Txt | null;
	label: Txt;
}
export interface ChipL extends Box {
	key: keyof M['c'];
	text: Txt;
}
export interface MemLayout {
	W: number;
	H: number;
	fsBits: number;
	title: Txt;
	titleRight: Txt;
	addr: {
		tag: Txt | null;
		hex: Txt | null;
		hexShown: number;
		bar: Box;
		slices: SliceBox[];
		brackets: Txt[];
		splitP: number;
		typedP: number;
		sp: Split | null;
	};
	midLeftHead: Txt;
	midLeftHeadRight: Txt | null;
	cards: CardL[];
	spaces: SpaceL[];
	tlbHead: Txt;
	tlbBadge: Txt | null;
	tlb: TlbL[];
	physLabel: Txt;
	physVal: Txt | null;
	framesHead: Txt;
	framesHeadRight: Txt;
	cells: CellL[];
	chips: ChipL[];
	status: Txt;
	issues: string[];
}

const T = (text: string, x: number, y: number, w: number, h: number, fs: number): Txt => ({text, x, y, w, h, fs});

export const memLayout = (s: MemState, rect: Rect): MemLayout => {
	const cfg = s.cfg;
	const W = rect.w;
	const issues: string[] = [];
	const inner = W - PAD * 2;
	const fits = (what: string, text: string, fs: number, w: number) => {
		if (text.length * colW(fs) > w + 1) issues.push(`${what} "${text}" is ${Math.round(text.length * colW(fs))} px at ${fs} px but its box is ${Math.round(w)} px`);
	};
	const addrSet = !!s.addr;
	const sp = s.addr ? splitAddr(cfg, s.addr.va) : null;
	const typedP = s.addr ? lin(s.frame, s.addr.at, ADDR_FRAMES) : 0;
	const splitP = s.addr && s.addr.splitAt >= 0 ? prog(s.frame, s.addr.splitAt, SPLIT_FRAMES) : 0;

	// title
	const chrome = getStyle().skin.term.chrome;
	const titleText = chrome === 'prompt' ? `[ ${cfg.title} ]` : cfg.title;
	const titleX = PAD + (chrome === 'dots' ? 62 : 0);
	const rightText = `${cfg.totalBits}-bit VA, ${pageSizeText(cfg)} pages`;
	const title = T(titleText, titleX, TITLE_Y, inner * 0.55, TITLE_H, FS_M);
	const titleRight = T(rightText, W - PAD - rightText.length * colW(FS_S), TITLE_Y + 2, rightText.length * colW(FS_S), TITLE_H - 4, FS_S);
	fits('title', titleText, FS_M, W - PAD - titleX - rightText.length * colW(FS_S) - 12);

	// address block
	const nSlices = cfg.levels + 1;
	const totalBits = cfg.totalBits;
	const bw = (inner - cfg.levels * GAP_MAX) / totalBits;
	const cw1 = colW(100) / 100;
	const fsBits = Math.max(16, Math.min(20, Math.floor(bw / cw1)));
	if (bw < 16 * cw1 - 0.01) issues.push(`address of ${totalBits} bits is too wide to show every bit at 16 px (${bw.toFixed(1)} px per bit)`);
	const barY = ADDR_Y + 56;
	const slices: SliceBox[] = [];
	let bitsBefore = 0;
	for (let i = 0; i < nSlices; i++) {
		const nb = sliceWidth(cfg, i);
		const x = PAD + bitsBefore * bw + i * GAP_MAX * splitP;
		const w = nb * bw;
		bitsBefore += nb;
		if (!sp) continue;
		const bitsT = sliceBits(cfg, sp, i);
		const cwb = colW(fsBits);
		const ls = bw - cwb;
		const name = sliceName(cfg, i);
		const val = sliceValue(cfg, sp, i);
		if (splitP > 0) {
			fits(`slice name`, name, FS_S, w + 6);
			fits(`slice value`, val, FS_M, w + 6);
		}
		slices.push({
			i,
			x,
			y: barY,
			w,
			h: 32,
			bits: {...T(bitsT, x + 1, barY, w, 32, fsBits), ls},
			name: T(name, x, barY - 22, w, 20, FS_S),
			val: T(val, x, barY + 34, w, 24, FS_M),
		});
	}
	const hexText = sp && s.addr ? hexVa(s.addr.va) : '';
	const hexW = hexText.length * colW(FS_HEX);
	const procSp = s.addr ? spaceOf(s, s.addr.proc) : undefined;
	const tagText = procSp ? `${s.addr!.op === 'write' ? 'write' : 'read'} by ${procSp.label}${procSp.pid ? ' pid ' + procSp.pid : ''}` : '';
	const tagW = tagText.length * colW(FS_S);
	if (tagText) fits('address tag', tagText, FS_S, inner - hexW - 16);
	const brackets: Txt[] = [];
	if (sp && splitP > 0) {
		const vpnBits = totalBits - cfg.pageBits;
		const offX = slices[nSlices - 1].x;
		const t1 = `${vpnBits}-bit page number`;
		const t2 = `${cfg.pageBits}-bit offset`;
		brackets.push(T(t1, PAD, barY + 62, offX - PAD - 8, 22, FS_S), T(t2, offX, barY + 62, W - PAD - offX, 22, FS_S));
		fits('bracket', t1, FS_S, offX - PAD - 8);
		fits('bracket', t2, FS_S, W - PAD - offX);
	}

	// middle: the walk (levels > 1) or the page table (levels === 1) on the left, the TLB on the right
	const leftX = PAD;
	const rightX = PAD + LEFT_W + COL_GAP;
	const rightW = inner - LEFT_W - COL_GAP;
	const walkMode = cfg.levels > 1;
	const curSpace = s.addr?.proc ?? s.cur;
	const cr3 = cr3Of(s, curSpace);
	const midLeftHead = T(walkMode ? 'page walk' : 'page tables', leftX, MID_Y, 140, 22, FS_S);
	const midLeftHeadRight = walkMode ? T(`CR3 ${cr3}`, leftX + LEFT_W - `CR3 ${cr3}`.length * colW(FS_S), MID_Y, `CR3 ${cr3}`.length * colW(FS_S), 22, FS_S) : null;
	const cards: CardL[] = [];
	const spaces: SpaceL[] = [];
	if (walkMode) {
		const wk = s.walk;
		for (let k = 0; k < cfg.levels; k++) {
			const y = MID_BODY_Y + k * (CARD_H + CARD_GAP);
			const litAt = wk && k < wk.stepAt.length ? wk.stepAt[k] : -1;
			const entry = wk && litAt >= 0 ? wk.entries[k] : null;
			const label = entry ? `${cfg.names[k]}[${entry.idx}] -> ${entry.target}` : cfg.names[k];
			const ramT = litAt >= 0 ? T('RAM', leftX + LEFT_W - 12 - 3 * colW(FS_S), y + 13, 3 * colW(FS_S), 20, FS_S) : null;
			const room = LEFT_W - 24 - (ramT ? 3 * colW(FS_S) + 10 : 0);
			fits(`level ${k} card`, label, FS_M, room);
			cards.push({x: leftX, y, w: LEFT_W, h: CARD_H, level: k, text: T(label, leftX + 12, y + 12, room, 22, FS_M), ram: ramT, lit: litAt >= 0, litAt, entry});
		}
	} else {
		const n = s.spaces.length;
		const cap = rowCap(cfg, n);
		let y = MID_BODY_Y;
		s.spaces.forEach((sc, index) => {
			const head = `${sc.label}${sc.pid ? '  pid ' + sc.pid : ''}${sc.shares ? '  uses ' + sc.shares + "'s tables" : ''}${sc.dim ? '  suspended' : ''}`;
			fits('space header', head, FS_S, LEFT_W - 20);
			const rows: RowL[] = [];
			const shown = sc.ptes.slice(0, cap);
			const vw = cfg.vpnDigits * colW(FS_M);
			const x1 = 10;
			const x2 = x1 + vw + 14;
			const x3 = x2 + 3 * colW(FS_M) + 14;
			const x4 = x3 + 3 * colW(FS_M) + 14;
			shown.forEach((p, ri) => {
				const ry = y + 22 + ri * ROW_H;
				const segs = [T(p.vpn, x1, ry + 3, vw, 22, FS_M), T(p.present ? `F${p.frame}` : '--', x2, ry + 3, 3 * colW(FS_M), 22, FS_M), T(p.present ? p.flags : 'not present', x3, ry + 3, (p.present ? 3 : 11) * colW(FS_M), 22, FS_M)];
				if (p.present && p.label) segs.push(T(p.label, x4, ry + 3, LEFT_W - x4 - 6, 22, FS_M));
				for (const sg of segs) {
					sg.x += leftX;
					fits('page-table row', sg.text, FS_M, sg.w + 2);
				}
				if (segs.length > 3 && segs[3].x + segs[3].text.length * colW(FS_M) > leftX + LEFT_W - 6) issues.push(`page-table row label "${p.label}" does not fit`);
				const wk = s.walk;
				const ram = wk && wk.vpn === p.vpn && wk.space === sc.id && wk.stepAt.length > 0 ? T('RAM', leftX + LEFT_W - 10 - 3 * colW(FS_S), ry + 3, 3 * colW(FS_S), 20, FS_S) : null;
				rows.push({x: leftX, y: ry, w: LEFT_W, h: ROW_H, segs, ram, pte: p, space: sc.id});
			});
			const h = 22 + Math.max(1, cap === 6 ? shown.length : cap) * ROW_H;
			spaces.push({x: leftX, y, w: LEFT_W, h, id: sc.id, index, head: T(head, leftX + 10, y + 1, LEFT_W - 20, 20, FS_S), rows, dim: sc.dim});
			y += h + 6;
		});
		if (y - 6 > MID_BODY_Y + MID_BODY_H + 1) issues.push(`page tables need ${Math.round(y - 6 - MID_BODY_Y)} px, the area has ${MID_BODY_H}`);
	}

	// TLB
	const tlbHead = T(`TLB (${cfg.nTlb} entries)`, rightX, MID_Y, rightW, 22, FS_S);
	const lk = s.lookup;
	const badgeText = lk && lk.result ? (lk.result === 'hit' ? 'HIT' : 'MISS') : '';
	const tlbBadge = badgeText ? T(badgeText, rightX + rightW - badgeText.length * colW(FS_S), MID_Y, badgeText.length * colW(FS_S), 22, FS_S) : null;
	const multi = s.spaces.length > 1;
	const tlb: TlbL[] = s.tlb.map((row, i) => {
		const y = MID_BODY_Y + i * TLB_ROW_H;
		const segs: Txt[] = [];
		const vw = cfg.vpnDigits * colW(FS_S);
		if (!row) segs.push(T('empty', rightX + 8, y + 3, 5 * colW(FS_S), 20, FS_S));
		else {
			let x = rightX + 8;
			if (multi) {
				const tag = (s.spaces.find((sc) => sc.id === row.space)?.label ?? row.space).slice(0, 1).toUpperCase();
				segs.push(T(tag, x, y + 3, colW(FS_S), 20, FS_S));
				x += colW(FS_S) + 8;
			}
			segs.push(T(row.vpn, x, y + 3, vw, 20, FS_S));
			x += vw + 10;
			segs.push(T(`F${row.frame}`, x, y + 3, 3 * colW(FS_S), 20, FS_S));
			x += 3 * colW(FS_S) + 10;
			segs.push(T(row.flags, x, y + 3, 3 * colW(FS_S), 20, FS_S));
			if (x + 3 * colW(FS_S) > rightX + rightW - 4) issues.push(`TLB row "${row.vpn} F${row.frame} ${row.flags}" is wider than the TLB column`);
		}
		return {x: rightX, y, w: rightW, h: TLB_ROW_H, i, row, segs};
	});
	const physY = MID_BODY_Y + cfg.nTlb * TLB_ROW_H + 8;
	const physLabel = T('physical address', rightX, physY, rightW, 20, FS_S);
	const physVal = s.phys ? T(s.phys.addr, rightX, physY + 22, rightW, 32, FS_HEX) : null;
	if (s.phys) fits('physical address', s.phys.addr, FS_HEX, rightW);
	if (physY + 56 > MID_BODY_Y + MID_BODY_H + 2) issues.push('TLB and physical address do not fit the middle area');

	// frames
	const used = s.frames.filter((c) => c.state !== 'empty').length;
	const framesHead = T('physical frames', PAD, FRAMES_Y, 200, 22, FS_S);
	const rt = `${used} of ${cfg.nFrames} in use`;
	const framesHeadRight = T(rt, W - PAD - rt.length * colW(FS_S), FRAMES_Y, rt.length * colW(FS_S), 22, FS_S);
	const cols = 4;
	const cw = (inner - (cols - 1) * CELL_GAP) / cols;
	const rowsN = Math.ceil(cfg.nFrames / cols);
	const cells: CellL[] = s.frames.map((cell, i) => {
		const x = PAD + (i % cols) * (cw + CELL_GAP);
		const y = CELLS_Y + Math.floor(i / cols) * (CELL_H + CELL_GAP);
		const shared = cell.refs > 1;
		const cowShared = shared && s.spaces.some((sc) => sc.ptes.some((p) => p.present && p.frame === i && p.flags === 'cow'));
		const badgeText = cell.state === 'empty' ? '' : cowShared ? `cow x${cell.refs}` : shared ? `x${cell.refs}` : '';
		const labelText = cell.state === 'empty' ? 'free' : cell.state === 'alloc' ? (cell.copyFrom >= 0 ? `copy F${cell.copyFrom}` : 'loading') : cell.label || 'page';
		fits(`frame F${i} label`, labelText, FS_M, cw - 14);
		const badge = badgeText ? T(badgeText, x + cw - 8 - badgeText.length * colW(FS_S), y + 4, badgeText.length * colW(FS_S), 20, FS_S) : null;
		return {x, y, w: cw, h: CELL_H, i, cell, id: T(`F${i}`, x + 8, y + 4, 4 * colW(FS_S), 20, FS_S), badge, label: T(labelText, x + 8, y + 23, cw - 14, 20, FS_M)};
	});
	const cellsEnd = CELLS_Y + rowsN * CELL_H + (rowsN - 1) * CELL_GAP;

	// footer
	const chipY = Math.max(cellsEnd + FOOT_GAP, rect.h - CHIP_H - 6 - STATUS_H - 12);
	const keys: (keyof M['c'])[] = ['hit', 'miss', 'fault', 'cow', 'ram'];
	const chipW = (inner - 4 * 6) / 5;
	const chips: ChipL[] = keys.map((key, i) => {
		const text = `${key} ${s.c[key]}`;
		fits('counter', text, FS_CHIP, chipW - 14);
		const x = PAD + i * (chipW + 6);
		return {x, y: chipY, w: chipW, h: CHIP_H, key, text: T(text, x + 8, chipY + 4, chipW - 14, 22, FS_CHIP)};
	});
	const statusY = chipY + CHIP_H + 6;
	fits('status line', s.status.text, FS_S, inner - 8);
	const status = T(s.status.text, PAD + 4, statusY + 2, inner - 8, 22, FS_S);
	if (statusY + STATUS_H > rect.h - 4) issues.push(`the world needs ${Math.round(statusY + STATUS_H + 4)} px of height, the slot has ${Math.round(rect.h)}`);
	if (rect.h < NEED_H - 40) issues.push(`slot ${Math.round(rect.w)}x${Math.round(rect.h)} is too small for the memory view`);

	return {
		W,
		H: rect.h,
		fsBits,
		title,
		titleRight,
		addr: {tag: tagText ? T(tagText, W - PAD - tagW, ADDR_Y + 6, tagW, 22, FS_S) : null, hex: addrSet && hexText ? T(hexText, PAD, ADDR_Y, hexW, 32, FS_HEX) : null, hexShown: Math.ceil(hexText.length * typedP), bar: {x: PAD, y: barY, w: inner, h: 32}, slices, brackets, splitP, typedP, sp},
		midLeftHead,
		midLeftHeadRight,
		cards,
		spaces,
		tlbHead,
		tlbBadge,
		tlb,
		physLabel,
		physVal,
		framesHead,
		framesHeadRight,
		cells,
		chips,
		status,
		issues,
	};
};

/** Everything a viewer can read at this state (the gate looks for each string in the rendered frame). */
export const memTexts = (s: MemState, rect: Rect): string[] => {
	if (!s.visible) return [];
	const l = memLayout(s, rect);
	const out: string[] = [l.title.text, l.titleRight.text, l.midLeftHead.text, l.tlbHead.text, l.physLabel.text, l.framesHead.text, l.framesHeadRight.text];
	if (l.midLeftHeadRight) out.push(l.midLeftHeadRight.text);
	if (l.addr.tag) out.push(l.addr.tag.text);
	if (l.addr.hex && l.addr.hexShown >= l.addr.hex.text.length) out.push(l.addr.hex.text);
	for (const sl of l.addr.slices) {
		out.push(sl.bits.text);
		if (l.addr.splitP > 0.6) out.push(sl.name.text, sl.val.text);
	}
	if (l.addr.splitP > 0.6) for (const b of l.addr.brackets) out.push(b.text);
	for (const c of l.cards) {
		out.push(c.text.text);
		if (c.ram) out.push(c.ram.text);
	}
	for (const sp of l.spaces) {
		out.push(sp.head.text);
		for (const r of sp.rows) {
			for (const sg of r.segs) out.push(sg.text);
			if (r.ram) out.push(r.ram.text);
		}
	}
	if (l.tlbBadge) out.push(l.tlbBadge.text);
	for (const r of l.tlb) for (const sg of r.segs) out.push(sg.text);
	if (l.physVal) out.push(l.physVal.text);
	for (const c of l.cells) {
		out.push(c.id.text, c.label.text);
		if (c.badge) out.push(c.badge.text);
	}
	for (const c of l.chips) out.push(c.text.text);
	if (l.status.text) out.push(l.status.text);
	return out.filter(Boolean);
};

export const memProblems = (s: MemState, rect: Rect): string[] => {
	if (!s.visible) return [];
	const l = memLayout(s, rect);
	const out = [...l.issues];
	if (l.fsBits < 16) out.push(`address bits at ${l.fsBits} px < 16 px`);
	return [...new Set(out)];
};

// ------------------------------------------------------------------ validation, tokens, rows, settle
const HEX = /^0x[0-9a-fA-F]{1,16}$/;
const checkNote = (p: Props, what: string, errs: string[]) => {
	if (p.note !== undefined && (typeof p.note !== 'string' || p.note.length > MAX_NOTE)) errs.push(`${what}: "note" must be a string of at most ${MAX_NOTE} characters`);
};
const optStr = (p: Props, key: string, what: string, errs: string[], max: number) => {
	if (p[key] !== undefined && (typeof p[key] !== 'string' || !(p[key] as string).trim() || (p[key] as string).length > max)) errs.push(`${what}: "${key}" must be a short string (max ${max} characters)`);
};
const needVa = (p: Props, what: string, errs: string[], key = 'va') => {
	if (typeof p[key] !== 'string' || !HEX.test(p[key] as string)) errs.push(`${what} needs "${key}": "0x..." (hex, up to 16 digits)`);
};

export const validateMem = (a: Action): string[] => {
	const p = a as Props;
	const what = String(a.do);
	const errs: string[] = [];
	checkNote(p, what, errs);
	switch (a.do) {
		case 'world.set': {
			errs.push(...optNumber(p, 'levels', 'world.set memgrid', 1, 4, true));
			errs.push(...optNumber(p, 'page_bits', 'world.set memgrid', 10, 21, true));
			errs.push(...optNumber(p, 'frames', 'world.set memgrid', 4, 12, true));
			errs.push(...optNumber(p, 'tlb', 'world.set memgrid', 2, 5, true));
			optStr(p, 'title', 'world.set memgrid', errs, 36);
			optStr(p, 'proc', 'world.set memgrid', errs, MAX_LABEL);
			if (p.pid !== undefined && !(typeof p.pid === 'string' || typeof p.pid === 'number')) errs.push('world.set memgrid: "pid" must be a string or number');
			const levels = typeof p.levels === 'number' ? p.levels : 1;
			if (p.bits !== undefined) {
				if (!Array.isArray(p.bits) || p.bits.length !== levels || !p.bits.every((b) => Number.isInteger(b) && b >= 1 && b <= 13)) errs.push(`world.set memgrid: "bits" must list ${levels} integers (1..13), one per level`);
				else if (p.bits.reduce((x: number, y: number) => x + y, 0) + (typeof p.page_bits === 'number' ? p.page_bits : 12) > 52) errs.push('world.set memgrid: more than 52 address bits cannot be drawn at a readable size');
			}
			if (p.names !== undefined && (!Array.isArray(p.names) || p.names.length !== levels || !p.names.every((n) => typeof n === 'string' && n.length >= 1 && n.length <= 6))) errs.push(`world.set memgrid: "names" must list ${levels} short names (max 6 characters)`);
			break;
		}
		case 'mem.addr':
			needVa(p, what, errs);
			optStr(p, 'proc', what, errs, MAX_LABEL);
			if (p.op !== undefined && p.op !== 'read' && p.op !== 'write') errs.push(`${what}: "op" must be "read" or "write"`);
			break;
		case 'mem.lookup':
			if (p.expect !== undefined && p.expect !== 'hit' && p.expect !== 'miss') errs.push(`${what}: "expect" must be "hit" or "miss"`);
			break;
		case 'mem.walk':
			errs.push(...optNumber(p, 'step_ms', what, 200, 2000));
			if (p.fill !== undefined && typeof p.fill !== 'boolean') errs.push(`${what}: "fill" must be true or false`);
			break;
		case 'mem.fault':
			errs.push(...optNumber(p, 'frame', what, 0, 11, true));
			optStr(p, 'label', what, errs, MAX_LABEL);
			if (p.src !== undefined && !(SRCS as readonly unknown[]).includes(p.src)) errs.push(`${what}: "src" must be one of ${SRCS.join(', ')}`);
			if (p.flags !== undefined && !(FLAGS as readonly unknown[]).includes(p.flags)) errs.push(`${what}: "flags" must be one of ${FLAGS.join(', ')}`);
			break;
		case 'mem.cow':
			if (p.va !== undefined) needVa(p, what, errs);
			optStr(p, 'proc', what, errs, MAX_LABEL);
			break;
		case 'mem.map':
			needVa(p, what, errs);
			if (typeof p.frame !== 'number') errs.push(`${what} needs "frame": <frame number>`);
			else errs.push(...optNumber(p, 'frame', what, 0, 11, true));
			optStr(p, 'label', what, errs, MAX_LABEL);
			optStr(p, 'proc', what, errs, MAX_LABEL);
			if (p.flags !== undefined && !(FLAGS as readonly unknown[]).includes(p.flags)) errs.push(`${what}: "flags" must be one of ${FLAGS.join(', ')}`);
			break;
		case 'mem.fork':
		case 'mem.vfork':
			errs.push(...needString(p, 'child', what, MAX_LABEL));
			if (p.pid !== undefined && !(typeof p.pid === 'string' || typeof p.pid === 'number')) errs.push(`${what}: "pid" must be a string or number`);
			break;
		case 'mem.exec':
			errs.push(...needString(p, 'image', what, 6));
			errs.push(...optNumber(p, 'pages', what, 1, 4, true));
			optStr(p, 'proc', what, errs, MAX_LABEL);
			if (p.va !== undefined) needVa(p, what, errs);
			break;
		case 'mem.flush':
			optStr(p, 'proc', what, errs, MAX_LABEL);
			break;
	}
	return errs;
};

export const memTimelineProblems = (events: WorldEvent[]): string[] => planMem(events).issues;

/** Duration of an action in frames (its animation), without the context of earlier actions. */
export const memDuration = (a: Action): number => {
	const p = a as Props;
	switch (a.do) {
		case 'mem.addr':
			return ADDR_FRAMES;
		case 'mem.split':
			return SPLIT_FRAMES + 8;
		case 'mem.lookup':
			return LOOKUP_FRAMES;
		case 'mem.walk': {
			const step = Math.max(MIN_STEP_FRAMES, msToFrames(nv(p.step_ms, DEFAULT_STEP_MS)));
			return WALK_LEAD + 4 * step + 4 + WALK_TAIL + (p.fill === true ? 6 + FILL_FRAMES : 0);
		}
		case 'mem.tlbfill':
			return FILL_FRAMES;
		case 'mem.fault':
			return FAULT_FRAMES;
		case 'mem.cow':
			return COW_FRAMES;
		case 'mem.map':
			return MAP_FRAMES;
		case 'mem.fork':
		case 'mem.vfork':
			return FORK_FRAMES;
		case 'mem.exec':
			return 14 + Math.round(nv(p.pages, 2)) * EXEC_PAGE + 12;
		case 'mem.flush':
			return FLUSH_FRAMES;
	}
	return 1;
};

/** Text an action puts on screen that does not depend on the machine: only the status note. */
export const memTokens = (a: Action): WorldText[] => {
	const p = a as Props;
	const out: WorldText[] = [];
	if (typeof p.note === 'string' && p.note.trim()) {
		// the note is the last status line of the action
		const off = a.do === 'mem.lookup' ? LOOKUP_RESULT : a.do === 'mem.fault' ? FAULT_PTE : a.do === 'mem.cow' ? COW_PTE : a.do === 'mem.fork' ? FORK_FLAG : a.do === 'mem.walk' ? Math.max(0, memDuration(a) - WALK_TAIL - (p.fill === true ? 6 + FILL_FRAMES : 0)) : a.do === 'mem.exec' ? Math.max(0, memDuration(a) - 12) : 0;
		out.push({text: p.note, off});
	}
	return out;
};

export const memRows = (a: Action): number => {
	switch (a.do) {
		case 'mem.walk':
		case 'mem.fault':
		case 'mem.cow':
			return 5;
		case 'mem.split':
		case 'mem.lookup':
		case 'mem.fork':
		case 'mem.vfork':
		case 'mem.exec':
			return 3;
		case 'world.set':
			return 0;
	}
	return 1;
};

export const memSettle = (a: Action): number => (a.do === 'world.set' ? 2 : memDuration(a) + 2);
