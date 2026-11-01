import {CONTENT, Rect, shrinkRect, W} from './theme';
import type {LayoutName} from './schema';

export type ItemKind = 'box' | 'note' | 'cache' | 'term' | 'code' | 'commit' | 'db' | 'seq' | 'tree' | 'track' | 'packets' | 'editor' | 'plot';

export interface KindSpec {
	half: boolean; // may share a row with another half item (wide regions only)
	pref: number; // preferred height
	min: number; // minimum height before we paginate
	max: number; // largest height when stretching to fill the board
}

export const KIND: Record<ItemKind, KindSpec> = {
	box: {half: true, pref: 170, min: 104, max: 320},
	note: {half: true, pref: 140, min: 88, max: 260},
	cache: {half: true, pref: 210, min: 140, max: 320},
	term: {half: false, pref: 260, min: 150, max: 460},
	code: {half: false, pref: 340, min: 170, max: 560},
	commit: {half: false, pref: 380, min: 240, max: 600},
	db: {half: false, pref: 620, min: 300, max: 2000},
	seq: {half: false, pref: 560, min: 320, max: 2000},
	tree: {half: false, pref: 460, min: 260, max: 1200},
	track: {half: false, pref: 420, min: 240, max: 900},
	packets: {half: false, pref: 360, min: 220, max: 700},
	editor: {half: false, pref: 460, min: 240, max: 1200},
	plot: {half: false, pref: 480, min: 300, max: 1200},
};

export const ROW_GAP = 44;
export const COL_GAP = 84;

export interface Regions {
	phone?: Rect;
	/** board regions in fill order (split uses two) */
	boards: Rect[];
	db?: Rect;
}

export const PHONE_NATIVE = {w: 360, h: 740};

export const regionsFor = (layout: LayoutName, hasDb: boolean, hasBoard: boolean): Regions => {
	switch (layout) {
		case 'phone-left+board-right': {
			// the board stays left of the rightRail zone (x 610): phone and board share CONTENT.x..CONTENT.x+CONTENT.w
			const board = {x: 306, y: CONTENT.y, w: 290, h: CONTENT.h};
			const phone = {x: CONTENT.x, y: CONTENT.y, w: 270, h: CONTENT.h};
			if (!hasDb) return {phone, boards: [board]};
			if (!hasBoard) return {phone, boards: [], db: board};
			return {
				phone,
				db: {...board, h: Math.round(CONTENT.h * 0.62)},
				boards: [{...board, y: board.y + Math.round(CONTENT.h * 0.62) + 24, h: CONTENT.h - Math.round(CONTENT.h * 0.62) - 24}],
			};
		}
		case 'split': {
			// the top slot ends above the rightRail zone (y 520), so it may run the full width; the bottom one stays left of it
			// a table plus a board: the table takes the tallest top slot there is (it ends at y 516, above the rail)
			const topH = hasDb && hasBoard ? 392 : (CONTENT.h - 44) / 2;
			const bottomY = hasDb && hasBoard ? CONTENT.y + topH + 30 : CONTENT.y + topH + 44;
			const top = {x: CONTENT.x, y: CONTENT.y, w: W - 2 * CONTENT.x, h: topH};
			const bottom = {x: CONTENT.x, y: bottomY, w: CONTENT.w, h: CONTENT.y + CONTENT.h - bottomY};
			if (!hasDb) return {boards: [top, bottom]};
			if (!hasBoard) return {boards: [], db: CONTENT};
			return {db: top, boards: [bottom]};
		}
		case 'db-focus':
		case 'board-full':
		default: {
			if (!hasDb) return {boards: [CONTENT]};
			if (!hasBoard) return {boards: [], db: CONTENT};
			return {
				db: {x: CONTENT.x, y: CONTENT.y, w: CONTENT.w, h: CONTENT.h - 158},
				boards: [{x: CONTENT.x, y: CONTENT.y + CONTENT.h - 130, w: CONTENT.w, h: 130}],
			};
		}
	}
};

export interface Placeable {
	kind: ItemKind;
	/** optional preferred height (px) overriding the kind default */
	pref?: number;
}

const prefOf = (it: Placeable) => it.pref ?? KIND[it.kind].pref;
const minOf = (it: Placeable) => Math.min(KIND[it.kind].min, prefOf(it));

export interface PackResult {
	rects: Rect[]; // aligned with the placed prefix of `items`
	placed: number; // how many items fit (a prefix)
}

/**
 * Pack items (in order) into rows inside `region`. Rows are centred vertically.
 * Returns how many leading items fit; the rest overflow to a new page.
 */
export const packRegion = (items: Placeable[], region: Rect): PackResult => {
	const wide = region.w >= 520;
	type Row = {idx: number[]; pref: number; min: number};
	const rowsFor = (n: number): Row[] => {
		const rows: Row[] = [];
		let i = 0;
		while (i < n) {
			const k = KIND[items[i].kind];
			if (wide && k.half && i + 1 < n && KIND[items[i + 1].kind].half) {
				rows.push({idx: [i, i + 1], pref: Math.max(prefOf(items[i]), prefOf(items[i + 1])), min: Math.max(minOf(items[i]), minOf(items[i + 1]))});
				i += 2;
			} else {
				rows.push({idx: [i], pref: prefOf(items[i]), min: minOf(items[i])});
				i += 1;
			}
		}
		return rows;
	};

	let n = items.length;
	while (n > 0) {
		const rows = rowsFor(n);
		const gaps = (rows.length - 1) * ROW_GAP;
		const prefSum = rows.reduce((s, r) => s + r.pref, 0);
		const avail = region.h - gaps;
		const scale = Math.min(1, avail / prefSum);
		const ok = rows.every((r) => r.pref * scale >= r.min - 0.01);
		if (ok) {
			// stretch rows to fill the region, but never beyond each kind's max
			const s = Math.max(scale, avail / prefSum);
			const maxOf = (r: Row) => Math.max(...r.idx.map((k) => KIND[items[k].kind].max));
			let heights = rows.map((r) => Math.min(maxOf(r), r.pref * s));
			// redistribute any leftover to rows that still have headroom
			for (let pass = 0; pass < 3; pass++) {
				const left = avail - heights.reduce((a, b) => a + b, 0);
				if (left < 2) break;
				const room = rows.map((r, ri) => maxOf(r) - heights[ri]);
				const tot = room.reduce((a, b) => a + Math.max(0, b), 0);
				if (tot < 1) break;
				heights = heights.map((h, ri) => h + (Math.max(0, room[ri]) / tot) * Math.min(left, tot));
			}
			const total = heights.reduce((a, b) => a + b, 0) + gaps;
			let y = region.y + Math.max(0, (region.h - total) / 2);
			const rects: Rect[] = new Array(n);
			rows.forEach((row, ri) => {
				const h = heights[ri];
				if (row.idx.length === 2) {
					const w = (region.w - COL_GAP) / 2;
					rects[row.idx[0]] = {x: region.x, y, w, h};
					rects[row.idx[1]] = {x: region.x + w + COL_GAP, y, w, h};
				} else {
					const it = items[row.idx[0]];
					let w = region.w;
					let x = region.x;
					if (wide && KIND[it.kind].half) {
						w = (region.w - COL_GAP) / 2;
						x = region.x + (region.w - w) / 2;
					}
					rects[row.idx[0]] = {x, y, w, h};
				}
				y += h + ROW_GAP;
			});
			return {rects: rects.map((r) => shrinkRect(r, 0)), placed: n};
		}
		n -= 1;
	}
	return {rects: [], placed: 0};
};
