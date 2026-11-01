import {describe, expect, it} from 'vitest';
import {A, mkAudio, mkStory} from './helpers';
import {deriveChecks} from '../verify-lib';
import {emojiProblems} from '../src/noemoji';
import {validateStory} from '../src/schema';

const gate = (s: ReturnType<typeof mkStory>) => deriveChecks(s, mkAudio(s, 2000)).checks.filter((c) => c.group === 'no.emoji');

describe('QA gate: no.emoji', () => {
	it('passes a clean script (arrows are typography)', () => {
		const s = mkStory([{text: 'Data flows → here ↓.', visuals: [A({do: 'sketch.note', text: 'a ← b'})]}]);
		const c = gate(s);
		expect(c).toHaveLength(1);
		expect(c[0].pure()).toBeNull();
	});
	it.each([
		['beat text', {text: 'Nice \u{1F680} launch'}],
		['say', {say: 'ok \u{1F44D}'}],
		['visual string', {visuals: [A({do: 'sketch.note', text: 'done ✅'})]}],
		['check mark', {visuals: [A({do: 'sketch.note', text: '✓ yes'})]}],
		['variation selector', {visuals: [A({do: 'sketch.note', text: 'x️'})]}],
		['regional indicator', {visuals: [A({do: 'sketch.note', text: '\u{1F1EE}\u{1F1F3}'})]}],
	])('fails an emoji in %s', (_n, beat) => {
		const s = mkStory([{visuals: [A({do: 'sketch.note', text: 'x'})], ...beat}]);
		expect(gate(s)[0].pure()).toMatch(/emoji/);
	});
	it('fails an emoji in the glossary, title and key points', () => {
		expect(emojiProblems({glossary: [{term: 'A', full: 'B', note: '\u{1F525}'}]})).toHaveLength(1);
		expect(emojiProblems({title: '⭐ title'})).toHaveLength(1);
		expect(emojiProblems({key_points: ['ok', '⚡ fast']})).toHaveLength(1);
	});
	it('the schema no longer accepts an "emoji" action field', () => {
		const v = validateStory({
			version: 3, format: 'story', title: 't', topic: 't', tags: [], level: 'beginner', cast: [], glossary: [],
			beats: [{speaker: 'narrator', text: 'hello there', visuals: [{do: 'sketch.box', text: 'x', emoji: 'x'}]}],
		});
		expect(v.ok).toBe(false);
	});
});
