import type {Action} from './schema';
import {easeInOut, lerp, lin, Rect} from './theme';
import {getStyle} from './styles';
import {measure} from './text';

/** Native table metrics: data is 22 px, so a table drawn at scale >= 1 keeps its data readable (>= 22 px at 720x1280). */
export const DATA_PX = 22;
export const HEAD_PX = 17;
export const T_HEAD = 44; // title row
export const T_COLS = 30; // column header row
export const T_ROW = 34;
export const T_PAD = 8;
export const MIN_TABLE_W = 260;
export const FLY = 22;
export const MOVE = 16;

export interface DbRow {
	cells: string[];
	tag?: number; // index into the style's tags
	born: number;
	stagger: boolean;
	from?: {table: string; row: number};
	goneAt?: number;
	flash?: boolean;
}

export interface DbTable {
	id: string;
	title: string;
	sub?: string;
	badge?: string;
	cols: string[];
	rows: DbRow[];
	born: number;
	died?: number; // ghost until `died`, excluded from layout from `layoutOut`
	layoutOut?: number;
	kind: 'table' | 'replica' | 'shard' | 'feed' | 'result';
	tag?: number;
}

export interface Phase {
	frame: number;
	live: string[];
}

export interface JoinStep {
	frame: number;
	table: string;
	rows: number[];
	label: string;
	i: number;
	n: number;
}

export interface DbModel {
	tables: DbTable[];
	phases: Phase[];
	joins: JoinStep[];
}

const strv = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const numv = (v: unknown, d: number): number => (typeof v === 'number' ? v : d);

const toRows = (v: unknown): string[][] =>
	Array.isArray(v) ? v.map((r) => (Array.isArray(r) ? r.map((c) => strv(c)) : [strv(r)])) : [];

const keyHash = (s: string): number => {
	const n = parseInt(s.replace(/[^0-9-]/g, ''), 10);
	if (!Number.isNaN(n)) return Math.abs(n);
	let h = 0;
	for (const ch of s) h += ch.charCodeAt(0);
	return h;
};

export const buildDbModel = (events: {frame: number; action: Action}[]): DbModel => {
	const tables: DbTable[] = [];
	const phases: Phase[] = [];
	const joins: JoinStep[] = [];
	const get = (id?: string): DbTable | undefined => {
		if (id) {
			const t = tables.find((x) => x.id === id);
			if (t) return t;
		}
		const live = [...tables].reverse().find((t) => t.died === undefined);
		return live;
	};
	const live = (): string[] => tables.filter((t) => t.layoutOut === undefined).map((t) => t.id);
	const phase = (frame: number) => phases.push({frame, live: live()});

	for (const {frame, action} of events) {
		const a = action as Record<string, unknown>;
		switch (action.do) {
			case 'db.table': {
				const rawCols = a.columns ?? a.cols;
				const cols = Array.isArray(rawCols) ? (rawCols as unknown[]).map((c) => strv(c)) : ['id', 'value'];
				const rows = toRows(a.rows);
				const t: DbTable = {
					id: strv(a.id, `t${tables.length}`),
					title: strv(a.name, strv(a.title, 'table')),
					sub: typeof a.sub === 'string' ? a.sub : undefined,
					cols,
					rows: rows.map((cells, i) => ({cells, born: frame + 6 + i * 5, stagger: true})),
					born: frame,
					kind: 'table',
				};
				tables.push(t);
				phase(frame);
				break;
			}
			case 'db.result': {
				// solo: the source tables step aside so the result can be read at full size
				if (a.solo === true) {
					for (const t of tables) {
						if (t.died === undefined) {
							t.died = frame + 9;
							t.layoutOut = frame;
						}
					}
				}
				const rawCols = a.columns ?? a.cols;
				const cols = Array.isArray(rawCols) ? (rawCols as unknown[]).map((c) => strv(c)) : [];
				tables.push({
					id: strv(a.id, `result${tables.length}`),
					title: strv(a.name, strv(a.title, 'result')),
					sub: typeof a.sub === 'string' ? a.sub : undefined,
					badge: 'result',
					cols,
					rows: toRows(a.rows).map((cells, i) => ({cells, born: frame + MOVE + 4 + i * 6, stagger: true, flash: true})),
					born: frame + MOVE - 4,
					kind: 'result',
					tag: 0,
				});
				phase(frame);
				break;
			}
			case 'db.join': {
				const steps = Array.isArray(a.steps) ? (a.steps as Record<string, unknown>[]) : [];
				const stepFrames = Math.round(((typeof a.step_ms === 'number' ? a.step_ms : 700) / 1000) * 30);
				steps.forEach((st, i) =>
					joins.push({
						frame: frame + i * stepFrames,
						table: strv(st.table),
						rows: Array.isArray(st.rows) ? (st.rows as unknown[]).map((r) => Number(r)) : [],
						label: strv(st.label),
						i,
						n: steps.length,
					}),
				);
				break;
			}
			case 'db.insert': {
				const t = get(strv(a.table, strv(a.into)));
				if (!t) break;
				const cells = Array.isArray(a.row) ? (a.row as unknown[]).map((c) => strv(c)) : toRows(a.rows)[0] ?? [];
				const extra = toRows(a.rows);
				const batch = Array.isArray(a.row) ? [cells] : extra;
				batch.forEach((c, i) =>
					t.rows.push({
						cells: c,
						born: frame + i * 8,
						stagger: false,
						flash: true,
						tag: typeof a.tag === 'number' ? a.tag : undefined,
					}),
				);
				break;
			}
			case 'db.shard': {
				const src = get(strv(a.table));
				if (!src) break;
				const n = Math.max(2, Math.min(4, numv(a.n, 2)));
				const by = typeof a.by === 'number' ? a.by : Math.max(0, src.cols.indexOf(strv(a.by, src.cols[0])));
				const byName = src.cols[by] ?? src.cols[0];
				const shards: DbTable[] = [];
				for (let k = 0; k < n; k++) {
					shards.push({
						id: `${src.id}#${k}`,
						title: `${src.title} · shard ${k + 1}`,
						sub: `${byName} % ${n} = ${k}`,
						cols: src.cols,
						rows: [],
						born: frame + 6,
						kind: 'shard',
						tag: k,
					});
				}
				src.rows.forEach((r, i) => {
					if (r.born > frame + 40) return;
					const k = keyHash(r.cells[by] ?? '') % n;
					shards[k].rows.push({
						cells: r.cells,
						tag: k,
						born: frame + 6 + Math.min(i, 8) * 2,
						stagger: false,
						from: {table: src.id, row: i},
					});
					r.goneAt = frame + 2;
				});
				src.died = frame + 9;
				src.layoutOut = frame;
				tables.push(...shards);
				phase(frame);
				break;
			}
			case 'db.replicate': {
				const src = get(strv(a.table));
				if (!src) break;
				const n = Math.max(1, Math.min(3, numv(a.n, 2)));
				src.badge = 'primary';
				for (let k = 0; k < n; k++) {
					tables.push({
						id: `${src.id}~r${k}`,
						title: `${src.title}`,
						sub: strv(a.label, `replica ${k + 1}`),
						badge: 'copy',
						cols: src.cols,
						rows: src.rows.map((r, i) => ({
							cells: r.cells,
							born: frame + MOVE + 2 + Math.min(i, 8) * 3 + k * 4,
							stagger: false,
							from: {table: src.id, row: i},
						})),
						born: frame + MOVE - 4,
						kind: 'replica',
						tag: 5,
					});
				}
				phase(frame);
				break;
			}
			case 'db.fanout': {
				const src = get(strv(a.table));
				if (!src) break;
				const f = a.followers;
				const names: string[] = Array.isArray(f)
					? (f as unknown[]).map((x) => strv(x))
					: Array.from({length: Math.max(2, Math.min(6, numv(f, 4)))}, (_, i) => ['ana', 'bo', 'cy', 'dee', 'eli', 'fay'][i]);
				const ri = typeof a.row === 'number' ? a.row : src.rows.length - 1;
				const row = src.rows[Math.max(0, Math.min(src.rows.length - 1, ri))];
				if (!row) break;
				names.slice(0, 6).forEach((name, k) => {
					tables.push({
						id: `${src.id}>f${k}`,
						title: `${strv(a.label, 'feed')} · @${name.replace(/^@/, '')}`,
						cols: src.cols,
						rows: [
							{
								cells: row.cells,
								tag: k,
								born: frame + MOVE + 2 + k * 4,
								stagger: false,
								from: {table: src.id, row: Math.max(0, src.rows.indexOf(row))},
							},
						],
						born: frame + MOVE - 4,
						kind: 'feed',
						tag: k,
					});
				});
				phase(frame);
				break;
			}
		}
	}
	return {tables, phases, joins};
};

/** Table native height from the number of rows it will ever hold. */
export const nativeHeight = (t: DbTable) => T_HEAD + (t.sub ? 18 : 0) + T_COLS + Math.max(1, t.rows.length) * T_ROW + T_PAD;

/** Column widths that fit the widest cell / header of each column (content-fit, so data never clips). */
const rawColWidths = (t: DbTable): number[] =>
	t.cols.map((c, i) => {
		const cells = t.rows.map((r) => measure(r.cells[i] ?? '', 'mono', DATA_PX) + 22);
		const head = measure(c.toUpperCase(), 'ui', HEAD_PX, 600) + c.length * 0.6 + 22;
		return Math.max(head, ...cells, 50);
	});
export const nativeWidth = (t: DbTable): number => {
	const body = rawColWidths(t).reduce((a, b) => a + b, 0) + 24;
	const title = measure(t.title, 'hand', 26) + 28 + (t.badge ? 74 : 0);
	return Math.ceil(Math.max(MIN_TABLE_W, body, title));
};
/** Column widths stretched to fill the table width. */
export const colWidths = (t: DbTable): number[] => {
	const raw = rawColWidths(t);
	const room = nativeWidth(t) - 24;
	const sum = raw.reduce((a, b) => a + b, 0);
	return raw.map((w) => (w / sum) * room);
};

export interface Placement {
	x: number;
	y: number;
	scale: number;
}

const gridPlace = (tabs: DbTable[], rect: Rect, gap: number, maxScale: number, out: Map<string, Placement>) => {
	const n = tabs.length;
	if (n === 0) return;
	const widths = tabs.map(nativeWidth);
	const heights = tabs.map(nativeHeight);
	const maxW = Math.max(...widths);
	const rowHeights = (cols: number) => {
		const hs: number[] = [];
		for (let i = 0; i < n; i += cols) hs.push(Math.max(...heights.slice(i, i + cols)));
		return hs;
	};
	// the arrangement with the biggest scale wins (fewer columns on a tie), so data stays as large as it can
	let best = {s: 0, cols: 1};
	for (let cols = 1; cols <= Math.min(n, 4); cols++) {
		const hs = rowHeights(cols);
		const cw = (rect.w - gap * (cols - 1)) / cols;
		const s = Math.min(maxScale, cw / maxW, (rect.h - gap * (hs.length - 1)) / hs.reduce((a, b) => a + b, 0));
		if (s > best.s + 0.03) best = {s, cols};
	}
	const {s, cols} = best;
	const hs = rowHeights(cols);
	const gridH = hs.reduce((a, b) => a + b * s, 0) + (hs.length - 1) * gap;
	let y = rect.y + Math.max(0, (rect.h - gridH) / 2);
	hs.forEach((rh, r) => {
		const inRow = Math.min(cols, n - r * cols);
		const cell = maxW * s;
		const rowW = inRow * cell + (inRow - 1) * gap;
		const x0 = rect.x + (rect.w - rowW) / 2;
		for (let c = 0; c < inRow; c++) {
			const i = r * cols + c;
			out.set(tabs[i].id, {x: x0 + c * (cell + gap) + (cell - widths[i] * s) / 2, y: y + (rh * s - heights[i] * s) / 2, scale: s});
		}
		y += rh * s + gap;
	});
};

export const layoutPhase = (model: DbModel, ids: string[], rect: Rect): Map<string, Placement> => {
	const out = new Map<string, Placement>();
	const tabs = ids.map((id) => model.tables.find((t) => t.id === id)!).filter(Boolean);
	const feeds = tabs.filter((t) => t.kind === 'feed');
	if (feeds.length) {
		const srcs = tabs.filter((t) => t.kind !== 'feed');
		const topH = srcs.length ? Math.min(rect.h * 0.4, Math.max(...srcs.map(nativeHeight), 120) * 1.0 + 8) : 0;
		gridPlace(srcs, {x: rect.x, y: rect.y, w: rect.w, h: topH}, 14, 1.1, out);
		const feedRect = {x: rect.x, y: rect.y + topH + (srcs.length ? 20 : 0), w: rect.w, h: rect.h - topH - (srcs.length ? 20 : 0)};
		gridPlace(feeds, feedRect, 14, 1.2, out);
		return out;
	}
	gridPlace(tabs, rect, 14, 1.3, out);
	return out;
};

export const tagColor = (i?: number) => {
	const tags = getStyle().tokens.tags;
	return i === undefined ? undefined : tags[i % tags.length];
};

// ---------------------------------------------------------------------------
// Pure geometry / state (shared by the renderer, unit tests and verify.ts)
// ---------------------------------------------------------------------------
export const BANNER_H = 72;

export interface Prepared {
	model: DbModel;
	layouts: Map<string, Placement>[];
}

export const prepareDb = (events: {frame: number; action: Action}[], rect: Rect): Prepared => {
	const model = buildDbModel(events);
	const lr = model.joins.length ? {...rect, h: rect.h - BANNER_H - 12} : rect;
	const layouts = model.phases.map((p) => layoutPhase(model, p.live, lr));
	return {model, layouts};
};

export const placementAt = (pre: Prepared, id: string, f: number): Placement | undefined => {
	const {model, layouts} = pre;
	let pi = -1;
	for (let i = 0; i < model.phases.length; i++) if (model.phases[i].frame <= f) pi = i;
	if (pi < 0) return undefined;
	let at = pi;
	while (at >= 0 && !layouts[at].has(id)) at--;
	if (at < 0) return undefined;
	const cur = layouts[at].get(id)!;
	if (at !== pi) return cur;
	const prev = at > 0 ? layouts[at - 1].get(id) : undefined;
	if (!prev) return cur;
	const t = easeInOut(lin(f, model.phases[at].frame, MOVE));
	return {x: lerp(prev.x, cur.x, t), y: lerp(prev.y, cur.y, t), scale: lerp(prev.scale, cur.scale, t)};
};

export type HlState = 'now' | 'past' | undefined;

export const hlFor = (pre: Prepared, tableId: string, row: number, frame: number): HlState => {
	let latest = -1;
	let mine = -1;
	pre.model.joins.forEach((j, idx) => {
		if (j.frame <= frame) {
			latest = idx;
			if (j.table === tableId && j.rows.includes(row)) mine = idx;
		}
	});
	if (mine < 0) return undefined;
	return mine === latest ? 'now' : 'past';
};

export const rowTop = (t: DbTable, i: number) => T_HEAD + (t.sub ? 18 : 0) + T_COLS + i * T_ROW;

export const tableVisible = (t: DbTable, f: number) => f >= t.born && !(t.died !== undefined && f >= t.died);

export const rowVisible = (r: DbRow, f: number) => f >= r.born && !(r.goneAt !== undefined && f >= r.goneAt);

export interface DbState {
	tables: {
		id: string;
		title: string;
		kind: DbTable['kind'];
		rows: string[][];
		highlighted: {now: number[]; past: number[]};
		rect?: Rect;
	}[];
	joinStep?: {i: number; n: number; label: string};
}

/** Everything observable about the DB stage at `frame`. */
export const dbStateAt = (pre: Prepared, frame: number): DbState => {
	const tables = pre.model.tables
		.filter((t) => tableVisible(t, frame))
		.map((t) => {
			const rows: string[][] = [];
			const now: number[] = [];
			const past: number[] = [];
			t.rows.forEach((r, i) => {
				if (!rowVisible(r, frame)) return;
				rows.push(r.cells);
				const h = hlFor(pre, t.id, i, frame);
				if (h === 'now') now.push(i);
				if (h === 'past') past.push(i);
			});
			const pl = placementAt(pre, t.id, Math.max(frame, t.born));
			return {
				id: t.id,
				title: t.title,
				kind: t.kind,
				rows,
				highlighted: {now, past},
				rect: pl ? {x: pl.x, y: pl.y, w: nativeWidth(t) * pl.scale, h: nativeHeight(t) * pl.scale} : undefined,
			};
		});
	let cur = -1;
	pre.model.joins.forEach((j, i) => {
		if (j.frame <= frame) cur = i;
	});
	const j = pre.model.joins[cur];
	return {tables, joinStep: j ? {i: j.i, n: j.n, label: j.label} : undefined};
};

/** Frame at which every row of every table has finished arriving (up to `frame`-independent). */
export const dbSettleFrame = (pre: Prepared, tableId: string): number => {
	const t = pre.model.tables.find((x) => x.id === tableId);
	if (!t) return 0;
	return Math.max(t.born, ...t.rows.map((r) => r.born)) + FLY + 4;
};
