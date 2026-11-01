import {afterEach, describe, expect, it} from 'vitest';
import {A, mkAudio, mkStory, one} from './helpers';
import {CODE_MIN_PX, colW, fitCode, revealRows, wrapCodeLine} from '../src/codewrap';
import {defineBox} from '../src/components/Overlays';
import {END_BOTTOM, END_TOP, END_W, endLabel, endPages} from '../src/endcard';
import {editorGeom, editorRowsAt} from '../src/kits';
import {measure, resetMeasureCache} from '../src/text';
import {setActiveStyle, STYLES} from '../src/styles';
import {buildTimeline} from '../src/timeline';
import {LOWER_THIRD} from '../src/theme';

afterEach(() => setActiveStyle('sketch'));

const LONG = '  audio_platform_info.xml:$(TARGET_COPY_OUT_VENDOR)/etc/audio_platform_info.xml';

describe('long code lines wrap instead of shrinking', () => {
	it('breaks after : and / with a continuation indent, keeping every character', () => {
		const w = wrapCodeLine(LONG, 52);
		expect(w.clean).toBe(true);
		expect(w.rows.length).toBeGreaterThan(1);
		expect(w.rows[0].endsWith(':')).toBe(true);
		expect(w.rows[1].startsWith('      ')).toBe(true);
		for (const r of w.rows) expect(r.length).toBeLessThanOrEqual(52);
		expect(w.rows.map((r) => r.trim()).join('')).toBe(LONG.replace(/\s+/g, ' ').trim().replace(/ /g, ''));
	});
	it('never splits +=', () => {
		const w = wrapCodeLine('PRODUCT_COPY_FILES += $(LOCAL_PATH)/configs/very_long_name_here.xml', 20);
		for (const r of w.rows) expect(r.endsWith('+')).toBe(false);
	});
	for (const st of STYLES) {
		it(`${st.id}: the shown snippet stays >= ${CODE_MIN_PX} px, wraps, and fits the card`, () => {
			setActiveStyle(st.id);
			// a code card in a board-full scene next to a commit story: ~560 px wide, ~190 px of text height
			const lines = ['PRODUCT_COPY_FILES += \\', LONG];
			const fit = fitCode(lines, 560, 190);
			expect(fit.fs).toBeGreaterThanOrEqual(CODE_MIN_PX);
			expect(fit.wrapped).toBe(true);
			expect(fit.clean).toBe(true);
			expect(fit.fits).toBe(true);
			for (const rs of fit.rows) for (const r of rs) expect(r.length * colW(fit.fs)).toBeLessThanOrEqual(560 + 1);
			expect(fit.total * fit.lh).toBeLessThanOrEqual(190.5);
		});
	}
	it('short code is not wrapped and stays large', () => {
		const fit = fitCode(['a = 1', 'b = 2'], 560, 190);
		expect(fit.wrapped).toBe(false);
		expect(fit.fs).toBeGreaterThanOrEqual(24);
	});
	it('code.editor wraps a long line at >= 16 px and reveals it row by row', () => {
		const {tl} = one([A({do: 'code.editor', id: 'e', file: 'device.mk', lines: [LONG.trimStart()]})], 3000);
		const it2 = tl.scenes[0].items[0];
		const g = editorGeom(it2, 520, 300);
		expect(g.fs).toBeGreaterThanOrEqual(CODE_MIN_PX);
		expect(g.fits).toBe(true);
		expect(g.rowsOf[0].length).toBeGreaterThan(1);
		const {rows} = editorRowsAt(it2, it2.start + 400, 520, 300);
		expect(rows.length).toBeGreaterThan(1);
		expect(rows.filter((r) => r.first).length).toBe(1);
		expect(revealRows(['abc:', '    def'], 2)).toEqual(['ab', '']);
		expect(revealRows(['abc:', '    def'], 7)).toEqual(['abc:', '    de']);
	});
});

describe('define lower-third', () => {
	it('wraps to two lines within its band instead of clipping', () => {
		setActiveStyle('editorial-dark');
		const b = defineBox({term: 'ReLU', full: 'Rectified Linear Unit applied after every convolution layer of the encoder stack', note: 'A simple non-linearity: zero below zero, the identity above.'});
		expect(b.lines.length).toBeLessThanOrEqual(2);
		expect(b.size).toBeGreaterThanOrEqual(22);
		expect(b.complete).toBe(true);
		expect(b.height).toBeLessThanOrEqual(LOWER_THIRD.h);
		for (const l of b.lines) expect(measure(l, 'hand', b.size)).toBeLessThanOrEqual(LOWER_THIRD.w - 56);
	});
	it('shows the term once when the full form is the same words', () => {
		setActiveStyle('editorial-dark');
		const b = defineBox({term: 'attention weights', full: 'Attention weights', note: 'How much each word looks at every other word.'});
		expect(b.label).toBe('attention weights');
		expect(b.lines.join(' ')).toBe('attention weights');
		expect(b.noteLines.length).toBeGreaterThan(0);
		expect(endLabel('TCP', 'Transmission Control Protocol')).toBe('TCP · Transmission Control Protocol');
	});
	it('TCP and its full form fit with real margin in the blueprint style', () => {
		setActiveStyle('blueprint');
		const b = defineBox({term: 'TCP', full: 'Transmission Control Protocol', note: 'Opens a reliable connection and re-sends what gets lost.'});
		for (const l of b.lines) expect(measure(l, 'hand', b.size)).toBeLessThanOrEqual(LOWER_THIRD.w - 56 - 6);
	});
	it('widths measured before a face loads are dropped when it loads', () => {
		const g = globalThis as {__measureText?: (t: string, f: string, s: number, w: number) => number};
		const real = g.__measureText!;
		g.__measureText = (t) => t.length * 5; // fallback face
		resetMeasureCache();
		const fallback = measure('Transmission Control Protocol', 'hand', 28);
		g.__measureText = real;
		expect(measure('Transmission Control Protocol', 'hand', 28)).toBe(fallback); // stale: the cache keeps it
		resetMeasureCache(); // what Fonts.loadFaces does once the faces are registered
		expect(measure('Transmission Control Protocol', 'hand', 28)).not.toBe(fallback);
	});
});

describe('end card', () => {
	it('long key points are sized or paginated so every block fits its page', () => {
		for (const st of STYLES) {
			setActiveStyle(st.id);
			const story = mkStory([{visuals: [A({do: 'sketch.note', text: 'x'})]}], {
				glossary: [{term: 'attention weights', full: 'Attention weights', note: 'How much each word looks at every other word.'}, {term: 'softmax', full: 'Softmax', note: 'Turns scores into probabilities.'}],
				key_points: [
					'Attention lets every word look at every other word in the sentence at once, so distance stops mattering.',
					'Stacking many attention heads lets the model track several relationships between the same words in parallel.',
					'Because nothing is sequential, training parallelises across the whole sentence, which is what made it scale.',
				],
			});
			const pages = endPages(story);
			expect(pages.length).toBeGreaterThan(0);
			const room = END_BOTTOM - END_TOP;
			for (const pg of pages) {
				const used = pg.blocks.reduce((a, b) => a + b.h, 0) + (pg.blocks.some((b) => b.kind === 'g') ? 90 : 0) + (pg.blocks.some((b) => b.kind === 'p') ? 90 : 0);
				expect(used, st.id).toBeLessThanOrEqual(room);
				expect(pg.fs).toBeGreaterThanOrEqual(22);
				for (const b of pg.blocks) for (const l of b.lines) expect(measure(l, 'hand', pg.fs)).toBeLessThanOrEqual(END_W - 8 + 0.5);
			}
			expect(pages.flatMap((p) => p.blocks).filter((b) => b.kind === 'p').length).toBe(3);
			// the identical term / full form is listed once
			expect(pages[0].blocks[0].lines.join(' ')).toBe('attention weights');
		}
	});
});

describe('pacing: silence is the legitimate kind', () => {
	const box = (text: string, at = 0) => A({do: 'sketch.box', text, at});
	it('an explicit hold overlaps the scene-change allowance instead of stacking on it', () => {
		const s = mkStory([{hold_ms: 600, visuals: [box('x')]}, {visuals: [A({do: 'layout', template: 'split'}), box('y')]}]);
		const tl = buildTimeline(s, mkAudio(s, 2000));
		const sil = ((tl.beats[1].start - tl.beats[0].end) / 30) * 1000;
		expect(sil).toBeLessThan(600 + 450 - 150); // old: hold 600 + layout gap 450
		expect(sil).toBeGreaterThanOrEqual(600); // the hold itself is still honoured
	});
	it('a scene wipe waits for the first thing the new scene shows, so the old visual keeps counting', () => {
		const leave = (at: number) => [A({do: 'clear'}), box('y', at)];
		const mk = (at: number) => {
			const s = mkStory([{visuals: [box('x', 0.5)]}, {visuals: leave(at)}, {}]);
			return buildTimeline(s, mkAudio(s, 1000));
		};
		const early = mk(0);
		const late = mk(0.4);
		const dwell = (tl: ReturnType<typeof mk>) => ((tl.scenes[0].end - tl.scenes[0].items[0].start) / 30) * 1000;
		expect(dwell(late)).toBeGreaterThanOrEqual(dwell(early));
		// less silence was needed to give the first visual its 1.5 s
		const sil = (tl: ReturnType<typeof mk>) => tl.beats[1].start - tl.beats[0].end;
		expect(sil(late)).toBeLessThan(sil(early));
		expect(dwell(late)).toBeGreaterThanOrEqual(1450);
	});
});
