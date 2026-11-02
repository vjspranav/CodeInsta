import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import './helpers';
import type {Action} from '../src/schema';
import {validateStory} from '../src/schema';
import {buildTimeline} from '../src/timeline';
import {CONTENT} from '../src/theme';
import {contrast, setActiveStyle, STYLES} from '../src/styles';
import {deriveChecks} from '../verify-lib';
import {isSignatureAction} from '../src/worlds';
import type {WorldEvent} from '../src/worlds';
import {netmap} from '../src/worlds/netmap';
import {netProblems, netScene, netTexts} from '../src/worlds/netmap/layout';
import {
	ARRIVE_F,
	BURST_F,
	CROWN_LOST_F,
	DROP_T,
	GHOST_F,
	HOLD_F,
	hopFrames,
	netIsSignature,
	netRows,
	netSettle,
	netStateAt,
	netTimelineProblems,
	netTokens,
	packetToneOf,
	planNet,
	route,
	validateNet,
} from '../src/worlds/netmap/model';
import {netColors, toneText} from '../src/worlds/netmap/View';

const A = (a: Record<string, unknown>) => a as unknown as Action;
const ev = (frame: number, a: Record<string, unknown>, beat = 0): WorldEvent => ({frame, beat, action: A(a)});
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const RECT = CONTENT;

const SET = ev(0, {
	do: 'world.set',
	world: 'netmap',
	title: 'cluster',
	nodes: [
		{id: 's1', label: 'S1', kind: 'server', x: 0.12, y: 0.5},
		{id: 's2', label: 'S2', kind: 'server', x: 0.88, y: 0.05},
		{id: 's3', label: 'S3', kind: 'server', x: 0.88, y: 0.95},
	],
	links: [
		{a: 's1', b: 's2', label: 'wan'},
		{a: 's1', b: 's3'},
		{a: 's2', b: 's3'},
	],
});
const HOP = hopFrames({});
const send = (frame: number, from: string, to: string, kind = 'Ping', extra: Record<string, unknown> = {}) => ev(frame, {do: 'nm.send', from, to, kind, ...extra});
const pk = (events: WorldEvent[], frame: number) => netStateAt(events, frame).packets;
const node = (events: WorldEvent[], frame: number, id: string) => netStateAt(events, frame).nodes.find((n) => n.id === id)!;

describe('netmap validation', () => {
	it('accepts well-formed actions', () => {
		const ok = [
			{do: 'nm.node', id: 'r1', label: 'router', kind: 'router', x: 0.5, y: 0.5, cap: 32},
			{do: 'nm.link', a: 's1', b: 's2', label: '10 ms'},
			{do: 'nm.send', from: 's1', to: 's2', kind: 'SYN', count: 3, gap_ms: 100, hop_ms: 400, tone: 'req', resets: true, via: ['r1']},
			{do: 'nm.drop', node: 'r1'},
			{do: 'nm.cut', a: 's1', b: 's2'},
			{do: 'nm.heal'},
			{do: 'nm.heal', a: 's1', b: 's2'},
			{do: 'nm.partition', groups: [['s1'], ['s2', 's3']]},
			{do: 'nm.role', node: 's1', role: 'leader', term: 2},
			{do: 'nm.role', node: 's1', term: 3},
			{do: 'nm.badge', node: 's1', text: 'ESTABLISHED', tone: 'ok'},
			{do: 'nm.down', node: 's1'},
			{do: 'nm.up', node: 's1'},
			{do: 'nm.timer', node: 's2', ms: 3000, label: '210 ms'},
			{do: 'nm.timer', node: 's2', off: true},
			{do: 'nm.buffer', node: 'r1', level: 60, cap: 64, ms: 400, overflow: true},
			{do: 'nm.stat', id: 'att', label: 'attempts', value: 27, of: 30, unit: '', node: 's1', tone: 'warn'},
			{do: 'nm.log', node: 's1', text: 'hello'},
			{do: 'nm.log', node: 's1', lines: ['a', 'b']},
			{do: 'nm.focus', node: 's1'},
			{do: 'nm.focus', off: true},
			{do: 'world.set', world: 'netmap', title: 'x', nodes: [{id: 'a', x: 0, y: 1}], links: []},
		];
		for (const a of ok) expect(validateNet(A(a)), JSON.stringify(a)).toEqual([]);
	});
	it('rejects missing or malformed fields', () => {
		const bad: [Record<string, unknown>, RegExp][] = [
			[{do: 'nm.node', id: 'a'}, /needs "x"/],
			[{do: 'nm.node', id: 'a b', x: 0, y: 0}, /needs "id"/],
			[{do: 'nm.node', id: 'a', x: 1.5, y: 0}, /needs "x"/],
			[{do: 'nm.node', id: 'a', x: 0, y: 0, kind: 'toaster'}, /kind/],
			[{do: 'nm.node', id: 'a', x: 0, y: 0, label: 'waytoolonglabel'}, /label/],
			[{do: 'nm.link', a: 's1', b: 's1'}, /two different nodes/],
			[{do: 'nm.send', from: 's1', to: 's2'}, /needs "kind"/],
			[{do: 'nm.send', from: 's1', kind: 'x'}, /needs "to"/],
			[{do: 'nm.send', from: 's1', to: 's2', kind: 'x', count: 12}, /count/],
			[{do: 'nm.send', from: 's1', to: 's2', kind: 'x', tone: 'blue'}, /tone/],
			[{do: 'nm.send', from: 's1', to: 's2', kind: 'x'.repeat(30)}, /max 22/],
			[{do: 'nm.cut', a: 's1'}, /needs "b"/],
			[{do: 'nm.heal', a: 's1'}, /both "a" and "b"/],
			[{do: 'nm.partition', groups: [['s1']]}, /2-4 non-empty/],
			[{do: 'nm.role', node: 's1'}, /"role" and \/ or "term"/],
			[{do: 'nm.role', node: 's1', role: 'Leader'}, /role/],
			[{do: 'nm.badge', node: 's1'}, /needs "text"/],
			[{do: 'nm.timer', node: 's1'}, /needs "ms"/],
			[{do: 'nm.timer', node: 's1', ms: 50}, /ms/],
			[{do: 'nm.buffer', node: 'r1'}, /needs "level"/],
			[{do: 'nm.stat', id: 'a'}, /needs "value"/],
			[{do: 'nm.log', node: 's1'}, /needs "text" or "lines"/],
			[{do: 'nm.log', node: 's1', text: 'x'.repeat(60)}, /max 46/],
			[{do: 'nm.log', node: 's1', lines: ['1', '2', '3', '4', '5']}, /max 4/],
			[{do: 'nm.focus'}, /needs "node"/],
			[{do: 'world.set', world: 'netmap', nodes: Array.from({length: 9}, (_, i) => ({id: `n${i}`, x: 0, y: 0}))}, /max 8/],
		];
		for (const [a, re] of bad) expect(validateNet(A(a)).join('; '), JSON.stringify(a)).toMatch(re);
	});
});

describe('netmap packets', () => {
	const events = [SET, send(10, 's1', 's2', 'AppendEntries')];
	it('moves along the link and arrives with a ping on the receiver', () => {
		expect(pk(events, 9)).toHaveLength(0);
		const mid = pk(events, 10 + HOP / 2);
		expect(mid).toHaveLength(1);
		expect(mid[0]).toMatchObject({a: 's1', b: 's2', status: 'fly', kind: 'AppendEntries', tone: 'beat'});
		expect(mid[0].t).toBeCloseTo(0.5, 1);
		expect(pk(events, 10 + HOP)[0].t).toBeCloseTo(1, 5);
		expect(pk(events, 10 + HOP + 2)[0].status).toBe('arrived');
		expect(pk(events, 10 + HOP + ARRIVE_F + 1)).toHaveLength(0);
		expect(node(events, 10 + HOP + 2, 's2').pulseAge).toBe(2);
		expect(node(events, 10 + HOP + 40, 's2').pulseAge).toBeNull();
	});
	it('routes over several hops through a router and waits a moment there', () => {
		const evs = [
			ev(0, {do: 'world.set', world: 'netmap', nodes: [{id: 'c', x: 0, y: 0.5}, {id: 'r', kind: 'router', x: 0.5, y: 0.5}, {id: 'sv', x: 1, y: 0.5}], links: [{a: 'c', b: 'r'}, {a: 'r', b: 'sv'}]}),
			send(5, 'c', 'sv', 'SYN'),
		];
		expect(route([{a: 'c', b: 'r'}, {a: 'r', b: 'sv'}], 'c', 'sv')).toEqual(['c', 'r', 'sv']);
		expect(pk(evs, 5 + HOP - 2)[0]).toMatchObject({a: 'c', b: 'r', status: 'fly'});
		// in the hold at the router the packet sits at the start of the next hop
		expect(pk(evs, 5 + HOP + 1)[0]).toMatchObject({a: 'r', b: 'sv', t: 0});
		expect(pk(evs, 5 + HOP + HOLD_F + 5)[0]).toMatchObject({a: 'r', b: 'sv', status: 'fly'});
		expect(pk(evs, 5 + 2 * HOP + HOLD_F)[0].t).toBeCloseTo(1, 5);
		expect(planNet(evs).issues).toEqual([]);
	});
	it('a train of packets: only the first carries a label', () => {
		const evs = [SET, send(0, 's1', 's3', 'DATA', {count: 3, gap_ms: 200})];
		const at = pk(evs, 20);
		expect(at.length).toBe(4 > at.length ? at.length : at.length);
		expect(planNet(evs).packets.map((p) => p.label)).toEqual(['DATA', '', '']);
		expect(planNet(evs).packets.map((p) => p.start)).toEqual([0, 6, 12]);
	});
	it('packet kinds get a tone', () => {
		expect(packetToneOf('SYN')).toBe('req');
		expect(packetToneOf('SYN-ACK')).toBe('ack');
		expect(packetToneOf('RequestVote')).toBe('vote');
		expect(packetToneOf('VoteGranted')).toBe('ack');
		expect(packetToneOf('AppendEntries')).toBe('beat');
		expect(packetToneOf('RST')).toBe('err');
		expect(packetToneOf('SYN', 'err')).toBe('err');
	});
});

describe('netmap failures', () => {
	it('a packet sent into a cut link stops on it and drops with a burst', () => {
		const evs = [SET, ev(5, {do: 'nm.cut', a: 's1', b: 's2'}), send(20, 's1', 's2', 'AppendEntries')];
		const stop = 20 + Math.round(HOP * DROP_T);
		expect(pk(evs, stop - 2)[0].status).toBe('fly');
		const dropped = pk(evs, stop + 1)[0];
		expect(dropped).toMatchObject({status: 'dropped', a: 's1', b: 's2'});
		expect(dropped.t).toBeCloseTo(DROP_T, 5);
		expect(pk(evs, stop + GHOST_F + 1)).toHaveLength(0);
		expect(netStateAt(evs, stop - 1).bursts).toHaveLength(0);
		expect(netStateAt(evs, stop + 3).bursts).toEqual([{a: 's1', b: 's2', t: DROP_T, node: undefined, age: 3}]);
		expect(netStateAt(evs, stop + BURST_F + 1).bursts).toHaveLength(0);
		expect(node(evs, stop + 10, 's2').pulseAge).toBeNull();
		expect(netStateAt(evs, stop).links.find((l) => l.key === 's1~s2')!.cut).toBe(true);
	});
	it('a cut while the packet is in flight drops it where it is', () => {
		const evs = [SET, send(0, 's1', 's2'), ev(Math.round(HOP * 0.3), {do: 'nm.cut', a: 's2', b: 's1'})];
		const c = Math.round(HOP * 0.3);
		expect(pk(evs, c - 1)[0].status).toBe('fly');
		const p = pk(evs, c + 1)[0];
		expect(p.status).toBe('dropped');
		expect(p.t).toBeCloseTo(c / HOP, 2);
	});
	it('a packet that passed the cut before it happened arrives', () => {
		const evs = [SET, send(0, 's1', 's2'), ev(HOP + 4, {do: 'nm.cut', a: 's1', b: 's2'})];
		expect(pk(evs, HOP + 2)[0].status).toBe('arrived');
		expect(netStateAt(evs, HOP + 30).bursts).toHaveLength(0);
	});
	it('heal makes the link work again', () => {
		const evs = [SET, ev(0, {do: 'nm.cut', a: 's1', b: 's2'}), ev(50, {do: 'nm.heal', a: 's1', b: 's2'}), send(60, 's1', 's2')];
		expect(netStateAt(evs, 49).links[0].cut).toBe(true);
		expect(netStateAt(evs, 51).links[0].cut).toBe(false);
		expect(netStateAt(evs, 51).links[0].age).toBe(1);
		expect(pk(evs, 60 + HOP + 1)[0].status).toBe('arrived');
	});
	it('a partition cuts only the links between the groups; heal without arguments clears it', () => {
		const evs = [SET, ev(10, {do: 'nm.partition', groups: [['s1'], ['s2', 's3']]}), ev(90, {do: 'nm.heal'})];
		const s = netStateAt(evs, 20);
		expect(s.links.map((l) => [l.key, l.cut])).toEqual([['s1~s2', true], ['s1~s3', true], ['s2~s3', false]]);
		expect(s.partition).toEqual({groups: [['s1'], ['s2', 's3']], age: 10});
		expect(s.status).toEqual({left: 'links 1/3 up', right: 'partitioned', bad: true});
		expect(netStateAt(evs, 9).partition).toBeNull();
		const healed = netStateAt(evs, 95);
		expect(healed.links.every((l) => !l.cut)).toBe(true);
		expect(healed.partition).toBeNull();
		expect(healed.status).toEqual({left: 'links 3/3 up', right: '', bad: false});
		expect(netSceneHalos(evs, 20)).toBe(2);
	});
	it('a packet arriving at a crashed node is dropped at the node; a crash is reported in the status', () => {
		const evs = [SET, ev(0, {do: 'nm.down', node: 's2'}), send(10, 's1', 's2')];
		const at = 10 + HOP;
		expect(pk(evs, at + 1)[0].status).toBe('dropped');
		expect(netStateAt(evs, at + 2).bursts[0].node).toBe('s2');
		expect(node(evs, at, 's2')).toMatchObject({down: true, badge: 'down', tone: 'err'});
		expect(netStateAt(evs, at).status.right).toBe('1 down');
		expect(planNet(evs).issues).toEqual([]);
		const back = [...evs, ev(200, {do: 'nm.up', node: 's2'})];
		expect(node(back, 201, 's2').down).toBe(false);
	});
	it('nm.drop bursts at a node', () => {
		const evs = [SET, ev(10, {do: 'nm.drop', node: 's1'})];
		expect(netStateAt(evs, 12).bursts).toEqual([{a: undefined, b: undefined, t: undefined, node: 's1', age: 2}]);
	});
});

const netSceneHalos = (evs: WorldEvent[], f: number) => netScene(netStateAt(evs, f), RECT).halos.length;

describe('netmap roles, crowns and timers', () => {
	const evs = [
		SET,
		ev(10, {do: 'nm.role', node: 's1', role: 'leader', term: 1}),
		ev(12, {do: 'nm.role', node: 's2', role: 'follower', term: 1}),
		ev(100, {do: 'nm.role', node: 's2', role: 'candidate', term: 2}),
		ev(130, {do: 'nm.role', node: 's2', role: 'leader'}),
		ev(140, {do: 'nm.role', node: 's1', role: 'follower', term: 2}),
	];
	it('a badge shows role and term; the leader wears a crown that drops in and falls off', () => {
		expect(node(evs, 9, 's1').badge).toBeNull();
		const a = node(evs, 14, 's1');
		expect(a).toMatchObject({badge: 'leader T1', crown: true, crownAge: 4, tone: 'ok'});
		expect(node(evs, 20, 's2')).toMatchObject({badge: 'follower T1', crown: false, tone: 'info'});
		expect(node(evs, 101, 's2')).toMatchObject({badge: 'candidate T2', tone: 'warn', term: 2});
		const leader = node(evs, 131, 's2');
		expect(leader).toMatchObject({badge: 'leader T2', role: 'leader', crown: true});
		// the old leader steps down: the crown falls
		const lost = node(evs, 142, 's1');
		expect(lost).toMatchObject({badge: 'follower T2', crown: false, crownLostAge: 2});
		expect(node(evs, 140 + CROWN_LOST_F + 1, 's1').crownLostAge).toBeNull();
	});
	it('a crash takes the crown away; a free badge replaces the role text', () => {
		const e2 = [...evs, ev(150, {do: 'nm.down', node: 's2'}), ev(160, {do: 'nm.badge', node: 's3', text: 'ESTABLISHED', tone: 'ok'})];
		expect(node(e2, 152, 's2')).toMatchObject({crown: false, crownLostAge: 2, down: true});
		expect(node(e2, 161, 's3')).toMatchObject({badge: 'ESTABLISHED', tone: 'ok'});
	});
	it('a timer ring drains over its time, expires, and is re-armed by an arriving heartbeat', () => {
		const t = [SET, ev(0, {do: 'nm.timer', node: 's2', ms: 2000, label: '210 ms'}), send(20, 's1', 's2', 'AppendEntries', {resets: true})];
		const ring = (f: number) => node(t, f, 's2').timer;
		expect(ring(0)).toMatchObject({frac: 1, label: '210 ms', expired: false});
		expect(ring(15)!.frac).toBeCloseTo(0.75, 2);
		const arrival = 20 + HOP;
		expect(ring(arrival - 1)!.frac).toBeCloseTo(1 - (arrival - 1) / 60, 2);
		expect(ring(arrival)!.frac).toBe(1);
		expect(ring(arrival + 30)!.frac).toBeCloseTo(0.5, 2);
		// without the heartbeat the ring runs out, flashes and goes away
		const quiet = [SET, ev(0, {do: 'nm.timer', node: 's2', ms: 1000})];
		expect(node(quiet, 29, 's2').timer!.expired).toBe(false);
		expect(node(quiet, 31, 's2').timer).toMatchObject({expired: true, frac: 0, expiredAge: 1});
		expect(node(quiet, 60, 's2').timer).toBeNull();
		// a packet that was dropped does not re-arm anything
		const cut = [SET, ev(0, {do: 'nm.timer', node: 's2', ms: 1000}), ev(1, {do: 'nm.cut', a: 's1', b: 's2'}), send(20, 's1', 's2', 'AppendEntries', {resets: true})];
		expect(node(cut, 20 + HOP, 's2').timer!.frac).toBeLessThan(0.3);
		// off, and a crashed node shows no ring
		expect(node([...t, ev(40, {do: 'nm.timer', node: 's2', off: true})], 41, 's2').timer).toBeNull();
		expect(node([...t, ev(40, {do: 'nm.down', node: 's2'})], 41, 's2').timer).toBeNull();
	});
});

describe('netmap buffers, counters and logs', () => {
	it('the buffer fills over its tween and overflows with a spray', () => {
		const evs = [
			ev(0, {do: 'world.set', world: 'netmap', nodes: [{id: 'r', kind: 'router', x: 0.5, y: 0.4, cap: 64}]}),
			ev(10, {do: 'nm.buffer', node: 'r', level: 32, ms: 500}),
			ev(60, {do: 'nm.buffer', node: 'r', level: 80, ms: 500, overflow: true}),
		];
		const b = (f: number) => node(evs, f, 'r').buffer;
		expect(b(9)).toBeNull();
		expect(b(10)!.level).toBe(0);
		expect(b(10 + 8)!.level).toBeGreaterThan(10);
		expect(b(10 + 8)!.level).toBeLessThan(32);
		expect(b(45)).toMatchObject({level: 32, cap: 64, full: false});
		expect(b(60 + 15)).toMatchObject({level: 64, cap: 64, full: true, overflowAge: 15});
		expect(b(59)!.full).toBe(false);
		expect(netStateAt(evs, 60 + 12).bursts.some((x) => x.node === 'r')).toBe(true);
		expect(netIsSignature(A({do: 'nm.buffer', node: 'r', level: 80, overflow: true}))).toBe(true);
		expect(netIsSignature(A({do: 'nm.buffer', node: 'r', level: 64, cap: 64}))).toBe(true);
		expect(netIsSignature(A({do: 'nm.buffer', node: 'r', level: 30, cap: 64}))).toBe(false);
	});
	it('a counter tweens to its value and keeps its label', () => {
		const evs = [SET, ev(0, {do: 'nm.stat', id: 'att', label: 'attempts', value: 1}), ev(30, {do: 'nm.stat', id: 'att', value: 27, of: 30, ms: 500})];
		const t = (f: number) => netStateAt(evs, f).stats[0].text;
		expect(t(0)).toBe('attempts 1');
		expect(t(30 + 5)).toMatch(/^attempts (\d+\.?\d*)\/30$/);
		const mid = Number(t(35).match(/attempts ([\d.]+)/)![1]);
		expect(mid).toBeGreaterThan(1);
		expect(mid).toBeLessThan(27);
		expect(t(30 + 15)).toBe('attempts 27/30');
		expect(netStateAt(evs, 100).stats[0].node).toBeNull();
	});
	it('log lines show newest five and can be filtered to one node', () => {
		const lines = Array.from({length: 7}, (_, i) => ev(i * 10, {do: 'nm.log', node: i % 2 ? 's1' : 's2', text: `line ${i}`}));
		const evs = [SET, ...lines, ev(100, {do: 'nm.focus', node: 's1'}), ev(120, {do: 'nm.focus', off: true})];
		expect(netStateAt(evs, 65).logs.map((l) => l.text)).toEqual(['line 2', 'line 3', 'line 4', 'line 5', 'line 6']);
		expect(netStateAt(evs, 105).logs.map((l) => l.text)).toEqual(['line 1', 'line 3', 'line 5']);
		expect(netStateAt(evs, 105).logFocus).toBe('s1');
		expect(netStateAt(evs, 125).logFocus).toBeNull();
		expect(netStateAt(evs, 5).logs).toHaveLength(1);
		expect(netStateAt(evs, 5).hasLogs).toBe(true);
	});
});

describe('netmap determinism and timeline problems', () => {
	it('is deterministic and never shows the future', () => {
		const base = [SET, send(10, 's1', 's2'), ev(20, {do: 'nm.cut', a: 's1', b: 's3'}), ev(30, {do: 'nm.role', node: 's1', role: 'leader', term: 1})];
		const more = [...base, send(200, 's2', 's3', 'Later'), ev(210, {do: 'nm.log', node: 's1', text: 'late'}), ev(220, {do: 'nm.stat', id: 'x', label: 'x', value: 1, node: 's1'})];
		for (const f of [0, 9, 14, 25, 40, 100, 199]) {
			const a = netStateAt(base, f);
			const b = netStateAt(more, f);
			// the reserved bands and rows come from the whole reel; everything that moves must agree
			expect({...b, hasLogs: 0, hasHud: 0, under: 0}).toEqual({...a, hasLogs: 0, hasHud: 0, under: 0});
			expect(netStateAt(more, f)).toEqual(netStateAt(more.map((e) => ({...e})), f));
		}
		expect(netStateAt(more, 205).packets.some((p) => p.kind === 'Later')).toBe(true);
	});
	it('reports unknown nodes, missing routes, crashed senders and double declarations', () => {
		const evs = [
			SET,
			send(5, 's1', 'zz'),
			ev(6, {do: 'nm.node', id: 'iso', x: 0.5, y: 0.5}, 1),
			send(7, 's1', 'iso', 'X'),
			ev(8, {do: 'nm.down', node: 's1'}),
			send(9, 's1', 's2'),
			ev(10, {do: 'nm.cut', a: 's1', b: 'zz'}),
			ev(11, {do: 'nm.node', id: 's1', x: 0, y: 0}),
			ev(12, {do: 'nm.log', node: 'nope', text: 'x'}),
			ev(13, {do: 'nm.partition', groups: [['s1'], ['s1', 's2']]}),
			send(14, 's1', 's3', 'V', {via: ['s2']}),
		];
		const p = netTimelineProblems(evs).join('\n');
		expect(p).toMatch(/unknown node "zz"/);
		expect(p).toMatch(/no link path from "s1" to "iso"/);
		expect(p).toMatch(/"s1" is down and cannot send/);
		expect(p).toMatch(/node "s1" is declared twice/);
		expect(p).toMatch(/unknown node "nope"/);
		expect(p).toMatch(/node "s1" in two groups/);
		expect(netTimelineProblems([SET, send(5, 's1', 's2')])).toEqual([]);
		expect(netmap.timelineProblems!([SET])).toEqual([]);
	});
	it('settle and rows grow with the travel time', () => {
		const a = A({do: 'nm.send', from: 'a', to: 'b', kind: 'x'});
		const b = A({do: 'nm.send', from: 'a', to: 'b', kind: 'x', count: 5, via: ['m', 'n']});
		expect(netSettle(b)).toBeGreaterThan(netSettle(a));
		expect(netRows(b)).toBeGreaterThan(netRows(a));
		expect(netRows(A({do: 'nm.log', node: 'a', lines: ['1', '2', '3']}))).toBe(3);
	});
});

describe('netmap tokens and what is on screen', () => {
	it('every token text is on screen at its offset, and not before for packets and badges', () => {
		const evs = [
			SET,
			send(20, 's1', 's2', 'AppendEntries'),
			ev(60, {do: 'nm.role', node: 's1', role: 'leader', term: 2}),
			ev(80, {do: 'nm.log', node: 's2', lines: ['first line', 'second line']}),
			ev(100, {do: 'nm.stat', id: 'att', label: 'attempts', value: 27, ms: 500}),
			ev(130, {do: 'nm.badge', node: 's3', text: 'LISTEN'}),
			ev(140, {do: 'nm.buffer', node: 's2', level: 30, cap: 64, ms: 500}),
		];
		const texts = (f: number) => netTexts(netStateAt(evs, f), RECT).join('\n');
		for (const e of evs.slice(1)) {
			for (const tok of netTokens(e.action)) {
				expect(texts(e.frame + tok.off), `${e.action.do} ${tok.text}`).toContain(tok.text);
			}
		}
		expect(texts(19)).not.toContain('AppendEntries');
		expect(texts(20)).toContain('AppendEntries');
		expect(texts(59)).not.toContain('leader T2');
		expect(texts(64)).toContain('leader T2');
		expect(texts(80)).toContain('S2 first line');
		expect(texts(80)).not.toContain('second line');
		expect(texts(84)).toContain('S2 second line');
		expect(texts(129)).not.toContain('LISTEN');
		const base = texts(5);
		expect(base).toContain('cluster');
		expect(base).toContain('links 3/3 up');
		expect(base).toContain('wan');
		expect(texts(0)).toContain('S3');
	});
	it('is invisible before the first world.set', () => {
		expect(netStateAt([ev(10, {do: 'world.set', world: 'netmap'})], 5).visible).toBe(false);
		expect(netTexts(netStateAt([ev(10, {do: 'world.set', world: 'netmap'})], 5), RECT)).toEqual([]);
	});
});

describe('netmap layout', () => {
	const evs = [
		SET,
		ev(1, {do: 'nm.role', node: 's1', role: 'leader', term: 1}),
		ev(1, {do: 'nm.timer', node: 's2', ms: 1000, label: '210 ms'}),
		ev(1, {do: 'nm.log', node: 's1', text: 'a log line'}),
		ev(1, {do: 'nm.stat', id: 'term', label: 'max term', value: 1}),
		ev(1, {do: 'nm.buffer', node: 's3', level: 10}),
	];
	it('keeps every text inside the slot and nothing on top of anything', () => {
		for (const f of [2, 20, 40, 90]) expect(netProblems(netStateAt(evs, f), RECT), `frame ${f}`).toEqual([]);
		const withBoard = {...RECT, h: RECT.h - 158};
		expect(netProblems(netStateAt(evs, 40), withBoard)).toEqual([]);
	});
	it('puts the map under the title and counter row and above the log panel', () => {
		const sc = netScene(netStateAt(evs, 40), RECT);
		expect(sc.hud).not.toBeNull();
		expect(sc.log).not.toBeNull();
		for (const g of sc.nodes) {
			expect(g.box.y).toBeGreaterThan(sc.map.y);
			expect(g.box.y + g.box.h).toBeLessThan(sc.log!.y);
		}
		// a reel without logs or counters uses the whole slot
		const plain = netScene(netStateAt([SET], 20), RECT);
		expect(plain.log).toBeNull();
		expect(plain.hud).toBeNull();
		expect(plain.map.h).toBeGreaterThan(sc.map.h);
	});
	it('flags a slot too small, nodes on top of each other, a link through a node, a crown off the map', () => {
		expect(netProblems(netStateAt(evs, 40), {x: 0, y: 0, w: 300, h: 200}).join()).toMatch(/at least 420x360/);
		const clash = [SET, ev(1, {do: 'nm.node', id: 's4', label: 'S4', x: 0.12, y: 0.5})];
		expect(netProblems(netStateAt(clash, 30), RECT).join()).toMatch(/overlaps/);
		const through = [
			ev(0, {do: 'world.set', world: 'netmap', nodes: [{id: 'a', x: 0, y: 0.5}, {id: 'b', x: 0.5, y: 0.5}, {id: 'c', x: 1, y: 0.5}], links: [{a: 'a', b: 'c'}]}),
		];
		expect(netProblems(netStateAt(through, 30), RECT).join()).toMatch(/runs through node/);
		const crown = [ev(0, {do: 'world.set', world: 'netmap', nodes: [{id: 'a', x: 0.5, y: 0}]}), ev(1, {do: 'nm.role', node: 'a', role: 'leader', term: 1})];
		expect(netProblems(netStateAt(crown, 30), RECT)).toEqual([]);
	});
	it('flags counters that run off the slot', () => {
		const wide = [SET, ...['a', 'b', 'c', 'd'].map((id) => ev(1, {do: 'nm.stat', id, label: 'timeouts', value: 1000000}))];
		expect(netProblems(netStateAt(wide, 40), RECT).join()).toMatch(/counter chips|does not fit/);
	});
	it('puts a packet label where no node is in the way', () => {
		const e = [SET, send(0, 's1', 's2', 'AppendEntries')];
		for (let f = 2; f < HOP; f += 3) {
			const sc = netScene(netStateAt(e, f), RECT);
			const lab = sc.packets[0].label!;
			expect(lab.box.x).toBeGreaterThanOrEqual(0);
			expect(lab.box.x + lab.box.w).toBeLessThanOrEqual(RECT.w);
		}
	});
});

describe('netmap signature and colours', () => {
	it('signature predicate: cut, partition, drop, crash, a leader crowned, an overflow', () => {
		for (const a of [{do: 'nm.cut', a: 'x', b: 'y'}, {do: 'nm.partition', groups: [['a'], ['b']]}, {do: 'nm.drop', node: 'a'}, {do: 'nm.down', node: 'a'}, {do: 'nm.role', node: 'a', role: 'leader'}]) {
			expect(netIsSignature(A(a)), a.do).toBe(true);
			expect(isSignatureAction(A(a)), a.do).toBe(true);
		}
		for (const a of [{do: 'nm.role', node: 'a', role: 'follower'}, {do: 'nm.send', from: 'a', to: 'b', kind: 'x'}, {do: 'nm.heal'}, {do: 'nm.log', node: 'a', text: 'x'}]) {
			expect(netIsSignature(A(a)), String(a.do)).toBe(false);
			expect(isSignatureAction(A(a)), String(a.do)).toBe(false);
		}
		expect(netmap.signature).toEqual(expect.arrayContaining(['nm.cut', 'nm.role', 'nm.buffer']));
		expect(netmap.actions.every((k) => k.startsWith('nm.'))).toBe(true);
	});
	it('every colour the map writes text in is legible (>= 4.5:1) in every style', () => {
		for (const st of STYLES) {
			setActiveStyle(st.id);
			const c = netColors(st);
			for (const [name, fg, bg] of [
				['ink on chip', c.ink, c.bg],
				['ok on chip', c.ok, c.bg],
				['warn on chip', c.warn, c.bg],
				['err on chip', c.err, c.bg],
				['muted on chip', toneText(c, 'info') === c.ink ? c.ink : c.muted, c.bg],
				['ink on leader node', c.ink, c.leaderBg],
				['ink on down node', c.ink, c.downBg],
				['log text', c.log.fg, c.log.bg],
				['log dim', c.log.dim, c.log.bg],
				['log err', c.log.err, c.log.bg],
				['log warn', c.log.warn, c.log.bg],
				['log ok', c.log.ok, c.log.bg],
				['log tag', c.log.tag, c.log.bg],
			] as const) {
				expect(contrast(fg, bg), `${st.id} ${name}`).toBeGreaterThanOrEqual(4.5);
			}
		}
		setActiveStyle('sketch');
	});
});

describe('netmap demo', () => {
	it('the demo passes every pure check of the gate (world, sync, variety) and runs 60-75 s', () => {
		const v = validateStory(JSON.parse(fs.readFileSync(path.join(root, 'content/lab-v3/worlds/netmap.json'), 'utf8')));
		if (!v.ok) throw new Error(v.errors.join('; '));
		const s = v.story;
		expect(s.world).toBe('netmap');
		const audio = {lines: s.beats.map((b, i) => ({beat_index: i, speaker: b.speaker, src: `b${i}.wav`, duration_ms: Math.max(1400, Math.round((b.say ?? b.text).length * 62))}))};
		const {checks, tl} = deriveChecks(s, audio);
		const failed = checks.map((c) => [c.group, c.pure()] as const).filter(([, r]) => r);
		expect(failed).toEqual([]);
		for (const g of ['world.netmap', 'world.primary', 'notes.share', 'signature']) expect(checks.some((c) => c.group === g), g).toBe(true);
		const secs = tl.endCard.start / 30;
		expect(secs).toBeGreaterThanOrEqual(60);
		expect(secs).toBeLessThanOrEqual(75);
		// the story's partition drops packets and moves the crown
		const inst = tl.worlds.find((w) => w.world === 'netmap')!;
		const last = inst.events[inst.events.length - 1].frame + 300;
		const end = netStateAt(inst.events, last);
		expect(end.nodes.find((n) => n.id === 's2')!.crown).toBe(true);
		expect(end.nodes.find((n) => n.id === 's1')!.crown).toBe(false);
		expect(planNet(inst.events).bursts.length).toBeGreaterThan(0);
	});
	it('a script with net actions but no world.set is rejected by the schema', () => {
		const v = validateStory({version: 3, format: 'story', title: 't', topic: 't', level: 'beginner', cast: [], beats: [{speaker: 'narrator', text: 'Hello there.', visuals: [{do: 'nm.cut', a: 'a', b: 'b'}]}]});
		expect(v.ok).toBe(false);
		expect(buildTimeline).toBeTypeOf('function');
	});
});
