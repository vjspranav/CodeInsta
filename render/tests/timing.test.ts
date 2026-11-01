import {describe, expect, it} from 'vitest';
import {A, mkAudio, mkStory} from './helpers';
import {buildTimeline, GAPS, HOLD_CAP_MS} from '../src/timeline';
import {validateStory} from '../src/schema';

const ms = (f: number) => (f / 30) * 1000;
const gapAfter = (tl: ReturnType<typeof buildTimeline>, i: number) => ms(tl.beats[i + 1].start - tl.beats[i].holdEnd);

describe('context-aware gaps', () => {
	const tlOf = (beats: Parameters<typeof mkStory>[0]) => {
		const s = mkStory(beats);
		return buildTimeline(s, mkAudio(s, 2000));
	};
	const v = [A({do: 'sketch.box', text: 'x'})];
	it('same speaker 150, speaker change 250', () => {
		const tl = tlOf([{speaker: 'rookie', visuals: v}, {speaker: 'rookie'}, {speaker: 'senior'}]);
		expect(gapAfter(tl, 0)).toBeCloseTo(GAPS.sameSpeaker, -2);
		expect(gapAfter(tl, 1)).toBeCloseTo(GAPS.speakerChange, -2);
	});
	it('question -> answer 300', () => {
		const tl = tlOf([{speaker: 'rookie', text: 'Why is it slow?', visuals: v}, {speaker: 'senior'}]);
		expect(gapAfter(tl, 0)).toBeCloseTo(GAPS.questionAnswer, -2);
	});
	it('punchline 400, layout change 600', () => {
		const tl = tlOf([
			{speaker: 'senior', punchline: true, visuals: v},
			{speaker: 'senior', visuals: [A({do: 'layout', template: 'split'}), ...v]},
			{speaker: 'senior'},
		]);
		expect(gapAfter(tl, 0)).toBeCloseTo(GAPS.layoutChange, -2); // layout change wins
		const tl2 = tlOf([{speaker: 'senior', punchline: true, visuals: v}, {speaker: 'senior'}]);
		expect(gapAfter(tl2, 0)).toBeCloseTo(GAPS.punchline, -2);
	});
});

describe('hold / pause / dwell', () => {
	it('hold_ms is a silent hold after the line; pause_before_ms delays the next line', () => {
		const s = mkStory([{hold_ms: 1000, visuals: [A({do: 'sketch.box', text: 'x'})]}, {pause_before_ms: 600}]);
		const tl = buildTimeline(s, mkAudio(s, 2000));
		expect(ms(tl.beats[0].holdEnd - tl.beats[0].end)).toBeCloseTo(1000, -2);
		expect(ms(tl.beats[1].start - tl.beats[0].holdEnd)).toBeCloseTo(GAPS.sameSpeaker + 600, -2);
	});
	it('explicit hold_ms is capped at 1200 ms', () => {
		const s = mkStory([{hold_ms: 5000, visuals: [A({do: 'sketch.box', text: 'x'})]}, {}]);
		const tl = buildTimeline(s, mkAudio(s, 2000));
		expect(ms(tl.beats[0].holdEnd - tl.beats[0].end)).toBeCloseTo(HOLD_CAP_MS, -2);
	});
	it('a visual that persists into the next beat gets no extra time', () => {
		const rows = Array.from({length: 12}, (_, i) => [i]);
		const s = mkStory([
			{visuals: [A({do: 'db.table', id: 't', name: 't', columns: ['a'], rows})]},
			{visuals: [A({do: 'sketch.note', text: 'y'})]},
		]);
		const tl = buildTimeline(s, mkAudio(s, 800)); // shorter than the 3.6 s a 12-row table needs
		expect(tl.beats[0].holdEnd).toBe(tl.beats[0].end);
	});
	it('a visual that leaves at the end of its beat is extended by the shortfall only', () => {
		const rows = (n: number) => Array.from({length: n}, (_, i) => [i]);
		const leave = A({do: 'clear'});
		// 3 rows -> needs 1500 ms; line is 1100 ms, then a 450 ms layout-change gap: 1550 >= 1500
		let s = mkStory([{visuals: [A({do: 'db.table', id: 't', name: 't', columns: ['a'], rows: rows(3)})]}, {visuals: [leave, A({do: 'sketch.box', text: 'x'})]}]);
		let tl = buildTimeline(s, mkAudio(s, 1100));
		expect(tl.beats[0].holdEnd).toBe(tl.beats[0].end);
		// 10 rows -> 3000 ms; 1000 ms line + 450 ms gap on screen => 1550 ms short
		s = mkStory([{visuals: [A({do: 'db.table', id: 't', name: 't', columns: ['a'], rows: rows(10)})]}, {visuals: [leave, A({do: 'sketch.box', text: 'x'})]}]);
		tl = buildTimeline(s, mkAudio(s, 1000));
		expect(ms(tl.beats[0].holdEnd - tl.beats[0].end)).toBeCloseTo(1550, -2);
		// the table is really on screen for >= its minimum (item start -> scene end)
		const sc = tl.scenes[0];
		expect(ms(sc.end - sc.items[0].start)).toBeGreaterThanOrEqual(2950);
	});
	it('every visual gets at least 1.5 s even when its line is short and it leaves', () => {
		const s = mkStory([{visuals: [A({do: 'sketch.box', text: 'x'})]}, {visuals: [A({do: 'clear'}), A({do: 'sketch.box', text: 'y'})]}, {}]);
		const tl = buildTimeline(s, mkAudio(s, 600));
		const sc = tl.scenes[0];
		expect(ms(sc.end - sc.items[0].start)).toBeGreaterThanOrEqual(1450);
	});
	it('db.join keeps the time its steps need', () => {
		const s = mkStory([{visuals: [A({do: 'db.table', id: 't', name: 't', columns: ['a'], rows: [[1], [2]]}), A({do: 'db.join', steps: [{table: 't', rows: [0], label: 'a'}, {table: 't', rows: [1], label: 'b'}], at: 'end'})]}, {}]);
		const tl = buildTimeline(s, mkAudio(s, 2000));
		expect(ms(tl.beats[0].holdEnd - tl.beats[0].end)).toBeGreaterThanOrEqual(1700);
	});
	it('explicit hold counts toward on-screen time instead of stacking', () => {
		const s = mkStory([{hold_ms: 800, visuals: [A({do: 'sketch.box', text: 'x'})]}, {visuals: [A({do: 'clear'}), A({do: 'sketch.box', text: 'y'})]}]);
		const tl = buildTimeline(s, mkAudio(s, 2000));
		expect(ms(tl.beats[0].holdEnd - tl.beats[0].end)).toBeCloseTo(800, -2);
	});
	it('visuals never fire before their line starts', () => {
		const s = mkStory([{visuals: [A({do: 'sketch.box', text: 'x'})]}, {visuals: [A({do: 'sketch.note', text: 'y', at: 'start'})]}]);
		const tl = buildTimeline(s, mkAudio(s));
		const note = tl.scenes.flatMap((sc) => sc.items).find((i) => i.kind === 'note')!;
		expect(note.start).toBeGreaterThanOrEqual(tl.beats[1].start);
	});
});

describe('schema validation', () => {
	const base = {version: 3, format: 'story', title: 't', topic: 't', level: 'x', cast: [], beats: [{speaker: 'narrator', text: 'hi', visuals: []}]};
	it('first beat needs a visual; later beats may inherit', () => {
		expect(validateStory(base).ok).toBe(false);
		const ok = {...base, beats: [{speaker: 'narrator', text: 'hi', visuals: [{do: 'clear'}]}, {speaker: 'narrator', text: 'again'}]};
		expect(validateStory(ok).ok).toBe(true);
	});
	it('db.table / db.join / db.result props are validated', () => {
		const mk = (v: unknown) => validateStory({...base, beats: [{speaker: 'narrator', text: 'hi', visuals: [v]}]});
		expect(mk({do: 'db.table', id: 't', name: 't', columns: ['a'], rows: [[1]]}).ok).toBe(true);
		expect(mk({do: 'db.table', id: 't', rows: [[1]]}).ok).toBe(false);
		expect(mk({do: 'db.join', steps: [{table: 't', rows: [0], label: 'x'}]}).ok).toBe(true);
		expect(mk({do: 'db.join', steps: []}).ok).toBe(false);
		expect(mk({do: 'db.result', columns: ['a'], rows: [[1]]}).ok).toBe(true);
		expect(mk({do: 'db.result', rows: [[1]]}).ok).toBe(false);
	});
	it('explicit expect entries must point at a beat', () => {
		const bad = {...base, beats: [{speaker: 'narrator', text: 'hi', visuals: [{do: 'clear'}]}], expect: [{beat: 4, kind: 'heart.filled'}]};
		expect(validateStory(bad).ok).toBe(false);
	});
});
