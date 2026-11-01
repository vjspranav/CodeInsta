import {describe, expect, it} from 'vitest';
import {A, mkAudio, mkStory, one} from './helpers';
import {buildTimeline} from '../src/timeline';
import {
	boxStateAt,
	cacheStateAt,
	codeStateAt,
	commitStateAt,
	defineAt,
	layoutProblems,
	sceneAt,
	termStateAt,
	visibleAt,
} from '../src/state';
import {defineBox} from '../src/components/Overlays';

describe('layout / clear / focus', () => {
	it('layout starts a new scene with that template', () => {
		const story = mkStory([
			{visuals: [A({do: 'layout', template: 'board-full'}), A({do: 'sketch.box', text: 'a'})]},
			{visuals: [A({do: 'layout', template: 'split'}), A({do: 'sketch.box', text: 'b'})]},
		]);
		const tl = buildTimeline(story, mkAudio(story));
		expect(tl.scenes.map((s) => s.layout)).toEqual(['board-full', 'split']);
		expect(tl.scenes[0].end).toBe(tl.scenes[1].start);
	});
	it('clear empties the board but keeps the layout', () => {
		const story = mkStory([
			{visuals: [A({do: 'layout', template: 'split'}), A({do: 'sketch.box', text: 'a'})]},
			{visuals: [A({do: 'clear'}), A({do: 'sketch.note', text: 'n'})]},
		]);
		const tl = buildTimeline(story, mkAudio(story));
		expect(tl.scenes).toHaveLength(2);
		expect(tl.scenes[1].layout).toBe('split');
		expect(tl.scenes[1].items.map((i) => i.kind)).toEqual(['note']);
	});
	it('focus is recorded per scene', () => {
		const {tl} = one([A({do: 'sketch.box', id: 'x', text: 'a'}), A({do: 'focus', target: 'x', at: 0.5})]);
		expect(tl.scenes[0].focus[0].id).toBe('x');
	});
	it.each(['board-full', 'db-focus', 'split', 'phone-left+board-right'])('%s: items never overlap or leave the safe area', (template) => {
		const visuals = [
			A({do: 'layout', template}),
			A({do: 'sketch.box', text: 'One'}),
			A({do: 'sketch.box', text: 'Two with a longer label that wraps'}),
			A({do: 'sketch.note', text: 'a note'}),
			A({do: 'cache.miss', key: 'k'}),
			A({do: 'code.show', code: ['a', 'b', 'c']}),
			A({do: 'term.type', cmd: 'ls', out: ['x', 'y']}),
			A({do: 'commit.story', repo: 'a/b', broke: 'x', fix: 'y', why: 'z'}),
		];
		if (template === 'db-focus') visuals.push(A({do: 'db.table', id: 't', name: 't', columns: ['a'], rows: [['1']]}));
		if (template.startsWith('phone')) visuals.push(A({do: 'phone.show'}));
		const {tl} = one(visuals);
		expect(tl.scenes.length).toBeGreaterThan(0);
		for (const sc of tl.scenes) expect(layoutProblems(sc)).toEqual([]);
	});
	it('too many items paginate into extra scenes instead of overflowing', () => {
		const vs = Array.from({length: 14}, (_, i) => A({do: 'sketch.box', text: `box ${i}`, at: i / 14}));
		const {tl} = one(vs, 9000);
		expect(tl.scenes.length).toBeGreaterThan(1);
		for (const sc of tl.scenes) expect(layoutProblems(sc)).toEqual([]);
	});
});

describe('sketch.box / note / arrow', () => {
	it('appears at its trigger frame and never before', () => {
		const {tl} = one([A({do: 'sketch.box', text: 'hello', at: 0.5})]);
		const it = tl.scenes[0].items[0];
		expect(boxStateAt(it, it.start - 1).visible).toBe(false);
		expect(boxStateAt(it, it.start).visible).toBe(true);
		expect(boxStateAt(it, it.start).text).toBe('hello');
		expect(visibleAt(tl, it.start - 1)).toHaveLength(0);
	});
	it('arrow defaults to the last two boxes and carries its label', () => {
		const {tl} = one([A({do: 'sketch.box', text: 'a'}), A({do: 'sketch.box', text: 'b'}), A({do: 'sketch.arrow', label: 'go'})]);
		const ar = tl.scenes[0].arrows[0];
		expect(ar.from).toBe(tl.scenes[0].items[0].key);
		expect(ar.to).toBe(tl.scenes[0].items[1].key);
		expect(ar.label).toBe('go');
	});
});

describe('cache.hit / cache.miss', () => {
	it('stamps after the request and keeps merging into one box', () => {
		const {tl} = one([A({do: 'cache.miss', id: 'c', key: 'feed:42'}), A({do: 'cache.hit', id: 'c', at: 0.6})]);
		const items = tl.scenes[0].items;
		expect(items).toHaveLength(1);
		const it = items[0];
		expect(cacheStateAt(it, it.start + 3)).toMatchObject({result: 'miss', stamped: false});
		expect(cacheStateAt(it, it.start + 20)).toMatchObject({result: 'miss', stamped: true, filled: false});
		const hit = it.updates[0].frame;
		expect(cacheStateAt(it, hit + 20)).toMatchObject({result: 'hit', stamped: true, filled: true});
	});
});

describe('term.type / code.show / commit.story', () => {
	it('terminal types the command then prints output', () => {
		const {tl} = one([A({do: 'term.type', cmd: 'adb logcat', out: ['line 1', 'line 2']})]);
		const it = tl.scenes[0].items[0];
		expect(termStateAt(it, it.start + 1).lines[0].length).toBeLessThan('adb logcat'.length);
		expect(termStateAt(it, it.start + 40).lines).toEqual(['adb logcat', 'line 1', 'line 2']);
	});
	it('code lines appear one after another', () => {
		const {tl} = one([A({do: 'code.show', title: 'f.ts', code: ['a', 'b', 'c']})]);
		const it = tl.scenes[0].items[0];
		expect(codeStateAt(it, it.start + 14).lines).toEqual(['a']);
		expect(codeStateAt(it, it.start + 60).lines).toEqual(['a', 'b', 'c']);
		expect(codeStateAt(it, it.start + 60).title).toBe('f.ts');
	});
	it('commit story reveals broke -> fix -> why in order', () => {
		const {tl} = one([A({do: 'commit.story', repo: 'StagOS/x', broke: 'b', fix: 'f', why: 'w'})]);
		const it = tl.scenes[0].items[0];
		expect(commitStateAt(it, it.start).stages).toEqual(['broke']);
		expect(commitStateAt(it, it.start + 31).stages).toEqual(['broke', 'fix']);
		expect(commitStateAt(it, it.start + 61).stages).toEqual(['broke', 'fix', 'why']);
	});
});

describe('define', () => {
	it('is visible for its window with the glossary text', () => {
		const {tl} = one([A({do: 'define', term: 'POP', at: 0.5})]);
		const d = tl.defines[0];
		expect(d.full).toBe('Point of Presence');
		expect(defineAt(tl, d.frame - 1)).toBeUndefined();
		expect(defineAt(tl, d.frame + 10)).toBe(d);
	});
	it('wraps long text instead of truncating it', () => {
		const b = defineBox({
			term: 'POP',
			full: 'Point of Presence: the nearby data centre that keeps copies of your files',
			note: 'also called an edge location',
		});
		expect(b.lines.length).toBeLessThanOrEqual(2);
		expect(b.lines.join(' ')).toContain('copies of your files');
		expect(b.size).toBeGreaterThanOrEqual(22); // labels are never shrunk below 22 px
		expect(b.complete).toBe(true);
	});
	it('text too long for the 22 px label minimum needs >2 lines (the QA gate fails it)', () => {
		const b = defineBox({
			term: 'POP',
			full: 'Point of Presence: the nearby data centre where the content delivery network keeps copies of all of your files',
			note: 'also called an edge location',
		});
		expect(b.size).toBe(22);
		expect(b.lines.length).toBeGreaterThan(2);
	});
});

describe('scene helpers', () => {
	it('sceneAt returns the scene covering a frame', () => {
		const {tl} = one([A({do: 'sketch.box', text: 'a'})]);
		expect(sceneAt(tl, tl.beats[0].start + 5)).toBe(tl.scenes[0]);
	});
});
