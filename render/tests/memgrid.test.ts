import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import './helpers';
import type {Action} from '../src/schema';
import {contrast, getStyle, setActiveStyle, STYLES} from '../src/styles';
import type {WorldEvent} from '../src/worlds';
import {memgrid} from '../src/worlds/memgrid';
import {
	COW_FRAMES,
	COW_PTE,
	FAULT_ALLOC,
	FAULT_FILLED,
	FAULT_PTE,
	LOOKUP_RESULT,
	MAX_NOTE,
	WALK_LEAD,
	cfgOf,
	memDuration,
	memLayout,
	memProblems,
	memStateAt,
	memTexts,
	memTokens,
	planMem,
	splitAddr,
	validateMem,
} from '../src/worlds/memgrid/model';
import {MemgridView, memColorPairs, memColors} from '../src/worlds/memgrid/View';
import {CONTENT} from '../src/theme';

const A = (a: Record<string, unknown>) => a as unknown as Action;
const ev = (frame: number, a: Record<string, unknown>, beat = 0): WorldEvent => ({frame, beat, action: A(a)});
const SET4 = ev(0, {do: 'world.set', world: 'memgrid', levels: 4, proc: 'app', pid: '4242', frames: 12, tlb: 4});
const SET1 = ev(0, {do: 'world.set', world: 'memgrid', proc: 'parent', pid: '100', frames: 8});
const HEAP = '0x00007f3a5c2e1a48';
const NEXT = '0x00007f3a5c2e2010';
const maps = (frame = 1) => [
	ev(frame, {do: 'mem.map', va: '0x0000555d1a2b4000', frame: 0, flags: 'x', label: 'code'}),
	ev(frame, {do: 'mem.map', va: '0x00007f3a5c2e1000', frame: 3, flags: 'rw', label: 'heap'}),
];
const RECT = CONTENT;
const STEP = 18;
const WALK_DONE = WALK_LEAD + 4 * STEP + 4;

/** the walk of the heap page, then a TLB fill, then a second lookup */
const session = () => [
	SET4,
	...maps(),
	ev(10, {do: 'mem.addr', va: HEAP}),
	ev(40, {do: 'mem.split'}),
	ev(90, {do: 'mem.lookup', expect: 'miss'}),
	ev(140, {do: 'mem.walk'}),
	ev(280, {do: 'mem.tlbfill'}),
	ev(320, {do: 'mem.addr', va: '0x00007f3a5c2e1f10'}),
	ev(350, {do: 'mem.lookup', expect: 'hit'}),
];

describe('memgrid validation', () => {
	it('accepts well-formed actions', () => {
		expect(validateMem(A({do: 'world.set', world: 'memgrid', levels: 4, bits: [9, 9, 9, 9], names: ['PML4', 'PDPT', 'PD', 'PT'], frames: 12, tlb: 4, proc: 'app', pid: 4242}))).toEqual([]);
		expect(validateMem(A({do: 'mem.addr', va: HEAP, op: 'write', proc: 'child'}))).toEqual([]);
		expect(validateMem(A({do: 'mem.lookup', expect: 'miss'}))).toEqual([]);
		expect(validateMem(A({do: 'mem.walk', step_ms: 400, fill: true, note: 'walk done'}))).toEqual([]);
		expect(validateMem(A({do: 'mem.fault', frame: 2, src: 'zero', label: 'heap', flags: 'rw'}))).toEqual([]);
		expect(validateMem(A({do: 'mem.map', va: '0x1000', frame: 1}))).toEqual([]);
		expect(validateMem(A({do: 'mem.fork', child: 'child', pid: 4243}))).toEqual([]);
		expect(validateMem(A({do: 'mem.exec', image: 'ls', pages: 2}))).toEqual([]);
		for (const k of ['mem.split', 'mem.tlbfill', 'mem.cow', 'mem.flush']) expect(validateMem(A({do: k}))).toEqual([]);
	});
	it('rejects missing or malformed fields', () => {
		expect(validateMem(A({do: 'mem.addr'})).join()).toMatch(/needs "va"/);
		expect(validateMem(A({do: 'mem.addr', va: '7f3a'})).join()).toMatch(/needs "va"/);
		expect(validateMem(A({do: 'mem.addr', va: HEAP, op: 'jump'})).join()).toMatch(/"op"/);
		expect(validateMem(A({do: 'mem.lookup', expect: 'maybe'})).join()).toMatch(/expect/);
		expect(validateMem(A({do: 'mem.map', va: '0x1000'})).join()).toMatch(/needs "frame"/);
		expect(validateMem(A({do: 'mem.map', va: '0x1000', frame: 40})).join()).toMatch(/frame/);
		expect(validateMem(A({do: 'mem.fault', src: 'tape'})).join()).toMatch(/src/);
		expect(validateMem(A({do: 'mem.fork'})).join()).toMatch(/needs "child"/);
		expect(validateMem(A({do: 'mem.exec'})).join()).toMatch(/needs "image"/);
		expect(validateMem(A({do: 'mem.walk', step_ms: 5})).join()).toMatch(/step_ms/);
		expect(validateMem(A({do: 'mem.walk', note: 'x'.repeat(MAX_NOTE + 1)})).join()).toMatch(/note/);
		expect(validateMem(A({do: 'world.set', world: 'memgrid', levels: 5})).join()).toMatch(/levels/);
		expect(validateMem(A({do: 'world.set', world: 'memgrid', levels: 2, bits: [9]})).join()).toMatch(/bits/);
		expect(validateMem(A({do: 'world.set', world: 'memgrid', levels: 4, bits: [13, 13, 13, 13]})).join()).toMatch(/52/);
		expect(validateMem(A({do: 'world.set', world: 'memgrid', levels: 2, names: ['a']})).join()).toMatch(/names/);
	});
});

describe('memgrid addresses', () => {
	const cfg = cfgOf([SET4]);
	it('splits an x86-64 address into 9+9+9+9 index bits and a 12-bit offset', () => {
		expect(cfg.totalBits).toBe(48);
		const sp = splitAddr(cfg, HEAP);
		expect(sp.slices).toEqual([254, 233, 225, 225]);
		expect(sp.offset).toBe(0xa48);
		expect(sp.vpn).toBe('7f3a5c2e1');
		expect(sp.va).toBe('00007f3a5c2e1a48');
	});
	it('sign-extends a high-half address like the CPU shows it', () => {
		expect(splitAddr(cfg, '0x800000000000').va).toBe('ffff800000000000');
		expect(splitAddr(cfg, '0x7fffffffffff').va).toBe('00007fffffffffff');
	});
	it('defaults per level count and a flat table', () => {
		expect(cfgOf([SET1]).levels).toBe(1);
		expect(cfgOf([SET1]).bits).toEqual([20]);
		expect(cfgOf([SET1]).vpnDigits).toBe(5);
		expect(cfgOf([ev(0, {do: 'world.set', world: 'memgrid', levels: 2})]).bits).toEqual([10, 10]);
		expect(cfgOf([SET1]).nFrames).toBe(8);
	});
});

describe('memgrid state', () => {
	const evs = session();
	it('types the address in, then splits it with a growing gap', () => {
		expect(memStateAt(evs, 5).addr).toBeNull();
		const mid = memLayout(memStateAt(evs, 10 + 9), RECT);
		expect(mid.addr.typedP).toBeCloseTo(0.5, 1);
		expect(mid.addr.hexShown).toBeLessThan(18);
		expect(memLayout(memStateAt(evs, 40), RECT).addr.splitP).toBe(0);
		const half = memLayout(memStateAt(evs, 40 + 8), RECT).addr;
		expect(half.splitP).toBeGreaterThan(0);
		expect(half.splitP).toBeLessThan(1);
		const full = memLayout(memStateAt(evs, 40 + 40), RECT).addr;
		expect(full.splitP).toBe(1);
		expect(full.slices.map((s) => s.val.text)).toEqual(['254', '233', '225', '225', '0xa48']);
		expect(full.slices.map((s) => s.bits.text.length)).toEqual([9, 9, 9, 9, 12]);
		expect(full.slices[1].x - (full.slices[0].x + full.slices[0].w)).toBeGreaterThan(7);
	});
	it('a lookup with an empty TLB misses at LOOKUP_RESULT and counts it', () => {
		expect(memStateAt(evs, 90 + LOOKUP_RESULT - 1).lookup?.result).toBeNull();
		expect(memStateAt(evs, 90 + LOOKUP_RESULT - 1).c.miss).toBe(0);
		const s = memStateAt(evs, 90 + LOOKUP_RESULT);
		expect(s.lookup?.result).toBe('miss');
		expect(s.c.miss).toBe(1);
		expect(s.status.tone).toBe('bad');
		expect(s.phys).toBeNull();
	});
	it('a walk reads one table per level, one RAM read each, and ends at the frame', () => {
		const at = (k: number) => 140 + WALK_LEAD + k * STEP;
		expect(memStateAt(evs, at(0) - 1).c.ram).toBe(0);
		for (let k = 0; k < 4; k++) {
			const s = memStateAt(evs, at(k));
			expect(s.walk?.stepAt).toHaveLength(k + 1);
			expect(s.c.ram).toBe(k + 1);
		}
		const done = memStateAt(evs, 140 + WALK_DONE);
		expect(done.walk?.failAt).toBe(-1);
		expect(done.walk?.entries.map((e) => e.idx)).toEqual([254, 233, 225, 225]);
		expect(done.walk?.entries[3].target).toBe('F3 rw');
		expect(done.phys).toMatchObject({frame: 3, addr: '0x3a48', via: 'walk'});
		expect(done.frames[3].hot).toBe(140 + WALK_DONE);
		// intermediate entries are table addresses, stable for the same address
		expect(done.walk?.entries[0].target).toMatch(/^0x[0-9a-f]+000$/);
		expect(memStateAt(evs, 300).walk?.entries[0].target).toBe(done.walk?.entries[0].target);
	});
	it('tlbfill caches the translation, and the next lookup of the same page hits without a walk', () => {
		const filled = memStateAt(evs, 281);
		expect(filled.tlb[0]).toMatchObject({vpn: '7f3a5c2e1', frame: 3, flags: 'rw'});
		const before = memStateAt(evs, 350 + LOOKUP_RESULT - 1);
		expect(before.c.hit).toBe(0);
		const hit = memStateAt(evs, 350 + LOOKUP_RESULT);
		expect(hit.lookup).toMatchObject({result: 'hit', slot: 0});
		expect(hit.c).toMatchObject({hit: 1, miss: 1, ram: 4});
		expect(hit.phys?.addr).toBe('0x3f10');
		expect(hit.phys?.via).toBe('tlb');
		expect(hit.walk).toBeNull();
		expect(planMem(evs).issues).toEqual([]);
	});
	it('the TLB evicts the oldest entry when it is full', () => {
		const evs2 = [SET4, ...Array.from({length: 5}, (_, i) => ev(1, {do: 'mem.map', va: `0x${(0x7000 + i).toString(16)}000`, frame: i})), ...[0, 1, 2, 3, 4].flatMap((i) => [ev(10 + i * 30, {do: 'mem.addr', va: `0x${(0x7000 + i).toString(16)}000`}), ev(12 + i * 30, {do: 'mem.tlbfill'})])];
		const s = memStateAt(evs2, 200);
		expect(s.tlb.map((r) => r?.frame)).toEqual([4, 1, 2, 3]);
	});
	it('a walk on an unmapped page stops at the first missing entry', () => {
		const evs3 = [SET4, ...maps(), ev(10, {do: 'mem.addr', va: '0x00006000deadb000'}), ev(30, {do: 'mem.walk'})];
		const s = memStateAt(evs3, 200);
		expect(s.walk?.failAt).toBe(0);
		expect(s.walk?.stepAt).toHaveLength(1);
		expect(s.c.ram).toBe(1);
		expect(s.phys).toBeNull();
		expect(s.status.text).toMatch(/PML4 entry not present/);
	});
	it('is deterministic and never shows the future', () => {
		const more = [...evs, ev(900, {do: 'mem.flush'})];
		for (const f of [0, 12, 60, 100, 160, 300, 340, 600]) {
			expect(memStateAt(more, f)).toEqual(memStateAt(evs, f));
			expect(memStateAt(more, f)).toEqual(memStateAt(more.map((e) => ({...e})), f));
		}
		expect(memStateAt(more, 950).tlb.every((r) => r === null)).toBe(true);
		// replaying an earlier frame after a later one gives the same answer (no state shared between calls)
		const late = memStateAt(evs, 300);
		expect(memStateAt(evs, 150)).toEqual(memStateAt(evs, 150));
		expect(late.walk?.entries[3].target).toBe('F3 rw');
		expect(memStateAt(evs, 100).walk).toBeNull();
	});
});

describe('memgrid page fault', () => {
	const evs = [SET4, ...maps(), ev(10, {do: 'mem.addr', va: HEAP}), ev(60, {do: 'mem.addr', va: NEXT, op: 'write'}), ev(100, {do: 'mem.fault', src: 'zero', label: 'heap', flags: 'rw'})];
	it('takes a free frame from empty to allocated to filled, then the entry turns present', () => {
		expect(memStateAt(evs, 99).frames[1].state).toBe('empty');
		const raised = memStateAt(evs, 100);
		expect(raised.c.fault).toBe(1);
		expect(raised.fault?.cr2).toBe('0x00007f3a5c2e2010');
		expect(raised.frames[1].state).toBe('empty');
		expect(memStateAt(evs, 100 + FAULT_ALLOC).frames[1]).toMatchObject({state: 'alloc', label: 'heap', from: 100 + FAULT_ALLOC, to: 100 + FAULT_FILLED});
		expect(memStateAt(evs, 100 + FAULT_FILLED - 1).frames[1].state).toBe('alloc');
		expect(memStateAt(evs, 100 + FAULT_FILLED).frames[1].state).toBe('filled');
		const pteBefore = memStateAt(evs, 100 + FAULT_PTE - 1).spaces[0].ptes.find((p) => p.vpn === '7f3a5c2e2');
		expect(pteBefore?.present).toBe(false);
		const done = memStateAt(evs, 100 + FAULT_PTE);
		expect(done.spaces[0].ptes.find((p) => p.vpn === '7f3a5c2e2')).toMatchObject({present: true, frame: 1, flags: 'rw'});
		expect(done.frames[1].owners).toEqual(['app']);
		expect(done.status.text).toBe('zero page filled into F1, entry now present');
		expect(planMem(evs).issues).toEqual([]);
	});
	it('a walk after the fault reaches the new frame', () => {
		const more = [...evs, ev(200, {do: 'mem.walk', fill: true})];
		const s = memStateAt(more, 400);
		expect(s.walk?.failAt).toBe(-1);
		expect(s.phys?.frame).toBe(1);
		expect(s.tlb.some((r) => r?.frame === 1)).toBe(true);
		expect(planMem(more).issues).toEqual([]);
	});
	it('refuses a fault on a mapped page or with no free frame', () => {
		expect(planMem([SET4, ...maps(), ev(10, {do: 'mem.addr', va: HEAP}), ev(20, {do: 'mem.fault'})]).issues.join()).toMatch(/already present/);
		const full = [ev(0, {do: 'world.set', world: 'memgrid', levels: 4, frames: 4}), ...[0, 1, 2, 3].map((i) => ev(1, {do: 'mem.map', va: `0x${i + 1}000`, frame: i})), ev(5, {do: 'mem.addr', va: '0x9000'}), ev(10, {do: 'mem.fault'})];
		expect(planMem(full).issues.join()).toMatch(/no free frame/);
	});
});

describe('memgrid copy-on-write', () => {
	const evs = [
		SET1,
		ev(1, {do: 'mem.map', va: '0x7f000000', frame: 0, flags: 'x', label: 'code'}),
		ev(1, {do: 'mem.map', va: '0x7f001000', frame: 3, flags: 'rw', label: 'heap'}),
		ev(10, {do: 'mem.addr', va: '0x7f001a48'}),
		ev(20, {do: 'mem.lookup'}),
		ev(40, {do: 'mem.tlbfill'}),
		ev(80, {do: 'mem.fork', child: 'child', pid: '101'}),
		ev(140, {do: 'mem.addr', proc: 'child', va: '0x7f001a48', op: 'write'}),
		ev(180, {do: 'mem.cow'}),
	];
	it('fork shares every frame as read-only copy-on-write and flushes the parent TLB', () => {
		const before = memStateAt(evs, 80);
		expect(before.spaces).toHaveLength(2);
		expect(before.frames[3].refs).toBe(2);
		expect(before.spaces[0].ptes.find((p) => p.frame === 3)?.flags).toBe('rw');
		const after = memStateAt(evs, 100);
		expect(after.spaces[0].ptes.find((p) => p.frame === 3)?.flags).toBe('cow');
		expect(after.spaces[1].ptes.find((p) => p.frame === 3)?.flags).toBe('cow');
		expect(after.spaces[1].ptes.find((p) => p.frame === 0)?.flags).toBe('x');
		expect(after.frames[3].owners.sort()).toEqual(['child', 'parent']);
		expect(after.tlb.every((r) => r === null)).toBe(true);
		const lay = memLayout(after, RECT);
		expect(lay.cells[3].badge?.text).toBe('cow x2');
		expect(lay.cells[0].badge?.text).toBe('x2');
		expect(planMem(evs).issues).toEqual([]);
	});
	it('a write splits the shared frame: a new frame is allocated, filled, and the entry repointed', () => {
		expect(memStateAt(evs, 180).c.fault).toBe(1);
		expect(memStateAt(evs, 179).c.fault).toBe(0);
		const mid = memStateAt(evs, 180 + 20);
		expect(mid.frames[1]).toMatchObject({state: 'alloc', copyFrom: 3});
		expect(mid.frames[3].refs).toBe(2);
		const done = memStateAt(evs, 180 + COW_PTE);
		expect(done.frames[1].state).toBe('filled');
		expect(done.frames[1].owners).toEqual(['child']);
		expect(done.frames[3].owners).toEqual(['parent']);
		expect(done.frames[3].refs).toBe(1);
		expect(done.spaces[1].ptes.find((p) => p.vpn === '7f001')).toMatchObject({frame: 1, flags: 'rw'});
		expect(done.spaces[0].ptes.find((p) => p.vpn === '7f001')).toMatchObject({frame: 3, flags: 'cow'});
		expect(done.c.cow).toBe(1);
		expect(memLayout(done, RECT).cells[3].badge).toBeNull();
		expect(180 + COW_PTE).toBeLessThan(180 + COW_FRAMES);
	});
	it('the last owner of a shared frame just gets it back writable, with no copy', () => {
		const more = [...evs, ev(300, {do: 'mem.addr', proc: 'parent', va: '0x7f001a48', op: 'write'}), ev(320, {do: 'mem.cow'})];
		const s = memStateAt(more, 400);
		expect(s.spaces[0].ptes.find((p) => p.vpn === '7f001')).toMatchObject({frame: 3, flags: 'rw'});
		expect(s.frames.filter((c) => c.state !== 'empty')).toHaveLength(3);
		expect(s.status.text).toMatch(/one owner left/);
		expect(planMem(more).issues).toEqual([]);
	});
	it('refuses a copy-on-write fault on a writable page', () => {
		expect(planMem([SET1, ...maps(), ev(5, {do: 'mem.addr', va: '0x00007f3a5c2e1a48'}), ev(20, {do: 'mem.cow'})]).issues.join()).toMatch(/not mapped|writable already/);
	});
});

describe('memgrid fork, vfork, exec, flush', () => {
	const base = [SET1, ev(1, {do: 'mem.map', va: '0x1000', frame: 0, label: 'code'}), ev(1, {do: 'mem.map', va: '0x2000', frame: 1, label: 'heap'}), ev(5, {do: 'mem.addr', va: '0x2010'})];
	it('exec drops the old mappings, frees frames nobody maps and keeps the pid', () => {
		const evs = [...base, ev(20, {do: 'mem.fork', child: 'child', pid: '101'}), ev(80, {do: 'mem.exec', proc: 'child', image: 'ls', pages: 2})];
		const s = memStateAt(evs, 200);
		const child = s.spaces[1];
		expect(child.pid).toBe('101');
		expect(child.ptes.map((p) => p.label)).toEqual(['ls.text', 'ls.data']);
		expect(child.ptes[0].flags).toBe('x');
		// the parent keeps its frames, the child's two new pages are separate
		expect(s.spaces[0].ptes).toHaveLength(2);
		expect(s.frames[0].owners).toEqual(['parent']);
		expect(s.frames.filter((c) => c.state === 'filled')).toHaveLength(4);
		expect(planMem(evs).issues).toEqual([]);
	});
	it('vfork suspends the parent and the child uses the parent tables until exec', () => {
		const evs = [...base, ev(20, {do: 'mem.vfork', child: 'child'}), ev(60, {do: 'mem.addr', proc: 'child', va: '0x2010'}), ev(80, {do: 'mem.lookup'}), ev(120, {do: 'mem.exec', proc: 'child', image: 'sh', pages: 1})];
		const s1 = memStateAt(evs, 100);
		expect(s1.spaces[0].dim).toBe(true);
		expect(s1.spaces[1].shares).toBe('parent');
		expect(s1.spaces[1].ptes).toHaveLength(0);
		const s2 = memStateAt(evs, 220);
		expect(s2.spaces[0].dim).toBe(false);
		expect(s2.spaces[1].shares).toBe('');
		expect(s2.spaces[1].ptes).toHaveLength(1);
		expect(s2.frames[0].owners).toEqual(['parent']);
	});
	it('flush empties the TLB (all, or one process)', () => {
		const evs = [...base, ev(20, {do: 'mem.tlbfill'}), ev(60, {do: 'mem.flush'})];
		expect(memStateAt(evs, 59).tlb.filter(Boolean)).toHaveLength(1);
		expect(memStateAt(evs, 60).tlb.filter(Boolean)).toHaveLength(0);
	});
});

describe('memgrid timeline problems', () => {
	it('reports an expectation the machine contradicts, and actions with nothing to act on', () => {
		const wrong = [SET4, ...maps(), ev(10, {do: 'mem.addr', va: HEAP}), ev(40, {do: 'mem.lookup', expect: 'hit'})];
		expect(planMem(wrong).issues.join()).toMatch(/expects a TLB hit/);
		expect(planMem([SET4, ev(5, {do: 'mem.split'})]).issues.join()).toMatch(/before mem\.addr/);
		expect(planMem([SET4, ev(5, {do: 'mem.walk'})]).issues.join()).toMatch(/before mem\.addr/);
		expect(planMem([SET4, ev(5, {do: 'mem.map', va: '0x1000', frame: 99})]).issues.join()).toMatch(/outside the 12 frames/);
		expect(planMem([SET4, ev(5, {do: 'mem.addr', va: '0x1000', proc: 'ghost'})]).issues.join()).toMatch(/no process "ghost"/);
		expect(planMem([SET4, ev(5, {do: 'mem.fork', child: 'app'})]).issues.join()).toMatch(/exists already/);
	});
	it('reports an action started over one that is still animating, and the rest happens at once', () => {
		const evs = [SET4, ...maps(), ev(10, {do: 'mem.addr', va: HEAP}), ev(30, {do: 'mem.walk'}), ev(60, {do: 'mem.tlbfill'}, 2)];
		expect(planMem(evs).issues.join()).toMatch(/mem\.tlbfill starts while mem\.walk is still animating/);
		expect(memStateAt(evs, 59).walk?.stepAt).toHaveLength(2);
		expect(memStateAt(evs, 60).walk?.stepAt).toHaveLength(4);
		expect(memStateAt(evs, 60).c.ram).toBe(4);
	});
	it('too many page-table rows for the view', () => {
		const flat = [SET1, ...Array.from({length: 7}, (_, i) => ev(1, {do: 'mem.map', va: `0x${i + 1}000`, frame: i}))];
		expect(planMem(flat).issues.join()).toMatch(/7 page-table rows/);
	});
});

describe('memgrid tokens, rows, settle, signature', () => {
	it('declares its signature moments and prefixes', () => {
		expect(memgrid.signature).toEqual(expect.arrayContaining(['mem.walk', 'mem.fault', 'mem.cow', 'mem.lookup']));
		for (const k of memgrid.actions) expect(k.startsWith('mem.')).toBe(true);
	});
	it('a note is a token that is on screen at its offset and not before', () => {
		const note = 'TLB hit: zero extra reads';
		const evs = [SET4, ...maps(), ev(10, {do: 'mem.addr', va: HEAP}), ev(30, {do: 'mem.tlbfill'}), ev(60, {do: 'mem.lookup', note})];
		const toks = memTokens(A({do: 'mem.lookup', note}));
		expect(toks).toEqual([{text: note, off: LOOKUP_RESULT}]);
		expect(memTexts(memStateAt(evs, 60 + LOOKUP_RESULT), RECT)).toContain(note);
		expect(memTexts(memStateAt(evs, 60 + LOOKUP_RESULT - 1), RECT)).not.toContain(note);
		expect(memTokens(A({do: 'mem.walk'}))).toEqual([]);
	});
	it('settle covers the whole animation', () => {
		expect(memgrid.settle!(A({do: 'mem.cow'}))).toBe(memDuration(A({do: 'mem.cow'})) + 2);
		expect(memDuration(A({do: 'mem.walk', step_ms: 400}))).toBeLessThan(memDuration(A({do: 'mem.walk'})));
	});
});

/** a rich state: walk, TLB entries, fault, fork, cow, all five counters non-zero */
const rich = (): WorldEvent[] => [
	...session(),
	ev(400, {do: 'mem.addr', va: NEXT, op: 'write'}),
	ev(420, {do: 'mem.fault', src: 'swap', label: 'heap'}),
	ev(500, {do: 'mem.fork', child: 'child', pid: '4243'}),
	ev(560, {do: 'mem.addr', proc: 'child', va: HEAP, op: 'write'}),
	ev(580, {do: 'mem.walk', step_ms: 400}),
	ev(660, {do: 'mem.cow'}),
];
const flatRich = (): WorldEvent[] => [
	SET1,
	ev(1, {do: 'mem.map', va: '0x00401000', frame: 0, flags: 'x', label: 'code'}),
	ev(1, {do: 'mem.map', va: '0x00402000', frame: 1, flags: 'rw', label: 'heap'}),
	ev(10, {do: 'mem.addr', va: '0x00402a48'}),
	ev(30, {do: 'mem.split'}),
	ev(70, {do: 'mem.lookup'}),
	ev(100, {do: 'mem.walk', fill: true}),
	ev(240, {do: 'mem.fork', child: 'child', pid: '101'}),
	ev(300, {do: 'mem.addr', proc: 'child', va: '0x00402a48', op: 'write'}),
	ev(320, {do: 'mem.cow'}),
	ev(420, {do: 'mem.addr', proc: 'child', va: '0x00500000'}),
	ev(440, {do: 'mem.fault', label: 'heap', src: 'disk'}),
];

describe('memgrid layout in every style', () => {
	for (const mk of [rich, flatRich]) {
		it(`${mk === rich ? '4-level' : 'flat'} view has no problems at any settled frame, in all 6 styles`, () => {
			const evs = mk();
			expect(planMem(evs).issues).toEqual([]);
			for (const st of STYLES) {
				setActiveStyle(st.id);
				for (let f = 0; f <= 800; f += 7) {
					const s = memStateAt(evs, f);
					expect(memProblems(s, RECT), `${st.id} frame ${f}`).toEqual([]);
				}
			}
			setActiveStyle('sketch');
		});
	}
	it('flags a slot that is too small', () => {
		const s = memStateAt(rich(), 100);
		expect(memProblems(s, {x: 0, y: 0, w: 576, h: 400}).join()).toMatch(/too small|needs/);
		expect(memProblems(s, {x: 0, y: 0, w: 576, h: 696})).toEqual([]);
	});
	it('every text is at least 16 px and inside the slot', () => {
		for (const mk of [rich, flatRich]) {
			const l = memLayout(memStateAt(mk(), 700), RECT);
			const all = [l.title, l.titleRight, l.status, l.tlbHead, l.physLabel, l.framesHead, ...l.cards.map((c) => c.text), ...l.cells.map((c) => c.label), ...l.chips.map((c) => c.text), ...l.addr.slices.flatMap((s) => [s.bits, s.name, s.val])];
			for (const t of all) {
				expect(t.fs, t.text).toBeGreaterThanOrEqual(16);
				expect(t.x, t.text).toBeGreaterThanOrEqual(0);
				expect(t.y + t.h, t.text).toBeLessThanOrEqual(RECT.h);
			}
		}
	});
	it('a wider bit layout (levels 2, 32 bits) and a long note are still readable', () => {
		const evs = [ev(0, {do: 'world.set', world: 'memgrid', levels: 2, tlb: 3}), ev(5, {do: 'mem.map', va: '0x08048000', frame: 0}), ev(10, {do: 'mem.addr', va: '0x08048abc'}), ev(20, {do: 'mem.split'}), ev(60, {do: 'mem.walk'})];
		const s = memStateAt(evs, 300);
		expect(memProblems(s, RECT)).toEqual([]);
		expect(memLayout(s, RECT).cards).toHaveLength(2);
		expect(memLayout(s, RECT).addr.slices.map((x) => x.val.text)).toEqual(['32', '72', '0xabc']);
	});
});

describe('memgrid colours', () => {
	it('every text colour is legible (>= 4.5:1) on every background it is drawn on, in every style', () => {
		for (const st of STYLES) {
			const c = memColors(st);
			for (const [name, fg, bg] of memColorPairs(c)) expect(contrast(fg, bg), `${st.id} ${name}`).toBeGreaterThanOrEqual(4.5);
		}
	});
});

describe('memgrid view', () => {
	it('draws every text the model says is on screen, in every style (what the gate looks for)', () => {
		const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
		for (const st of STYLES) {
			setActiveStyle(st.id);
			for (const mk of [rich, flatRich]) {
				const evs = mk();
				for (const f of [8, 30, 60, 110, 160, 300, 400, 470, 540, 640, 700, 790]) {
					const s = memStateAt(evs, f);
					const html = renderToStaticMarkup(React.createElement(MemgridView, {state: s, rect: RECT, frame: f, start: 0, style: getStyle()}));
					const dom = norm(html.replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' '));
					// texts are drawn each in their own element: compare without the spaces tags introduce
					const flat = dom.replace(/ /g, '');
					for (const t of memTexts(s, RECT)) expect(flat, `${st.id} frame ${f} "${t}"`).toContain(norm(t).replace(/ /g, ''));
				}
			}
		}
		setActiveStyle('sketch');
	});
	it('marks its root as a world shell', () => {
		const s = memStateAt(rich(), 100);
		const html = renderToStaticMarkup(React.createElement(MemgridView, {state: s, rect: RECT, frame: 100, start: 0, style: getStyle()}));
		expect(html).toContain('data-shell');
		expect(html).toContain('data-world="memgrid"');
		expect(html).toContain('data-code');
	});
});
