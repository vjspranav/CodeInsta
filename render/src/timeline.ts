import type {Action, AudioManifest, Beat, LayoutName, Story} from './schema';
import {NARRATOR_ID} from './schema';
import {FPS, Rect} from './theme';
import {isStageKind, ItemKind, packRegion, PHONE_NATIVE, regionsFor} from './layout';
import {lineTokens, matchToken, SYNC_LEAD_MS, SYNC_MAX_LEAD_MS, visualTokens} from './sync';
import type {VisTok} from './sync';
import {endFrames as endFramesOf} from './endcard';
import {KIT_ACTIONS, isKitKind} from './kits';
import {WORLD_SET, worldById, worldOfAction} from './worlds';
import type {AnyWorld, WorldEvent} from './worlds';

export const LEAD_MS = 300;
export const TAIL_FRAMES = 20;
export const DEFINE_FRAMES = 105;
/** Context-aware gaps between lines (ms). */
export const GAPS = {sameSpeaker: 120, speakerChange: 200, questionAnswer: 250, punchline: 350, layoutChange: 450};
export const JOIN_STEP_MS = 700;
/** A visual needs max(MIN_VISUAL_MS, MS_PER_ROW * rows) on screen, counted from its appearance. */
export const MIN_VISUAL_MS = 1500;
export const MS_PER_ROW = 300;
/** Explicit hold_ms is capped here. */
export const HOLD_CAP_MS = 1200;

export interface BeatT {
	index: number;
	speaker: string;
	text: string;
	start: number;
	dur: number;
	/** end of the spoken line */
	end: number;
	/** end of line + hold_ms + auto-dwell (visuals keep animating) */
	holdEnd: number;
	src: string;
	/** per visual action: ms from the start of the line at which it fires (negative = before the line, see planBeat) */
	atMs: number[];
}

export interface BuildOpts {
	/** schedule visuals that show something the line names early enough (default true) */
	autoReveal?: boolean;
}

/** One action as it landed on the timeline: used by the sync QA gate (src/sync.ts, verify-lib.ts). */
export interface Reveal {
	beat: number;
	action: number;
	do: string;
	/** frame at which the action fires */
	frame: number;
	/** the item it created or updated (db actions: the db stage; phone / define: undefined) */
	item?: Item;
	/** the action created `item` (so a pagination delay of item.start applies) */
	created: boolean;
	baseStart: number;
	/** a copy of the action (term actions carry the typing speed the timeline chose) */
	a: Record<string, unknown>;
	/** term.type: the props object the renderer reads (typing speed is written here) */
	termProps?: Record<string, unknown>;
}

/** Visual tokens of a reveal with the frames they appear at (pagination delays included). */
export const revealTokens = (r: Reveal): (VisTok & {frame: number})[] =>
	visualTokens(r.a).map((v) => ({...v, frame: r.frame + v.off + (r.created && r.item ? r.item.start - r.baseStart : 0)}));

export interface Item {
	key: string;
	id?: string;
	kind: ItemKind;
	start: number;
	props: Record<string, unknown>;
	/** later actions merged into this item (same id / continuing terminal etc.) */
	updates: {frame: number; props: Record<string, unknown>}[];
	rect: Rect;
	pref?: number;
	/** set on a copy carried into a new scene by layout/clear `keep` */
	origin?: Item;
}

export interface ArrowT {
	id?: string;
	start: number;
	from: string;
	to: string;
	label?: string;
	bend?: number;
}

export interface PhoneEvent {
	frame: number;
	kind: 'show' | 'feed' | 'tap' | 'spinner' | 'toast' | 'instant';
	props: Record<string, unknown>;
}

export interface FocusEvent {
	frame: number;
	id?: string;
}

export interface Scene {
	index: number;
	start: number;
	end: number;
	layout: LayoutName;
	items: Item[];
	arrows: ArrowT[];
	focus: FocusEvent[];
	phone?: {start: number; rect: Rect; body: Rect; scale: number};
	/** frames at which an opaque "page turn" should play (pagination / layout change) */
	turn: boolean;
}

export interface DefineT {
	frame: number;
	term: string;
	full: string;
	note?: string;
	frames: number;
}

/** One world instance (a world keeps its state across scenes: leave the terminal, come back, the scrollback is there). */
export interface WorldInstance {
	/** "<world id>#<instance id>" (instance id: the world.set `id`, default "main") */
	key: string;
	world: string;
	id: string;
	/** every world.set and world action of this instance, in timeline order */
	events: WorldEvent[];
}

export interface Timeline {
	beats: BeatT[];
	/** world instances (registered worlds, src/worlds); scene items of kind "world" point here via props.inst */
	worlds: WorldInstance[];
	scenes: Scene[];
	defines: DefineT[];
	phoneEvents: PhoneEvent[];
	reveals: Reveal[];
	beatsEnd: number;
	endCard: {start: number; frames: number};
	total: number;
}

const msToFrames = (ms: number) => Math.round((ms / 1000) * FPS);

const countArr = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** Data rows / code lines / terminal lines a single visual introduces. */
const rowsOf = (a: Record<string, unknown>): number => {
	switch (a.do) {
		case 'db.table':
		case 'db.result':
			return countArr(a.rows);
		case 'db.insert':
			return Array.isArray(a.row) ? 1 : countArr(a.rows);
		case 'code.show': {
			const c = a.code ?? a.text ?? a.snippet;
			return Array.isArray(c) ? c.length : typeof c === 'string' ? c.split('\n').length : 0;
		}
		case 'term.type': {
			let n = a.cmd || a.command || a.text ? 1 : 0;
			const o = a.out ?? a.output ?? a.lines;
			n += Array.isArray(o) ? o.length : typeof o === 'string' ? o.split('\n').length : 0;
			return n;
		}
	}
	const w = worldOfAction(a.do);
	if (w?.rows) return w.rows(a as Action);
	return 0;
};

/** Minimum time (ms) a visual must stay on screen from its appearance. */
export const minVisibleMs = (a: Record<string, unknown>): number => Math.max(MIN_VISUAL_MS, MS_PER_ROW * rowsOf(a));

/** Actions that put something on screen (and therefore need on-screen time). */
const SHOWS = (a: Record<string, unknown>) => {
	const k = String(a.do);
	return !(k === 'layout' || k === 'clear' || k === 'focus' || k === 'define' || k === 'sketch.arrow' || k.startsWith('phone.'));
};

const atFraction = (a: Record<string, unknown>): number =>
	a.at === 'end' ? 1 : typeof a.at === 'number' ? a.at : 0;

/** Extra silence needed so a db.join can finish stepping before the next line. */
const joinExtraMs = (b: Beat, durMs: number, atMs: number[]): number => {
	let extra = 0;
	b.visuals.forEach((a0, i) => {
		const a = a0 as Record<string, unknown>;
		if (a.do !== 'db.join') return;
		const steps = countArr(a.steps);
		const stepMs = typeof a.step_ms === 'number' ? a.step_ms : JOIN_STEP_MS;
		extra = Math.max(extra, atMs[i] + steps * stepMs + 300 - durMs);
	});
	return Math.max(0, extra);
};

/** Actions that replace the scene: layout, clear and world.set. */
const isWipe = (a: Record<string, unknown>) => a.do === 'layout' || a.do === 'clear' || a.do === WORLD_SET;
const hasSceneChange = (b: Beat) => b.visuals.some((a) => isWipe(a as Record<string, unknown>));

export const gapBetween = (prev: Beat, cur: Beat, sceneChange = true): number => {
	let g = prev.speaker === cur.speaker ? GAPS.sameSpeaker : GAPS.speakerChange;
	if (/[?？]["')\]]?\s*$/.test(prev.text.trim())) g = Math.max(g, GAPS.questionAnswer);
	if (prev.punchline) g = Math.max(g, GAPS.punchline);
	if (sceneChange && hasSceneChange(cur)) g = Math.max(g, GAPS.layoutChange);
	return g;
};

/** ids a layout / clear at the start of `next` carries into the new scene. */
export const keptIds = (next: Beat | undefined): Set<string> => {
	const ids = new Set<string>();
	for (const a of (next?.visuals ?? []) as Record<string, unknown>[]) {
		if ((a.do === 'layout' || a.do === 'clear') && Array.isArray(a.keep)) for (const k of a.keep) ids.add(String(k));
	}
	return ids;
};

/** True when the next beat wipes the scene right at its start (so beat i's visuals leave). */
const leavesBefore = (next: Beat | undefined): boolean => {
	if (!next) return true; // end of the reel: the end card follows
	return (next.visuals as Record<string, unknown>[]).some((a) => isWipe(a) && atFraction(a) === 0);
};

export interface BeatPlan {
	/** ms from the start of the line at which each visual action fires */
	atMs: number[];
	/** how long before the line starts the earliest action fires (<= SYNC_MAX_LEAD_MS) */
	leadMs: number;
}

/**
 * When does each visual of a beat fire? Default: its `at` (fraction of the line). A visual that shows something
 * the line names (a number, identifier, table or box name) fires at least SYNC_LEAD_MS before that word is
 * spoken (word times: src/sync.ts), clamped to just before the line. layout / clear at the start follow the
 * earliest reveal so the new scene is up before the word.
 */
export const planBeat = (b: Beat, durMs: number, autoReveal = true): BeatPlan => {
	const vs = b.visuals as Record<string, unknown>[];
	const atMs = vs.map((a) => atFraction(a) * durMs);
	if (autoReveal && vs.length) {
		const line = lineTokens(b.say ?? b.text, durMs);
		vs.forEach((a, i) => {
			let need = Infinity;
			for (const v of visualTokens(a)) {
				const t = matchToken(v, line);
				if (t) need = Math.min(need, t.startMs - SYNC_LEAD_MS - (v.off / FPS) * 1000);
			}
			if (need < atMs[i]) atMs[i] = Math.max(-SYNC_MAX_LEAD_MS, need);
		});
		const lead = Math.min(0, ...atMs);
		// A wipe at the start waits for the first thing the new scene shows: until then the old scene stays up
		// (it keeps counting as on screen) instead of leaving an empty board.
		const shown = vs.map((a, i) => ({a, i})).filter(({a}) => a.do !== 'layout' && a.do !== 'clear' && a.do !== 'define');
		const firstShown = shown.length ? Math.min(...shown.map(({i}) => atMs[i])) : 0;
		vs.forEach((a, i) => {
			if ((a.do === 'layout' || a.do === 'clear') && atMs[i] <= 0 && atFraction(a) === 0) atMs[i] = lead < 0 ? lead : Math.max(0, firstShown);
		});
	}
	// a world.set fires no later than the world actions that follow it in the beat (they need their world on screen)
	vs.forEach((a, i) => {
		if (a.do !== WORLD_SET) return;
		for (let j = i + 1; j < vs.length; j++) {
			if (vs[j].do === WORLD_SET || vs[j].do === 'layout') break;
			if (worldOfAction(vs[j].do)) atMs[i] = Math.min(atMs[i], atMs[j]);
		}
	});
	return {atMs, leadMs: Math.max(0, -Math.min(0, ...atMs))};
};

export const buildBeats = (story: Story, audio: AudioManifest, opts: BuildOpts = {}): BeatT[] => {
	const auto = opts.autoReveal !== false;
	const byIdx = new Map<number, AudioManifest['lines'][number]>();
	for (const l of audio.lines) if (!byIdx.has(l.beat_index)) byIdx.set(l.beat_index, l);
	const plans = story.beats.map((b, i) => {
		const line = byIdx.get(i);
		if (!line) throw new Error(`no audio line for beat ${i}`);
		return planBeat(b, line.duration_ms, auto);
	});
	let cursor = LEAD_MS + (story.beats[0].pause_before_ms ?? 0);
	return story.beats.map((b, i) => {
		const line = byIdx.get(i)!;
		const start = msToFrames(cursor);
		const dur = Math.max(1, Math.ceil((line.duration_ms / 1000) * FPS));
		const next = story.beats[i + 1];
		const sceneGap = next ? Math.max(gapBetween(b, next), plans[i + 1].leadMs) : TAIL_FRAMES * (1000 / FPS);
		// the silence a line needs without the scene-change allowance: an explicit hold takes the place of that allowance
		const baseGap = next ? Math.max(gapBetween(b, next, false), plans[i + 1].leadMs) : sceneGap;
		const pause = next ? (next.pause_before_ms ?? 0) : 0;
		// A visual that persists into the next beat gets nothing extra. Only visuals that leave
		// when the next beat starts must have been up long enough; the line, any hold and the gap all count.
		let shortfall = 0;
		if (leavesBefore(next)) {
			const kept = keptIds(next);
			// the wipe may wait for the first thing the next scene shows: the old scene is still up until then
			let wipeDelay = 0;
			(next?.visuals ?? []).forEach((a0, ai) => {
				const a = a0 as Record<string, unknown>;
				if (isWipe(a) && atFraction(a) === 0) wipeDelay = Math.max(wipeDelay, plans[i + 1].atMs[ai]);
			});
			b.visuals.forEach((a0, ai) => {
				const a = a0 as Record<string, unknown>;
				if (!SHOWS(a) || (typeof a.id === 'string' && kept.has(a.id))) return;
				const onScreen = line.duration_ms - plans[i].atMs[ai] + sceneGap + wipeDelay;
				shortfall = Math.max(shortfall, minVisibleMs(a) - onScreen);
			});
		}
		// An explicit hold (or a join finishing) overlaps the scene-change allowance instead of stacking on it.
		const asked = Math.max(Math.min(HOLD_CAP_MS, b.hold_ms ?? 0), joinExtraMs(b, line.duration_ms, plans[i].atMs));
		let holdMs = asked;
		let gap = asked > 0 ? Math.max(sceneGap - asked, baseGap) : sceneGap;
		// dwell: the silence plus whatever was on screen must reach the minimum; the shortfall is added as hold
		const wanted = shortfall + sceneGap; // total silence the dwell needs after the line
		if (holdMs + gap < wanted) holdMs += wanted - (holdMs + gap);
		gap += pause;
		const end = start + dur;
		const holdEnd = end + msToFrames(holdMs);
		cursor += line.duration_ms + holdMs + (next ? gap : 0);
		return {index: i, speaker: b.speaker, text: b.text, start, dur, end, holdEnd, src: line.src, atMs: plans[i].atMs};
	});
};

const triggerFrame = (beat: BeatT, idx: number): number => beat.start + msToFrames(beat.atMs[idx]);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

interface Builder {
	start: number;
	layout: LayoutName;
	items: Item[];
	arrows: ArrowT[];
	focus: FocusEvent[];
	phoneStart?: number;
	turn: boolean;
}

const hintHeight = (it: Item): number | undefined => {
	const sv = (v: unknown) => (typeof v === 'string' ? v : '');
	if (it.kind === 'code') {
		const raw = it.props.code ?? it.props.text ?? it.props.snippet ?? '';
		const n = Array.isArray(raw) ? raw.length : sv(raw).split('\n').length;
		return Math.max(150, Math.min(340, 96 + n * 40));
	}
	if (it.kind === 'term') {
		let n = 0;
		for (const p of [it.props, ...it.updates.map((u) => u.props)]) {
			if (p.cmd || p.command || p.text) n++;
			const o = p.out ?? p.output ?? p.lines;
			n += Array.isArray(o) ? o.length : typeof o === 'string' ? o.split('\n').length : 0;
		}
		return Math.max(150, Math.min(300, 84 + n * 34));
	}
	return undefined;
};

const ARROWABLE: ItemKind[] = ['box', 'cache', 'term', 'code', 'commit', 'seq', 'tree', 'track', 'packets', 'editor', 'plot'];

export const buildTimeline = (story: Story, audio: AudioManifest, opts: BuildOpts = {}): Timeline => {
	const beats = buildBeats(story, audio, opts);
	const beatsEnd = beats[beats.length - 1].holdEnd;

	type Ev = {frame: number; order: number; action: Action; beat: number; idx: number};
	const evs: Ev[] = [];
	let order = 0;
	beats.forEach((b, i) => {
		story.beats[i].visuals.forEach((a, idx) => {
			evs.push({frame: triggerFrame(b, idx), order: order++, action: a as Action, beat: i, idx});
		});
	});
	evs.sort((a, b) => a.frame - b.frame || a.order - b.order);

	const phoneEvents: PhoneEvent[] = [];
	const reveals: Reveal[] = [];
	const defines: DefineT[] = [];
	const rawScenes: Builder[] = [];
	let cur: Builder = {start: 0, layout: 'board-full', items: [], arrows: [], focus: [], turn: false};
	let itemN = 0;

	const hasContent = (s: Builder) => s.items.length > 0 || s.phoneStart !== undefined || s.arrows.length > 0;
	const close = () => {
		if (hasContent(cur)) rawScenes.push(cur);
	};
	const open = (frame: number, layout: LayoutName, keepPhone: boolean): void => {
		const phoneStart = keepPhone ? cur.phoneStart : undefined;
		cur = {start: frame, layout, items: [], arrows: [], focus: [], phoneStart, turn: true};
	};

	const findItem = (kind: ItemKind, id?: string, repo?: string): Item | undefined => {
		const same = cur.items.filter((it) => it.kind === kind);
		if (id) return same.find((it) => it.id === id);
		if (kind === 'cache' || kind === 'term' || isKitKind(kind)) return same[same.length - 1];
		if (kind === 'commit') {
			const last = same[same.length - 1];
			if (last && (!repo || last.props.repo === repo)) return last;
		}
		return undefined;
	};

	/** what the current action touched (for the reveal record) */
	let touched: {item?: Item; created: boolean; props?: Record<string, unknown>} = {created: false};
	const addItem = (frame: number, kind: ItemKind, a: Action, merge = false) => {
		const {do: _d, at: _a, id, ...props} = a as Record<string, unknown>;
		const itemId = str(id);
		if (merge) {
			const ex = findItem(kind, itemId, str(props.repo));
			if (ex) {
				ex.updates.push({frame, props});
				touched = {item: ex, created: false, props};
				return;
			}
		}
		const item: Item = {
			key: `s${rawScenes.length}-i${itemN++}`,
			id: itemId,
			kind,
			start: frame,
			props,
			updates: [],
			rect: {x: 0, y: 0, w: 0, h: 0},
		};
		cur.items.push(item);
		touched = {item, created: true, props};
	};

	/** layout / clear: carry the items named in `keep` into the new scene (no re-animation). */
	const carry = (keep: unknown): Item[] => {
		if (!Array.isArray(keep)) return [];
		return cur.items
			.filter((it) => it.id !== undefined && keep.includes(it.id))
			.map((it) => ({...it, key: `s${rawScenes.length}-k${itemN++}`, updates: [...it.updates], rect: {...it.rect}, origin: it.origin ?? it}));
	};

	// ---- worlds: one instance per (world, id); a scene item of kind "world" shows it
	const worldInsts = new Map<string, WorldInstance>();
	const instFor = (w: AnyWorld, id: string): WorldInstance => {
		const key = `${w.id}#${id}`;
		let inst = worldInsts.get(key);
		if (!inst) {
			inst = {key, world: w.id, id, events: []};
			worldInsts.set(key, inst);
		}
		return inst;
	};
	const openWorld = (frame: number, w: AnyWorld, id: string | undefined): Item => {
		close();
		open(frame, 'world', false);
		const inst = instFor(w, id ?? 'main');
		const item: Item = {key: `s${rawScenes.length}-w${itemN++}`, id, kind: 'world', start: frame, props: {world: w.id, inst: inst.key}, updates: [], rect: {x: 0, y: 0, w: 0, h: 0}};
		cur.items.push(item);
		return item;
	};

	const ensurePhone = (frame: number) => {
		if (cur.layout !== 'phone-left+board-right') cur.layout = 'phone-left+board-right';
		if (cur.phoneStart === undefined) cur.phoneStart = frame;
	};

	for (const {frame, action: a, beat: evBeat, idx: evIdx} of evs) {
		const props = a as Record<string, unknown>;
		touched = {created: false};
		switch (a.do) {
			case 'layout': {
				const tpl = (str(props.template) ?? 'board-full') as LayoutName;
				const kept = carry(props.keep);
				close();
				open(frame, tpl, tpl === 'phone-left+board-right');
				cur.items.push(...kept);
				break;
			}
			case 'clear': {
				// in a world scene the world stays (only the board strip is wiped)
				const keepIds = Array.isArray(props.keep) ? props.keep : [];
				const worldsHere = cur.layout === 'world' ? cur.items.filter((it) => it.kind === 'world' && !(it.id && keepIds.includes(it.id))) : [];
				const kept = [...carry(props.keep), ...worldsHere.map((it) => ({...it, key: `s${rawScenes.length}-k${itemN++}`, updates: [...it.updates], rect: {...it.rect}, origin: it.origin ?? it}))];
				close();
				open(frame, cur.layout, true);
				cur.items.push(...kept);
				break;
			}
			case WORLD_SET: {
				const w = worldById(props.world);
				if (!w) break;
				const id = str(props.id);
				const item = openWorld(frame, w, id);
				instFor(w, id ?? 'main').events.push({frame, beat: evBeat, action: a});
				touched = {item, created: true};
				break;
			}
			case 'phone.show': {
				ensurePhone(frame);
				cur.phoneStart = frame;
				phoneEvents.push({frame, kind: 'show', props});
				break;
			}
			case 'phone.feed':
			case 'phone.tap':
			case 'phone.spinner':
			case 'phone.toast':
			case 'phone.instant': {
				ensurePhone(frame);
				phoneEvents.push({frame, kind: a.do.slice(6) as PhoneEvent['kind'], props});
				break;
			}
			case 'sketch.box':
				addItem(frame, 'box', a, !!str(props.id) && cur.items.some((i) => i.id === props.id && i.kind === 'box'));
				break;
			case 'sketch.note':
				addItem(frame, 'note', a);
				break;
			case 'sketch.arrow': {
				let from = str(props.from);
				let to = str(props.to);
				if (!from || !to) {
					const cand = cur.items.filter((it) => ARROWABLE.includes(it.kind));
					const phone = cur.phoneStart !== undefined ? 'phone' : undefined;
					const ids = cand.map((c) => c.key);
					if (!to && ids.length) to = ids[ids.length - 1];
					if (!from) from = ids.length > 1 ? ids[ids.length - 2] : phone ?? ids[0];
				}
				if (from && to) {
					cur.arrows.push({
						id: str(props.id),
						start: frame,
						from,
						to,
						label: str(props.label),
						bend: typeof props.bend === 'number' ? props.bend : undefined,
					});
				}
				break;
			}
			case 'cache.hit':
			case 'cache.miss':
				addItem(frame, 'cache', {...a, result: a.do === 'cache.hit' ? 'hit' : 'miss'} as Action, true);
				break;
			case 'term.type':
				addItem(frame, 'term', {...a} as Action, true);
				break;
			case 'code.show':
				addItem(frame, 'code', a);
				break;
			case 'commit.story':
				addItem(frame, 'commit', a, true);
				break;
			case 'seq.diagram':
			case 'tree':
			case 'timeline.track':
			case 'packet.flow':
			case 'code.editor':
			case 'chart.plot':
				// visualization kits: a repeated id appends to the same diagram / tree / track / flow / editor / plot
				addItem(frame, KIT_ACTIONS[a.do], a, true);
				break;
			case 'db.table':
			case 'db.insert':
			case 'db.shard':
			case 'db.replicate':
			case 'db.fanout':
			case 'db.join':
			case 'db.result': {
				let db = cur.items.find((it) => it.kind === 'db');
				if (!db) {
					db = {
						key: `s${rawScenes.length}-db`,
						kind: 'db',
						start: frame,
						props: {events: []},
						updates: [],
						rect: {x: 0, y: 0, w: 0, h: 0},
					};
					cur.items.push(db);
				}
				(db.props.events as {frame: number; action: Action}[]).push({frame, action: a});
				touched = {item: db, created: db.start === frame && (db.props.events as unknown[]).length === 1};
				break;
			}
			case 'focus':
				cur.focus.push({frame, id: str(props.target) ?? str(props.id)});
				break;
			default: {
				const w = worldOfAction(a.do);
				if (!w) break;
				let item = cur.layout === 'world' ? cur.items.find((it) => it.kind === 'world' && it.props.world === w.id) : undefined;
				let created = false;
				if (!item) {
					// the world is not on screen (schema validation rejects this): open it so the timeline stays sound
					item = openWorld(frame, w, undefined);
					created = true;
				}
				worldInsts.get(String(item.props.inst))!.events.push({frame, beat: evBeat, action: a});
				touched = {item, created};
				break;
			}
			case 'define': {
				const term = str(props.term) ?? str(props.id) ?? '';
				const g = story.glossary.find((x) => x.term.toLowerCase() === term.toLowerCase());
				defines.push({
					frame,
					term: g?.term ?? term,
					full: str(props.full) ?? g?.full ?? '',
					note: str(props.note) ?? g?.note,
					frames: DEFINE_FRAMES,
				});
				break;
			}
		}
		if (a.do !== 'layout' && a.do !== 'clear') {
			reveals.push({
				beat: evBeat,
				action: evIdx,
				do: a.do,
				frame,
				item: touched.item,
				created: touched.created,
				baseStart: touched.item?.start ?? frame,
				a: {...props},
				termProps: a.do === 'term.type' ? touched.props : undefined,
			});
		}
	}
	close();

	// ---- resolve placement (and paginate on overflow) ----
	const scenes: Scene[] = [];
	for (const raw of rawScenes) {
		let pending: Item[] = raw.items;
		let pageStart = raw.start;
		let firstPage = true;
		let guard = 0;
		while ((pending.length > 0 || firstPage) && guard++ < 40) {
			// try to place the first n pending items; shrink n to the first item that does not fit
			const tryPlace = (subset: Item[]) => {
				const hasDb = subset.some((i) => isStageKind(i.kind));
				const boardItems = subset.filter((i) => !isStageKind(i.kind));
				const regions = regionsFor(raw.layout, hasDb, boardItems.length > 0);
				const groups: Item[][] = regions.boards.map(() => []);
				if (groups.length === 1) groups[0] = boardItems;
				else if (groups.length === 2) {
					const half = Math.ceil(boardItems.length / 2);
					boardItems.forEach((it, i) => {
						const side = String(it.props.side ?? '').toLowerCase();
						const g = side === 'b' || side === 'bottom' ? 1 : side === 'a' || side === 'top' ? 0 : i < half ? 0 : 1;
						groups[g].push(it);
					});
				}
				for (const it of boardItems) it.pref = hintHeight(it);
				let firstUnplaced = Infinity;
				groups.forEach((grp, gi) => {
					const res = packRegion(grp, regions.boards[gi]);
					grp.forEach((it, i) => {
						if (i < res.placed) it.rect = res.rects[i];
						else firstUnplaced = Math.min(firstUnplaced, subset.indexOf(it));
					});
				});
				for (const it of subset) if (isStageKind(it.kind) && regions.db) it.rect = regions.db;
				return {regions, firstUnplaced};
			};
			let n = pending.length;
			let regions = regionsFor(raw.layout, false, false);
			for (let g2 = 0; g2 < 60; g2++) {
				const r = tryPlace(pending.slice(0, n));
				regions = r.regions;
				if (r.firstUnplaced === Infinity || n <= 1) break;
				n = Math.max(1, r.firstUnplaced);
			}
			const pageItems = pending.slice(0, n);
			const rest = pending.slice(n);
			let phone: Scene['phone'];
			if (raw.phoneStart !== undefined && regions.phone) {
				const sc = Math.min(regions.phone.w / PHONE_NATIVE.w, regions.phone.h / PHONE_NATIVE.h);
				const bw = PHONE_NATIVE.w * sc;
				const bh = PHONE_NATIVE.h * sc;
				phone = {
					start: raw.phoneStart,
					rect: regions.phone,
					scale: sc,
					body: {
						x: regions.phone.x + (regions.phone.w - bw) / 2,
						y: regions.phone.y + (regions.phone.h - bh) / 2,
						w: bw,
						h: bh,
					},
				};
			}
			const keys = new Set(pageItems.flatMap((i) => (i.id ? [i.key, i.id] : [i.key])));
			scenes.push({
				index: scenes.length,
				start: pageStart,
				end: pageStart,
				layout: raw.layout,
				items: pageItems,
				arrows: raw.arrows.filter((ar) => {
					const ok = (k: string) => k === 'phone' || keys.has(k);
					return ok(ar.from) && ok(ar.to);
				}),
				focus: raw.focus.filter((f) => !f.id || keys.has(f.id) || pageItems.some((i) => i.id === f.id) || f.id === 'phone'),
				phone,
				turn: raw.turn || !firstPage,
			});
			firstPage = false;
			pending = rest;
			if (rest.length) {
				// the earlier page must stay up long enough to be read
				const lastStart = Math.max(pageStart, ...pageItems.map((i) => i.start));
				pageStart = Math.max(rest[0].start, lastStart + 36);
				for (const it of rest) it.start = Math.max(it.start, pageStart);
			}
		}
	}
	// end frames
	scenes.sort((a, b) => a.start - b.start);
	scenes.forEach((s, i) => {
		s.index = i;
		s.end = i + 1 < scenes.length ? scenes[i + 1].start : beatsEnd + TAIL_FRAMES;
	});

	// ---- terminal typing: a spoken number that depends on the output must not outrun the typing ----
	if (opts.autoReveal !== false) fitTerminals(story, beats, scenes, reveals);

	// defines never overlap
	defines.sort((a, b) => a.frame - b.frame);
	defines.forEach((d, i) => {
		if (i + 1 < defines.length) d.frames = Math.min(d.frames, defines[i + 1].frame - d.frame);
	});

	const endFrames = endFramesOf(story);
	const endStart = beatsEnd + TAIL_FRAMES;
	return {
		beats,
		worlds: [...worldInsts.values()],
		scenes,
		defines,
		phoneEvents: phoneEvents.sort((a, b) => a.frame - b.frame),
		reveals,
		beatsEnd,
		endCard: {start: endStart, frames: endFrames},
		total: endStart + (endFrames || 6),
	};
};

/** Scene indexes an item (or the copies of it carried by `keep`) is part of. */
export const scenesOfItem = (scenes: Scene[], item: Item): number[] =>
	scenes.filter((s) => s.items.some((i) => i === item || (i.origin ?? i) === (item.origin ?? item))).map((s) => s.index);

/**
 * Speed a terminal's typing up when a later (or the same) line names something its output shows
 * ("Forty-eight hundred" while 4812 is still being typed). Typing, the gap before the output and the
 * output lines scale together, down to 0.2x of the natural speed; the QA gate flags what still cannot fit.
 */
const fitTerminals = (story: Story, beats: BeatT[], scenes: Scene[], reveals: Reveal[]): void => {
	const audioDur = (i: number) => (beats[i].dur / FPS) * 1000;
	for (const r of reveals) {
		if (r.do !== 'term.type' || !r.item || !r.termProps) continue;
		const sceneIdx = scenesOfItem(scenes, r.item);
		const sc = scenes.filter((x) => sceneIdx.includes(x.index));
		if (!sc.length) continue;
		const scEnd = Math.max(...sc.map((x) => x.end));
		const shift = r.created ? r.item.start - r.baseStart : 0;
		const toks = visualTokens(r.a);
		let scale = 1;
		for (let j = r.beat; j < beats.length; j++) {
			const line = lineTokens(story.beats[j].say ?? story.beats[j].text, audioDur(j));
			for (const v of toks) {
				const t = matchToken(v, line);
				if (!t) continue;
				const spoken = beats[j].start + msToFrames(t.startMs);
				if (spoken >= scEnd) continue;
				const avail = spoken - msToFrames(SYNC_LEAD_MS) - (r.frame + shift) - 1;
				if (v.off > avail) scale = Math.min(scale, Math.max(0.2, avail / v.off));
			}
		}
		if (scale < 1) {
			const set = {cpf: 1.5 * scale, cmd_gap: Math.max(2, Math.round(10 * scale)), line_gap: Math.max(2, Math.round(6 * scale))};
			Object.assign(r.termProps, set);
			Object.assign(r.a, set);
		}
	}
};

export const speakerAt = (tl: Timeline, frame: number): BeatT | undefined => {
	let cur: BeatT | undefined;
	for (const b of tl.beats) if (b.start <= frame) cur = b;
	return cur;
};

export const isNarrator = (id: string) => id === NARRATOR_ID;
