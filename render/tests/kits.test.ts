import {describe, expect, it} from 'vitest';
import {A, mkAudio, one} from './helpers';
import {deriveChecks} from '../verify-lib';
import {buildTimeline} from '../src/timeline';
import {editorGeom, editorStateAt, kitSnap, packetStateAt, plotStateAt, seqModel, seqStateAt, SEQ_ANIM, SEQ_STEP, trackStateAt, treeLayout, treeStateAt} from '../src/kits';
import {setActiveStyle, STYLES} from '../src/styles';
import {validateStory} from '../src/schema';

const seq = (extra: Record<string, unknown> = {}) =>
	A({do: 'seq.diagram', id: 'w', actors: ['Browser', 'DNS', 'Server'], messages: [{from: 'Browser', to: 'DNS', label: 'where is it?'}, {from: 'DNS', to: 'Browser', label: 'an address', reply: true}], ...extra});
const tree = (extra: Record<string, unknown> = {}) =>
	A({do: 'tree', id: 't', nodes: [{id: 'a', label: 'root'}, {id: 'b', label: 'left', parent: 'a'}, {id: 'c', label: 'right', parent: 'a'}, {id: 'd', label: 'leaf', parent: 'b'}], path: ['a', 'b', 'd'], ...extra});
const track = (extra: Record<string, unknown> = {}) =>
	A({do: 'timeline.track', id: 'k', lanes: ['CPU 0', 'CPU 1'], span: [0, 100], blocks: [{lane: 'CPU 0', start: 0, end: 50, label: 'init'}, {lane: 'CPU 1', start: 20, end: 90, label: 'zygote'}], playhead: {from: 0, to: 80, ms: 1500}, ...extra});
const packets = (extra: Record<string, unknown> = {}) =>
	A({do: 'packet.flow', id: 'p', nodes: ['A', 'B', 'C'], packets: [{from: 'A', to: 'B', label: 'one'}, {from: 'B', to: 'C', label: 'two', drop: true}, {from: 'B', to: 'C', label: 'two', retry: true}], ...extra});
const editor = (extra: Record<string, unknown> = {}) => A({do: 'code.editor', id: 'e', file: 'main.c', lines: ['int main() {', '  return 0;', '}'], ...extra});
const plot = (extra: Record<string, unknown> = {}) =>
	A({do: 'chart.plot', id: 'c', kind: 'loss', xlabel: 'step', ylabel: 'loss', series: [{name: 'loss', points: [[0, 2], [1, 1.2], [2, 0.8], [3, 0.5]]}], ...extra});

const KITS: [string, () => ReturnType<typeof A>][] = [
	['seq', seq],
	['tree', tree],
	['track', track],
	['packets', packets],
	['editor', editor],
	['plot', plot],
];

describe('every kit', () => {
	for (const [kind, make] of KITS) {
		it(`${kind}: validates, places an item, and its QA checks pass`, () => {
			const {story, tl} = one([make()], 2500);
			expect(validateStory(story).ok).toBe(true);
			const item = tl.scenes[0].items.find((i) => i.kind === kind)!;
			expect(item).toBeDefined();
			const {checks} = deriveChecks(story, mkAudio(story, 2500));
			const kc = checks.filter((c) => c.group === `kit.${kind}`);
			expect(kc.length).toBeGreaterThan(0);
			for (const c of kc) expect(c.pure(), c.desc).toBeNull();
		});
		it(`${kind}: geometry is clean in every style`, () => {
			const {tl} = one([make()], 2500);
			const item = tl.scenes[0].items.find((i) => i.kind === kind)!;
			for (const st of STYLES) {
				setActiveStyle(st.id);
				const snap = kitSnap(item, item.start + 400, item.rect.w, item.rect.h)!;
				expect(snap.problems, `${kind} in ${st.id}`).toEqual([]);
				expect(snap.els).toBeGreaterThan(0);
			}
			setActiveStyle('sketch');
		});
		it(`${kind}: a later action with the same id appends to it`, () => {
			const story = one([make()], 2000).story;
			expect(story.beats.length).toBe(1);
		});
	}
});

describe('seq.diagram', () => {
	const {tl} = one([seq()], 3000);
	const item = tl.scenes[0].items[0];
	it('messages animate between actors, one after another, the latest is current', () => {
		const t0 = seqModel(item).msgs[0].t0;
		expect(seqStateAt(item, t0 - 1).msgs.length).toBe(0);
		const mid = seqStateAt(item, t0 + SEQ_ANIM / 2);
		expect(mid.msgs[0].p).toBeCloseTo(0.5, 1);
		expect(mid.current).toBe(0);
		const later = seqStateAt(item, t0 + SEQ_STEP + 2);
		expect(later.msgs.map((m) => m.idx)).toEqual([0, 1]);
		expect(later.current).toBe(1);
		expect(later.msgs[0].p).toBe(1);
	});
	it('FAILS the geometry check when an actor name is wider than its column', () => {
		const bad = one([seq({actors: ['A very long actor name one', 'Another very long actor', 'Third long actor name'], messages: [{from: 'A very long actor name one', to: 'Third long actor name', label: 'x'}]})], 3000);
		const snap = kitSnap(bad.tl.scenes[0].items[0], 100, bad.tl.scenes[0].items[0].rect.w, bad.tl.scenes[0].items[0].rect.h)!;
		expect(snap.problems.join()).toMatch(/wider than its column/);
		const cs = deriveChecks(bad.story, mkAudio(bad.story, 3000)).checks.filter((x) => x.group === 'kit.seq');
		expect(cs.some((c) => /wider than its column/.test(c.pure() ?? ''))).toBe(true);
	});
});

describe('tree', () => {
	const {tl} = one([tree()], 3000);
	const item = tl.scenes[0].items[0];
	it('nodes appear in order and the path is highlighted step by step', () => {
		expect(treeStateAt(item, item.start).nodes.length).toBe(1);
		const later = treeStateAt(item, item.start + 200);
		expect(later.nodes.length).toBe(4);
		expect(later.path).toEqual(['a', 'b', 'd']);
		expect(later.current).toBe('d');
		expect(treeStateAt(item, item.start + 14).path.length).toBeLessThan(3);
	});
	it('the tidy layout puts the parent above its children and nothing overlaps', () => {
		const g = treeLayout(item, item.rect.w, item.rect.h);
		const a = g.boxes.get('a')!;
		const b = g.boxes.get('b')!;
		const c = g.boxes.get('c')!;
		expect(b.y).toBeGreaterThan(a.y);
		expect(a.x + a.w / 2).toBeCloseTo((b.x + b.w / 2 + c.x + c.w / 2) / 2, 0);
	});
	it('file-tree (indent) layout stacks rows', () => {
		const t2 = one([tree({layout: 'indent'})], 3000);
		const it2 = t2.tl.scenes[0].items[0];
		const g = treeLayout(it2, it2.rect.w, it2.rect.h);
		expect(g.indent).toBe(true);
		expect(g.boxes.get('b')!.x).toBeGreaterThan(g.boxes.get('a')!.x);
		expect(g.boxes.get('c')!.y).toBeGreaterThan(g.boxes.get('d')!.y); // depth-first rows: a, b, d, c
	});
	it('FAILS when a path node does not exist', () => {
		const bad = one([tree({path: ['a', 'zzz']})], 3000);
		expect(kitSnap(bad.tl.scenes[0].items[0], 200, 600, 400)!.problems.join()).toMatch(/zzz/);
	});
});

describe('timeline.track', () => {
	const {tl} = one([track()], 3000);
	const item = tl.scenes[0].items[0];
	it('blocks slide in and the playhead moves; blocks under it are active', () => {
		const early = trackStateAt(item, item.start + 2);
		expect(early.blocks[0].p).toBeLessThan(1);
		const late = trackStateAt(item, item.start + 60);
		expect(late.blocks.length).toBe(2);
		expect(late.playhead).toBeGreaterThan(0);
		const end = trackStateAt(item, item.start + 200);
		expect(end.playhead).toBe(80);
		expect(end.active.map((b) => b.label)).toEqual(['zygote']);
	});
	it('FAILS when a block is narrower than its label', () => {
		const bad = one([track({blocks: [{lane: 'CPU 0', start: 0, end: 2, label: 'a long label'}]})], 3000);
		expect(kitSnap(bad.tl.scenes[0].items[0], 200, 600, 400)!.problems.join()).toMatch(/narrower than its label/);
	});
});

describe('packet.flow', () => {
	const {tl} = one([packets()], 5000);
	const item = tl.scenes[0].items[0];
	it('packets move, one is dropped, the retry is delivered', () => {
		const first = packetStateAt(item, item.start + 10);
		expect(first.packets[0].status).toBe('moving');
		const end = packetStateAt(item, item.start + 400);
		expect(end.delivered).toBe(2);
		expect(end.dropped).toBe(1);
		expect(end.packets[1].pos).toBeLessThan(0.6); // a dropped packet never reaches the next node
		expect(end.current?.retry).toBe(true);
	});
	it('FAILS for a packet between unknown or identical nodes', () => {
		const bad = one([packets({packets: [{from: 'A', to: 'A'}]})], 3000);
		expect(kitSnap(bad.tl.scenes[0].items[0], 200, 600, 400)!.problems.join()).toMatch(/starts and ends/);
	});
});

describe('code.editor', () => {
	const {tl} = one([editor()], 4000);
	const item = tl.scenes[0].items[0];
	it('types line after line with a cursor', () => {
		const a = editorStateAt(item, item.start + 4);
		expect(a.typing).toBe(true);
		expect(a.lines[0].typed.length).toBeGreaterThan(0);
		expect(a.lines[0].typed.length).toBeLessThan('int main() {'.length);
		expect(a.cursor?.line).toBe(0);
		const done = editorStateAt(item, item.start + 300);
		expect(done.lines.map((l) => l.typed)).toEqual(['int main() {', '  return 0;', '}']);
		expect(done.typing).toBe(false);
	});
	it('a diff shows + and - lines', () => {
		const d = one([A({do: 'code.editor', id: 'd', file: 'a.c', diff: [' int x;', '- x = 1;', '+ x = 2;']})], 3000);
		const it2 = d.tl.scenes[0].items[0];
		const st = editorStateAt(it2, it2.start + 200);
		expect(st.lines.map((l) => l.op)).toEqual([' ', '-', '+']);
		expect(st.lines[2].typed).toBe('x = 2;');
	});
	it('FAILS when the longest line needs a font below 16 px', () => {
		const bad = one([editor({lines: ['x'.repeat(120)]})], 3000);
		const it2 = bad.tl.scenes[0].items[0];
		expect(editorGeom(it2, it2.rect.w, it2.rect.h).fits).toBe(false);
		expect(kitSnap(it2, 200, it2.rect.w, it2.rect.h)!.problems.join()).toMatch(/font/);
	});
});

describe('chart.plot', () => {
	const {tl} = one([plot()], 3000);
	const item = tl.scenes[0].items[0];
	it('points arrive over time and the head is the latest', () => {
		expect(plotStateAt(item, item.start).count).toBe(1);
		const end = plotStateAt(item, item.start + 100);
		expect(end.count).toBe(4);
		expect(end.series[0].head?.y).toBe(0.5);
	});
});

describe('kits and the reveal scheduler', () => {
	it('a diagram that names things is revealed before the voice names them', () => {
		const s = one([seq()], 3000).story;
		const story = {...s, beats: [{...s.beats[0], text: 'The browser asks DNS first.'}]};
		const {checks, tl} = deriveChecks(story, mkAudio(story, 3000));
		for (const c of checks.filter((x) => x.group === 'sync.voice-after-visual')) expect(c.pure()).toBeNull();
		expect(tl.reveals.length).toBeGreaterThan(0);
		expect(buildTimeline(story, mkAudio(story, 3000)).scenes[0].items[0].kind).toBe('seq');
	});
});
