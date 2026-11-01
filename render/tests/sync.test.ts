import {describe, expect, it} from 'vitest';
import {A, mkAudio, mkStory} from './helpers';
import {numberWords, estimateWordTimes, lineTokens, matchToken, numMatches, spokenNumbers, visualTokens} from '../src/sync';
import {buildTimeline, planBeat} from '../src/timeline';
import {deriveChecks} from '../verify-lib';
import {visibleAt} from '../src/state';

const words = (s: string) => s.split(/\s+/);

describe('estimateWordTimes', () => {
	it('spans the line from ~0 ms to its duration, in order', () => {
		const t = estimateWordTimes('Forty-eight hundred active queries. It is on fire.', 3000);
		expect(t[0].start_ms).toBe(0);
		expect(t[t.length - 1].end_ms).toBeLessThanOrEqual(3000);
		expect(t[t.length - 1].end_ms).toBeGreaterThan(2500);
		for (let i = 1; i < t.length; i++) expect(t[i].start_ms).toBeGreaterThanOrEqual(t[i - 1].end_ms - 1e-6);
	});
	it('weights words by spoken length: long words take longer, digits are expanded', () => {
		const t = estimateWordTimes('a refrigerator 4812 x', 4000);
		const d = (i: number) => t[i].end_ms - t[i].start_ms;
		expect(d(1)).toBeGreaterThan(d(0) * 2);
		expect(d(2)).toBeGreaterThan(d(1)); // "four thousand eight hundred twelve" is longer than "refrigerator"
	});
	it('punctuation adds a pause after the word', () => {
		const t = estimateWordTimes('Stop. Go', 2000);
		expect(t[1].start_ms).toBeGreaterThan(t[0].end_ms);
	});
});

describe('spoken numbers', () => {
	const n = (s: string) => spokenNumbers(words(s)).map((x) => x.value);
	it('parses spelled numbers and digits', () => {
		expect(numberWords(4812)).toBe('four thousand eight hundred twelve');
		expect(n('Forty-eight hundred active queries')).toEqual([4800]);
		expect(n('a hundred thousand opens')).toEqual([100000]);
		expect(n('Six hundred million followers')).toEqual([600000000]);
		expect(n('user forty-two and twenty one')).toEqual([42, 21]);
		expect(n('one two')).toEqual([1, 2]);
		expect(n('about 4,812 of them')).toEqual([4812]);
	});
	it('"forty-eight hundred" names 4812 and 4,812; exact numbers match exactly', () => {
		expect(numMatches(4800, 4812)).toBe(true);
		expect(numMatches(4800, 4900)).toBe(false);
		expect(numMatches(42, 42)).toBe(true);
		expect(numMatches(42, 43)).toBe(false);
		const line = lineTokens('Forty-eight hundred active queries.', 2000);
		const vt = visualTokens(A({do: 'sketch.note', text: 'now 4,812 active'}) as never);
		expect(vt.some((v) => v.kind === 'num' && v.value === 4812)).toBe(true);
		expect(matchToken(vt.find((v) => v.kind === 'num')!, line)?.startMs).toBe(0);
	});
	it('identifiers and names are matched by words', () => {
		const line = lineTokens('The follower ID lives in the users table, next to Postgres.', 4000);
		const id = visualTokens(A({do: 'code.show', code: ['WHERE follower_id = 1']}) as never).find((v) => v.kind === 'id')!;
		expect(matchToken(id, line)).toBeDefined();
		const nm = visualTokens(A({do: 'sketch.box', text: 'Postgres'}) as never).find((v) => v.kind === 'name')!;
		expect(matchToken(nm, line)).toBeDefined();
		expect(matchToken(visualTokens(A({do: 'sketch.box', text: 'Memcached'}) as never)[0], line)).toBeUndefined();
	});
});

const group = (checks: ReturnType<typeof deriveChecks>['checks'], g: string) => checks.filter((c) => c.group === g);
const lateNumber = (extra: Record<string, unknown> = {}) =>
	mkStory([
		{text: 'Check the dashboard now.', visuals: [A({do: 'sketch.note', text: 'dashboard'})]},
		{text: 'We have a hundred thousand opens a second.', visuals: [A({do: 'sketch.note', text: '100,000 opens', at: 0.9, ...extra})]},
	]);

describe('sync.voice-after-visual', () => {
	it('FAILS when the number is revealed after the word is spoken', () => {
		const s = lateNumber();
		const {checks} = deriveChecks(s, mkAudio(s, 3000), {autoReveal: false});
		const sync = group(checks, 'sync.voice-after-visual');
		expect(sync.length).toBe(1);
		const msg = sync[0].pure();
		expect(msg).toContain('100,000');
		expect(msg).toMatch(/need 150/);
	});
	it('passes once the scheduler reveals it >= 250 ms before the word', () => {
		const s = lateNumber();
		const audio = mkAudio(s, 3000);
		const {checks, tl} = deriveChecks(s, audio);
		expect(group(checks, 'sync.voice-after-visual')[0].pure()).toBeNull();
		const r = tl.reveals.find((x) => x.beat === 1)!;
		const spoken = tl.beats[1].start + (lineTokens(s.beats[1].text, 3000).find((t) => t.kind === 'num')!.startMs / 1000) * 30;
		expect((spoken - r.frame) / 30).toBeGreaterThanOrEqual(0.25 - 1 / 30);
	});
	it('a number that is the first word still gets its lead (the gap before the line grows)', () => {
		const s = mkStory([
			{text: 'Ready.', visuals: [A({do: 'sketch.note', text: 'ready'})]},
			{text: 'Forty-eight hundred active queries on the box.', visuals: [A({do: 'sketch.note', text: '4812 active'})]},
		]);
		const audio = mkAudio(s, 2500);
		const tl = buildTimeline(s, audio);
		const plan = planBeat(s.beats[1], 2500);
		expect(plan.atMs[0]).toBeLessThanOrEqual(-250);
		expect((tl.beats[1].start - tl.beats[0].holdEnd) / 30).toBeGreaterThanOrEqual(0.25);
		expect(group(deriveChecks(s, audio).checks, 'sync.voice-after-visual')[0].pure()).toBeNull();
	});
	it('default reveals (no matching token) keep their `at`', () => {
		const s = mkStory([{text: 'Nothing named here.', visuals: [A({do: 'sketch.note', text: 'a note', at: 0.6})]}]);
		expect(planBeat(s.beats[0], 3000).atMs).toEqual([1800]);
		expect(group(deriveChecks(s, mkAudio(s, 3000)).checks, 'sync.voice-after-visual').length).toBe(0);
	});
	it('catches a terminal still typing when a later line names its output (the "4812" bug)', () => {
		const cmd = "psql -c \"SELECT count(*) FROM pg_stat_activity WHERE state = 'active';\"";
		const s = mkStory([
			{text: 'Check the database.', visuals: [A({do: 'term.type', id: 'psql', cmd, out: [' count', ' -----', '  4812']})]},
			{text: 'Forty-eight hundred active queries. Ouch.'},
		]);
		const audio = {lines: [{beat_index: 0, speaker: 'narrator', src: 'a', duration_ms: 1200}, {beat_index: 1, speaker: 'narrator', src: 'b', duration_ms: 3000}]};
		const bad = group(deriveChecks(s, audio, {autoReveal: false}).checks, 'sync.voice-after-visual');
		expect(bad.length).toBe(1);
		expect(bad[0].pure()).toContain('4812');
		const {checks, tl} = deriveChecks(s, audio);
		expect(group(checks, 'sync.voice-after-visual')[0].pure()).toBeNull();
		expect(tl.reveals[0].termProps?.cpf).toBeLessThan(1.5); // typing was sped up
	});
});

describe('scene.persist', () => {
	it('a beat with no visuals keeps the previous scene (passes)', () => {
		const s = mkStory([
			{visuals: [A({do: 'sketch.box', id: 'q', text: 'the query'})]},
			{text: 'Famous last words.'},
		]);
		const {checks, tl} = deriveChecks(s, mkAudio(s, 2500));
		const c = group(checks, 'scene.persist');
		expect(c.length).toBe(1);
		expect(c[0].pure()).toBeNull();
		const keys = (f: number) => visibleAt(tl, f).map((v) => v.key);
		expect(keys(tl.beats[1].end - 2)).toEqual(keys(tl.beats[0].end - 2));
	});
	it('FAILS when a beat with nothing new shows a different scene (the query left before "Famous last words")', () => {
		const s = mkStory([
			{visuals: [A({do: 'sketch.box', id: 'q', text: 'the query'})]},
			{text: 'Famous last words.'},
		]);
		const {checks, tl} = deriveChecks(s, mkAudio(s, 2500));
		const c = group(checks, 'scene.persist');
		expect(c[0].pure()).toBeNull();
		// simulate a renderer that clears the scene when the reaction beat starts
		tl.scenes[0].end = tl.beats[1].start + 1;
		expect(c[0].pure()).toMatch(/instead of/);
		// ... or one that swaps it for a different element
		tl.scenes.push({...tl.scenes[0], index: 1, start: tl.beats[1].start, end: tl.beatsEnd + 50, items: [{...tl.scenes[0].items[0], key: 'other'}]});
		expect(c[0].pure()).toMatch(/instead of|empty/);
	});
	it('a layout-only reaction beat does not wipe the previous scene', () => {
		const s = mkStory([
			{visuals: [A({do: 'sketch.box', id: 'q', text: 'the query'})]},
			{text: 'Famous last words.', visuals: [A({do: 'layout', template: 'phone-left+board-right'})]},
		]);
		const {checks} = deriveChecks(s, mkAudio(s, 2500));
		expect(group(checks, 'scene.persist')[0].pure()).toBeNull();
	});
	it('layout `keep` carries an item into the new scene so the query stays up', () => {
		const s = mkStory([
			{visuals: [A({do: 'sketch.box', id: 'q', text: 'the query'})]},
			{text: 'One join per open.', visuals: [A({do: 'layout', template: 'phone-left+board-right', keep: ['q']}), A({do: 'phone.show'})]},
			{text: 'Famous last words.'},
		]);
		const {checks, tl} = deriveChecks(s, mkAudio(s, 2500));
		expect(group(checks, 'scene.persist')[0].pure()).toBeNull();
		const kinds = (f: number) => visibleAt(tl, f).map((v) => v.kind).sort();
		expect(kinds(tl.beats[2].end - 2)).toEqual(['box', 'phone']);
		expect(group(checks, 'beat.visual').every((c) => c.pure() === null)).toBe(true);
	});
});
