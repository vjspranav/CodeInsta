import {describe, expect, it} from 'vitest';
import {A, mkAudio, mkStory} from './helpers';
import {buildTimeline} from '../src/timeline';
import {deriveChecks} from '../verify-lib';
import {zoneHit, zoneProblems, ZONES} from '../src/zones';
import {layoutProblems} from '../src/state';
import {CAPTION_AREA, CONTENT, LOWER_THIRD, SPEAKER_ROW} from '../src/theme';
import {END_BOTTOM, END_W, END_X} from '../src/endcard';
import {chunkText, TEXT_W} from '../src/captionstate';
import {regionsFor} from '../src/layout';
import {fitRole} from '../src/components/Captions';

const emptyProbe = (boxes: {kind: string; label: string; rect: {x: number; y: number; w: number; h: number}}[]) =>
	({frame: 0, caption: null, define: null, toast: null, heart: null, spinner: null, tables: [], kits: [], text: '', fonts: [], splits: [], captionFont: null, problems: [], zoneBoxes: boxes}) as never;

describe('zone geometry', () => {
	it('a rect inside a zone hits it, one that only touches does not', () => {
		expect(zoneHit({x: 620, y: 600, w: 40, h: 40})).toBe('rightRail');
		expect(zoneHit({x: 500, y: 20, w: 40, h: 40})).toBe('topControls');
		expect(zoneHit({x: 100, y: 1150, w: 40, h: 40})).toBe('bottomMeta');
		expect(zoneHit({x: 36, y: 600, w: 574, h: 40})).toBeNull();
		expect(zoneHit({x: 36, y: 1100, w: 300, h: 40})).toBeNull();
	});
});

describe('QA gate: zones.clear', () => {
	const s = mkStory([{visuals: [A({do: 'sketch.note', text: 'hello'})]}]);
	const {checks} = deriveChecks(s, mkAudio(s, 3000));
	const zc = checks.filter((c) => c.group === 'zones.clear');

	it('exists for every scene and the end card', () => {
		expect(zc.length).toBeGreaterThan(0);
	});
	it('fails a still whose text box sits inside a zone, passes one that is clear', () => {
		for (const c of zc.filter((x) => x.still)) {
			const bad = c.still!({probe: emptyProbe([{kind: 'text', label: 'Remember', rect: {x: 620, y: 700, w: 80, h: 30}}]), img: {w: 1, h: 1, data: Buffer.alloc(4)}});
			expect(bad).toMatch(/rightRail/);
			const bad2 = c.still!({probe: emptyProbe([{kind: 'visual', label: 'kit', rect: {x: 100, y: 1130, w: 200, h: 40}}]), img: {w: 1, h: 1, data: Buffer.alloc(4)}});
			expect(bad2).toMatch(/bottomMeta/);
			expect(c.still!({probe: emptyProbe([{kind: 'text', label: 'ok', rect: {x: 40, y: 300, w: 300, h: 30}}]), img: {w: 1, h: 1, data: Buffer.alloc(4)}})).toBeNull();
		}
	});
	it('the pure layer fails an item placed inside a zone', () => {
		const tl = buildTimeline(s, mkAudio(s, 3000));
		const sc = structuredClone(tl.scenes[0]);
		sc.items[0].rect = {x: 500, y: 700, w: 200, h: 100};
		expect(layoutProblems(sc).join(';')).toMatch(/zone/);
	});
	it('zoneProblems reports each offender', () => {
		expect(zoneProblems([{kind: 'avatar', label: 'A', rect: {x: 450, y: 40, w: 50, h: 50}}])[0]).toMatch(/topControls/);
	});
});

describe('caption speaker row', () => {
	it('a long role is shortened so the row stays left of the rightRail', () => {
		const role = fitRole('Rookie', 'Overconfident junior who ships on Friday evenings and never reads the logs afterwards', 500);
		expect(role.endsWith('\u2026')).toBe(true);
		expect(fitRole('Rookie', 'junior', 500)).toBe('junior');
	});
});

describe('layout keeps the fixed areas out of the zones', () => {
	it('captions are above bottomMeta and left of the rightRail', () => {
		expect(CAPTION_AREA.y + CAPTION_AREA.h).toBeLessThanOrEqual(ZONES.bottomMeta.y);
		expect(CAPTION_AREA.x + CAPTION_AREA.w).toBeLessThanOrEqual(ZONES.rightRail.x);
		expect(TEXT_W).toBeLessThanOrEqual(CAPTION_AREA.w);
		expect(zoneHit(CAPTION_AREA)).toBeNull();
		for (const t of ['A short line.', 'A much longer line of speech that has to wrap across more than one rendered row of the caption.']) expect(chunkText(t).chunks.length).toBeGreaterThan(0);
	});
	it('lower third, content slots and end card are clear', () => {
		expect(zoneHit(LOWER_THIRD)).toBeNull();
		expect(zoneHit(SPEAKER_ROW)).toBeNull();
		expect(END_BOTTOM).toBeLessThanOrEqual(ZONES.bottomMeta.y);
		expect(END_X + END_W).toBeLessThanOrEqual(ZONES.rightRail.x);
		for (const layout of ['phone-left+board-right', 'split', 'db-focus', 'board-full'] as const) {
			for (const [db, board] of [[false, true], [true, false], [true, true]] as const) {
				const r = regionsFor(layout, db, board);
				for (const rect of [r.phone, r.db, ...r.boards]) if (rect) expect(zoneHit(rect), `${layout} ${db} ${board}`).toBeNull();
			}
		}
		expect(zoneHit(CONTENT)).toBeNull();
	});
});
