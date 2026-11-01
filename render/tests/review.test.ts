import {describe, expect, it} from 'vitest';
import {A, mkAudio, mkStory} from './helpers';
import {buildTimeline} from '../src/timeline';
import {beatAt, commitStateAt, commitStages} from '../src/state';
import {captionStateAt} from '../src/captionstate';
import {estimateWordTimes} from '../src/sync';
import {endPages} from '../src/endcard';
import {deriveChecks} from '../verify-lib';
import {colWidths, nativeWidth, DATA_PX, buildDbModel} from '../src/dbmodel';

describe('captions follow the word-time estimate', () => {
	it('word reveal frames come from estimateWordTimes (a long word is not revealed on a character fraction)', () => {
		const s = mkStory([{text: 'a refrigerator is cold', visuals: [A({do: 'sketch.note', text: 'x'})]}]);
		const tl = buildTimeline(s, mkAudio(s, 3000));
		const b = tl.beats[0];
		const cs = captionStateAt(b, b.end - 1);
		const t = estimateWordTimes(b.text, (b.dur / 30) * 1000);
		cs.words.forEach((w, i) => expect(w.reveal).toBeCloseTo(b.start + (t[i].start_ms / 1000) * 30 - 1, 5));
	});
});

describe('beatAt', () => {
	it('never returns the old beat once the next one has started (no stale caption overlap)', () => {
		const s = mkStory([{visuals: [A({do: 'sketch.note', text: 'x'})]}, {}]);
		const tl = buildTimeline(s, mkAudio(s, 2000));
		const [a, b] = tl.beats;
		expect(b.start - a.end).toBeLessThan(6); // the 6-frame linger of beat a would overlap beat b
		expect(beatAt(tl, b.start)?.index).toBe(1);
		expect(beatAt(tl, a.end + 1)?.index).toBe(0);
	});
});

describe('commit story', () => {
	it('a future update is not applied early', () => {
		const s = mkStory([
			{visuals: [A({do: 'commit.story', id: 'c', repo: 'StagOS/a', title: 'first', broke: 'it broke'})]},
			{visuals: [A({do: 'commit.story', id: 'c', repo: 'StagOS/a', title: 'second', fix: 'the fix'})]},
		]);
		const tl = buildTimeline(s, mkAudio(s, 2000));
		const it = tl.scenes[0].items[0];
		const early = tl.beats[1].start - 5;
		expect(commitStages(it, early).title).toBe('first');
		expect(commitStages(it, early).text.fix).toBeUndefined();
		expect(commitStateAt(it, early).stages).toEqual(['broke']);
		expect(commitStages(it, tl.beats[1].start + 1).title).toBe('second');
	});
});

describe('end card shows the whole glossary', () => {
	it('more than 8 entries are paginated, none dropped', () => {
		const glossary = Array.from({length: 14}, (_, i) => ({term: `T${i}`, full: `Term number ${i} spelled out in full here`, note: 'a short note that explains it'}));
		const s = mkStory([{visuals: [A({do: 'sketch.note', text: 'x'})]}], {glossary});
		const pages = endPages(s);
		expect(pages.length).toBeGreaterThan(1);
		expect(pages.flatMap((p) => p.blocks.filter((b) => b.kind === 'g').map((b) => b.term))).toEqual(glossary.map((g) => g.term));
		const tl = buildTimeline(s, mkAudio(s, 2000));
		expect(tl.endCard.frames).toBe(pages.reduce((a, p) => a + p.frames, 0));
		const {checks} = deriveChecks(s, mkAudio(s, 2000));
		expect(checks.filter((c) => c.group === 'endcard').length).toBe(pages.length);
		expect(checks.filter((c) => c.group === 'endcard').every((c) => c.pure() === null)).toBe(true);
	});
});

describe('answer.early', () => {
	it('FAILS when a question shows the number that the next line answers', () => {
		const s = mkStory([
			{text: 'How many opens per second?', visuals: [A({do: 'sketch.box', id: 'o', text: 'App opens', sub: '~100,000 / sec'})]},
			{text: 'A hundred thousand.', visuals: [A({do: 'sketch.note', text: 'x'})]},
		]);
		const c = deriveChecks(s, mkAudio(s, 2500)).checks.find((x) => x.group === 'answer.early')!;
		expect(c.pure()).toContain('100,000');
	});
	it('passes when the answer appears with the answer line', () => {
		const s = mkStory([
			{text: 'How many opens per second?', visuals: [A({do: 'sketch.box', id: 'o', text: 'App opens'})]},
			{text: 'A hundred thousand.', visuals: [A({do: 'sketch.box', id: 'o', sub: '~100,000 / sec'})]},
		]);
		expect(deriveChecks(s, mkAudio(s, 2500)).checks.find((x) => x.group === 'answer.early')!.pure()).toBeNull();
	});
});

describe('table metrics', () => {
	it('data is 22 px natively and every column fits its widest cell', () => {
		expect(DATA_PX).toBeGreaterThanOrEqual(22);
		const m = buildDbModel([{frame: 0, action: A({do: 'db.table', id: 't', name: 'posts', columns: ['id', 'author_id', 'caption'], rows: [[9981, 7, 'sunrise hike'], [9977, 12, 'a much longer caption here']]})}]);
		const t = m.tables[0];
		const w = colWidths(t);
		expect(w.reduce((a, b) => a + b, 0) + 24).toBeCloseTo(nativeWidth(t), 3);
		expect(w[2]).toBeGreaterThan(w[0]);
	});
});
