/**
 * Variety gate (decisions.md 2026-11-02, "Reels must not look the same"): pure measurements over a timeline.
 *
 *  world.primary  the reel's primary world (a registered world, or the phone / db scenes) is on screen for at
 *                 least half of the runtime
 *  notes.share    time whose screen is only whiteboard notes (sketch.note / sketch.box, their arrows, with
 *                 define lower thirds and clear) is at most a third of the runtime
 *  signature      at least one signature micro-interaction (phone / db state changes, a world's declared ones)
 *
 * Runtime = frame 0 up to the end card (the silent glossary card is the same in every reel and is not counted).
 * The gate applies to scripts that declare their primary `world` (every new reel does); for older scripts the
 * numbers are reported but not gated (verify-lib.ts).
 */
import type {Story} from './schema';
import type {Timeline} from './timeline';
import {sceneAt} from './state';
import {BUILTIN_WORLDS, isSignatureAction, worldById} from './worlds';

export const MIN_PRIMARY_SHARE = 0.5;
export const MAX_NOTES_SHARE = 1 / 3;
/** item kinds that make a screen "just whiteboard notes" */
export const NOTE_ITEM_KINDS = ['box', 'note'] as const;

/** Worlds on screen at `frame`: "phone", "db" and registered world ids. */
export const worldsOnScreen = (tl: Timeline, frame: number): string[] => {
	const sc = sceneAt(tl, frame);
	if (!sc) return [];
	const out = new Set<string>();
	if (sc.phone && frame >= sc.phone.start) out.add('phone');
	for (const it of sc.items) {
		if (frame < it.start) continue;
		if (it.kind === 'db') out.add('db');
		if (it.kind === 'world') out.add(String(it.props.world));
	}
	return [...out];
};

/** The screen at `frame` shows something, and it is only whiteboard notes / boxes. */
export const notesOnlyAt = (tl: Timeline, frame: number): boolean => {
	const sc = sceneAt(tl, frame);
	if (!sc) return false;
	if (sc.phone && frame >= sc.phone.start) return false;
	const vis = sc.items.filter((it) => frame >= it.start);
	return vis.length > 0 && vis.every((it) => (NOTE_ITEM_KINDS as readonly string[]).includes(it.kind));
};

export interface VarietyStats {
	runtimeFrames: number;
	/** world id -> fraction of the runtime it is on screen */
	share: Record<string, number>;
	/** the world with the largest share (undefined when none is ever on screen) */
	top?: string;
	notesShare: number;
	/** beats that are mostly whiteboard notes */
	notesBeats: number[];
	/** signature micro-interactions: beat and action kind */
	signatures: {beat: number; do: string}[];
}

export const varietyStats = (_story: Story, tl: Timeline): VarietyStats => {
	const runtime = Math.max(1, tl.endCard.start);
	const counts: Record<string, number> = {};
	let notes = 0;
	const beatNotes = new Map<number, {n: number; all: number}>();
	let bi = 0;
	for (let f = 0; f < runtime; f++) {
		for (const w of worldsOnScreen(tl, f)) counts[w] = (counts[w] ?? 0) + 1;
		const isNotes = notesOnlyAt(tl, f);
		if (isNotes) notes++;
		while (bi + 1 < tl.beats.length && tl.beats[bi + 1].start <= f) bi++;
		if (f >= tl.beats[0].start) {
			const c = beatNotes.get(bi) ?? {n: 0, all: 0};
			c.all++;
			if (isNotes) c.n++;
			beatNotes.set(bi, c);
		}
	}
	const share: Record<string, number> = {};
	for (const [k, v] of Object.entries(counts)) share[k] = v / runtime;
	const top = Object.keys(share).sort((a, b) => share[b] - share[a])[0];
	const signatures = tl.reveals.filter((r) => isSignatureAction({...r.a, do: r.do} as never)).map((r) => ({beat: r.beat, do: r.do}));
	return {
		runtimeFrames: runtime,
		share,
		top,
		notesShare: notes / runtime,
		notesBeats: [...beatNotes.entries()].filter(([, c]) => c.n * 2 > c.all).map(([b]) => b),
		signatures,
	};
};

export const worldLabel = (id: string): string => worldById(id)?.label ?? BUILTIN_WORLDS.find((b) => b.id === id)?.label ?? id;
