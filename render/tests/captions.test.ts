import {describe, expect, it} from 'vitest';
import {captionStateAt, chunkText} from '../src/captionstate';
import '../tests/helpers';
import type {BeatT} from '../src/timeline';

const beat = (text: string): BeatT => ({index: 0, speaker: 'narrator', text, start: 100, dur: 120, end: 220, holdEnd: 220, src: 'x', atMs: []});

describe('captions', () => {
	it('never more than 2 lines per chunk, and chunks cover the whole text', () => {
		const text = 'Rookie just shipped the like button on a Friday afternoon and now every single tap walks all the way to one faraway database';
		const {chunks} = chunkText(text);
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) expect(c.lines.length).toBeLessThanOrEqual(2);
		expect(chunks.map((c) => c.lines.join(' ')).join(' ')).toBe(text);
	});
	it('shows only the current line, revealing words in order', () => {
		const b = beat('Works on my laptop.');
		const early = captionStateAt(b, b.start + 1);
		const late = captionStateAt(b, b.end - 1);
		expect(early.visible.length).toBeLessThan(late.visible.length);
		expect(late.visible.join(' ')).toBe('Works on my laptop.');
		expect(early.text).toBe('Works on my laptop.');
	});
});
