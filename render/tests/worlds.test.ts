import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {A, mkAudio, mkStory} from './helpers';
import {ACTION_KINDS, validateStory} from '../src/schema';
import type {Story} from '../src/schema';
import {buildTimeline} from '../src/timeline';
import {layoutProblems} from '../src/state';
import {CONTENT} from '../src/theme';
import {deriveChecks} from '../verify-lib';
import {isSignatureAction, PRIMARY_WORLD_IDS, registryProblems, WORLD_ACTION_KINDS, WORLDS, worldStateOf} from '../src/worlds';
import type {AnyWorld} from '../src/worlds';
import {varietyStats} from '../src/variety';
import type {TermState} from '../src/worlds/term-session/model';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const SET = {do: 'world.set', world: 'term.session', cwd: '~/app'};
const RUN = (cmd: string, extra: Record<string, unknown> = {}) => ({do: 'term.run', cmd, ...extra});
const base = (beats: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
	version: 3,
	format: 'story',
	title: 't',
	topic: 't',
	level: 'beginner',
	cast: [{id: 'dev', name: 'Dev', role: 'engineer', color: '#E4572E'}],
	beats: beats.map((b) => ({speaker: 'narrator', text: 'A line of speech here.', visuals: [], ...b})),
	...extra,
});
const errs = (input: unknown) => {
	const v = validateStory(input);
	return v.ok ? [] : v.errors;
};
const gate = (s: Story, ms = 3000) => deriveChecks(s, mkAudio(s, ms));
const group = (s: Story, g: string, ms = 3000) => gate(s, ms).checks.filter((c) => c.group === g);

describe('world registry', () => {
	it('is consistent and adds its kinds to the schema', () => {
		expect(registryProblems(ACTION_KINDS)).toEqual([]);
		expect(WORLD_ACTION_KINDS).toEqual(expect.arrayContaining(['term.run', 'term.out', 'term.exit', 'term.clear', 'term.highlight']));
		expect(PRIMARY_WORLD_IDS).toEqual(expect.arrayContaining(['phone', 'db', 'term.session']));
		for (const w of WORLDS) expect(typeof w.View).toBe('function');
	});
	it('rejects clashing kinds, prefixes and ids', () => {
		const bad = {...WORLDS[0], id: 'phone', prefix: 'term.', actions: ['term.type', 'other.x'], signature: ['nope']} as AnyWorld;
		WORLDS.push(bad);
		try {
			const p = registryProblems(ACTION_KINDS).join('\n');
			expect(p).toMatch(/reserved/);
			expect(p).toMatch(/prefix "term\." is used by another world/);
			expect(p).toMatch(/"term\.type" clashes with a built-in/);
			expect(p).toMatch(/"other\.x" does not start with "term\."/);
			expect(p).toMatch(/signature "nope"/);
		} finally {
			WORLDS.pop();
		}
	});
	it('signature actions: built-in phone / db state changes and world-declared ones', () => {
		expect(isSignatureAction(A({do: 'phone.tap', target: 'heart'}))).toBe(true);
		expect(isSignatureAction(A({do: 'cache.miss'}))).toBe(true);
		expect(isSignatureAction(A({do: 'sketch.note', text: 'x'}))).toBe(false);
		expect(isSignatureAction(A({do: 'term.run', cmd: 'false', exit: 1}))).toBe(true);
		expect(isSignatureAction(A({do: 'term.run', cmd: 'true', exit: 0}))).toBe(false);
	});
});

describe('schema: worlds and cast', () => {
	it('validates world.set, world actions and the declared primary world', () => {
		expect(errs(base([{visuals: [SET, RUN('ls')]}], {world: 'term.session'}))).toEqual([]);
		expect(errs(base([{visuals: [{do: 'world.set', world: 'nope'}]}])).join()).toMatch(/world\.set needs "world"/);
		expect(errs(base([{visuals: [{do: 'sketch.note', text: 'x'}, RUN('ls')]}])).join()).toMatch(/needs the term\.session world on screen/);
		expect(errs(base([{visuals: [SET]}, {visuals: [{do: 'layout', template: 'board-full'}, RUN('ls')]}])).join()).toMatch(/a layout leaves the world/);
		expect(errs(base([{visuals: [SET, {do: 'term.run'}]}])).join()).toMatch(/needs "cmd"/);
		expect(errs(base([{visuals: [SET, {do: 'db.table', name: 't', columns: ['a'], rows: [[1]]}]}])).join()).toMatch(/cannot share the term\.session world/);
		expect(errs(base([{visuals: [{do: 'layout', template: 'world'}, {do: 'sketch.note', text: 'x'}]}])).join()).toMatch(/opened by world\.set/);
		expect(errs(base([{visuals: [{do: 'sketch.note', text: 'x'}]}], {world: 'marsrover'})).join()).toMatch(/not a registered world/);
		expect(errs(base([{visuals: [{do: 'sketch.note', text: 'x'}]}], {world: 'term.session'})).join()).toMatch(/never puts it on screen/);
		expect(errs(base([{visuals: [{do: 'sketch.note', text: 'x'}]}], {world: 'phone'}))).toEqual([]);
		// clear keeps the world on screen
		expect(errs(base([{visuals: [SET]}, {visuals: [{do: 'clear'}, RUN('ls')]}]))).toEqual([]);
	});
	it('allows 0 to 4 cast members and warns about silent ones', () => {
		const cast = (n: number) => Array.from({length: n}, (_, i) => ({id: `c${i}`, name: `C${i}`, role: 'r', color: '#E4572E'}));
		const speaking = (n: number) => Array.from({length: Math.max(1, n)}, (_, i) => ({speaker: n ? `c${i}` : 'narrator', text: 'Hello there.', visuals: i === 0 ? [{do: 'sketch.note', text: 'x'}] : []}));
		for (const n of [0, 1, 2, 3, 4]) expect(errs({...base([]), cast: cast(n), beats: speaking(n)}), `cast ${n}`).toEqual([]);
		expect(errs({...base([]), cast: cast(5), beats: speaking(5)}).join()).toMatch(/at most 4/);
		const v = validateStory({...base([{visuals: [{do: 'sketch.note', text: 'x'}]}]), cast: cast(2)});
		expect(v.ok && v.warnings.join()).toMatch(/never speaks/);
	});
});

describe('timeline: world scenes', () => {
	it('world.set opens a full-frame world scene; board items share a bottom strip', () => {
		const s = mkStory([{visuals: [A(SET), A(RUN('ls -l', {out: ['total 0']}))]}, {visuals: [A({do: 'sketch.note', text: 'rwx'})]}]);
		const tl = buildTimeline(s, mkAudio(s));
		expect(tl.scenes).toHaveLength(1);
		const sc = tl.scenes[0];
		expect(sc.layout).toBe('world');
		const w = sc.items.find((i) => i.kind === 'world')!;
		const note = sc.items.find((i) => i.kind === 'note')!;
		expect(w.rect.y).toBe(CONTENT.y);
		expect(w.rect.x).toBe(CONTENT.x);
		expect(note.rect.y).toBeGreaterThan(w.rect.y + w.rect.h);
		expect(layoutProblems(sc)).toEqual([]);
		expect(tl.worlds).toHaveLength(1);
		expect(tl.worlds[0].events.map((e) => e.action.do)).toEqual(['world.set', 'term.run']);
		expect(tl.reveals.find((r) => r.do === 'term.run')?.item).toBe(w);
	});
	it('a world keeps its state across scenes; clear keeps the world on screen', () => {
		const s = mkStory([
			{visuals: [A(SET), A(RUN('echo hi', {out: ['hi']}))]},
			{visuals: [A({do: 'layout', template: 'board-full'}), A({do: 'sketch.box', text: 'stdout'})]},
			{visuals: [A(SET), A(RUN('echo again', {out: ['again']}))]},
			{visuals: [A({do: 'clear'}), A({do: 'sketch.note', text: 'n'})]},
		]);
		const tl = buildTimeline(s, mkAudio(s));
		expect(tl.scenes.map((x) => x.layout)).toEqual(['world', 'board-full', 'world', 'world']);
		const back = tl.scenes[2].items.find((i) => i.kind === 'world')!;
		const st = worldStateOf(tl, back, tl.scenes[2].end - 1) as TermState;
		expect(st.rows.map((r) => r.text)).toEqual(expect.arrayContaining(['echo hi', 'hi', 'echo again', 'again']));
		expect(tl.scenes[3].items.some((i) => i.kind === 'world')).toBe(true);
	});
	it('world tokens drive reveal scheduling: output named in the line is on screen before the word', () => {
		const run = A(RUN('wc -c big.bin', {out: ['4812 big.bin']}));
		const ok = mkStory([{text: 'She counts the bytes, and the file turns out to be 4812 bytes long.', visuals: [A(SET), run]}]);
		const checks = group(ok, 'sync.voice-after-visual', 4000);
		expect(checks.length).toBeGreaterThan(0);
		for (const c of checks) expect(c.pure()).toBeNull();
		// spoken before the command can even finish typing: the gate says so
		const early = mkStory([{text: 'It is 4812 bytes, see?', visuals: [A(SET), run]}]);
		expect(group(early, 'sync.voice-after-visual', 2500)[0].pure()).toMatch(/"4812" \(term\.run from beat 0\) is visible/);
	});
});

describe('QA gate: world checks and the variety gate', () => {
	const worldReel = (extra: Partial<Story> = {}) =>
		mkStory(
			[
				{visuals: [A(SET), A(RUN('git push', {out: [' ! [rejected]  main -> main (fetch first)'], exit: 1}))]},
				{visuals: [A({do: 'term.highlight', match: 'fetch first'})]},
				{visuals: []},
			],
			{world: 'term.session', ...extra},
		);

	it('world checks pass on a sound terminal and catch a highlight that matches nothing', () => {
		const ok = group(worldReel(), 'world.term.session');
		expect(ok.length).toBeGreaterThan(1);
		for (const c of ok) expect(c.pure(), c.desc).toBeNull();
		const bad = mkStory([{visuals: [A(SET), A(RUN('ls')), A({do: 'term.highlight', at: 0.5, match: 'nothing like this'})]}]);
		expect(group(bad, 'world.term.session').some((c) => /matches no row/.test(c.pure() ?? ''))).toBe(true);
	});
	it('world checks catch commands typed over streaming output', () => {
		const s = mkStory([{visuals: [A(SET), A(RUN('make', {out: Array.from({length: 12}, (_, i) => `cc ${i}.c`), line_ms: 600})), A(RUN('ls', {at: 0.3}))]}]);
		expect(group(s, 'world.term.session').some((c) => /still printing/.test(c.pure() ?? ''))).toBe(true);
	});
	it('a world reel passes world.primary, notes.share and signature', () => {
		const s = worldReel();
		for (const g of ['world.primary', 'notes.share', 'signature']) {
			const c = group(s, g);
			expect(c).toHaveLength(1);
			expect(c[0].pure(), g).toBeNull();
		}
		const vs = varietyStats(s, buildTimeline(s, mkAudio(s)));
		expect(vs.share['term.session']).toBeGreaterThan(0.9);
		expect(vs.signatures.map((x) => x.do)).toEqual(['term.run']);
	});
	it('world.primary fails when the declared world is on screen for less than half the runtime', () => {
		const s = mkStory(
			[
				{visuals: [A(SET), A(RUN('false', {exit: 1}))]},
				{visuals: [A({do: 'layout', template: 'board-full'}), A({do: 'sketch.box', text: 'a'}), A({do: 'code.show', code: 'x = 1'})]},
				{visuals: []},
				{visuals: []},
			],
			{world: 'term.session'},
		);
		expect(group(s, 'world.primary')[0].pure()).toMatch(/only \d+%/);
	});
	it('notes.share fails when whiteboard notes take more than a third', () => {
		const s = mkStory(
			[
				{visuals: [A({do: 'phone.show'}), A({do: 'phone.tap', target: 'heart'})]},
				{visuals: [A({do: 'layout', template: 'board-full'}), A({do: 'sketch.note', text: 'a'})]},
				{visuals: [A({do: 'sketch.box', text: 'b'})]},
			],
			{world: 'phone'},
		);
		expect(group(s, 'notes.share')[0].pure()).toMatch(/notes-only screens take/);
		expect(group(s, 'signature')[0].pure()).toBeNull();
	});
	it('signature fails when nothing changes state', () => {
		const s = mkStory([{visuals: [A(SET), A(RUN('true'))]}, {visuals: []}], {world: 'term.session'});
		expect(group(s, 'signature')[0].pure()).toMatch(/no signature/);
	});
	it('scripts without a declared world are reported, not gated', () => {
		const s = mkStory([{visuals: [A({do: 'sketch.note', text: 'a'})]}, {visuals: []}]);
		for (const g of ['world.primary', 'notes.share', 'signature']) {
			const c = group(s, g)[0];
			expect(c.pure()).toBeNull();
			expect(c.desc).toMatch(/reported, not gated/);
		}
	});
});

describe('content', () => {
	const load = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
	it('every launch script still validates', () => {
		const dir = path.join(root, 'content', 'launch');
		for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
			expect(errs(load(`content/launch/${f}`)), f).toEqual([]);
		}
	});
	it('the term.session demo passes every pure check of the gate, variety included', () => {
		const v = validateStory(load('content/lab-v3/worlds/term-session.json'));
		if (!v.ok) throw new Error(v.errors.join('; '));
		const s = v.story;
		// the silent fixture timing (fixtures/make-audio.mjs): 62 ms per character, at least 1.4 s
		const audio = {lines: s.beats.map((b, i) => ({beat_index: i, speaker: b.speaker, src: `b${i}.wav`, duration_ms: Math.max(1400, Math.round((b.say ?? b.text).length * 62))}))};
		const {checks, tl} = deriveChecks(s, audio);
		const failed = checks.map((c) => [c.group, c.pure()] as const).filter(([, r]) => r);
		expect(failed).toEqual([]);
		expect(checks.some((c) => c.group === 'world.term.session')).toBe(true);
		const secs = tl.endCard.start / 30;
		expect(secs).toBeGreaterThanOrEqual(60);
		expect(secs).toBeLessThanOrEqual(75);
	});
});
