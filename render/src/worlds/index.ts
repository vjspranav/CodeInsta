/**
 * The world registry. Adding a world = a folder src/worlds/<name>/ exporting a WorldModule, plus ONE line in
 * WORLDS below. The schema (action kinds, validation), the timeline (world.set, scenes, layout), SceneView and
 * the QA gate (world checks and the variety gate) all read this list. See README.md in this folder.
 */
import type {Action} from '../schema';
import type {AnyWorld} from './types';
import type {Item, Timeline, WorldInstance} from '../timeline';
import {termSession} from './term-session';

export type {AnyWorld, WorldEvent, WorldModule, WorldText, WorldViewProps, WorldValidateCtx} from './types';
export {defineWorld} from './types';

export const WORLDS: AnyWorld[] = [
	termSession,
	// add new worlds here, one line each
];

/** The action that puts a world on screen as the primary scene: {do: "world.set", world: "<id>", ...world props}. */
export const WORLD_SET = 'world.set';

export const WORLD_IDS: string[] = WORLDS.map((w) => w.id);
export const WORLD_ACTION_KINDS: string[] = WORLDS.flatMap((w) => [...w.actions]);

export const worldById = (id: unknown): AnyWorld | undefined => WORLDS.find((w) => w.id === id);
const byAction = new Map<string, AnyWorld>(WORLDS.flatMap((w) => w.actions.map((k) => [k, w] as [string, AnyWorld])));
/** The world that owns an action kind (undefined for built-in kinds and world.set). */
export const worldOfAction = (kind: unknown): AnyWorld | undefined => (typeof kind === 'string' ? byAction.get(kind) : undefined);
export const isWorldAction = (kind: unknown): boolean => worldOfAction(kind) !== undefined;

/**
 * The scenes that existed before the registry and still count as a reel's primary world for the variety gate:
 * the phone app mock-up and the live database stage. Their signature micro-interactions are state changes of
 * those components (a heart turning red, a spinner, a toast, a cache hit or miss, an insert, a fan-out ...).
 */
export const BUILTIN_WORLDS = [
	{id: 'phone', label: 'phone app', signature: ['phone.tap', 'phone.spinner', 'phone.toast', 'phone.instant']},
	{id: 'db', label: 'live database', signature: ['db.insert', 'db.join', 'db.fanout', 'db.shard', 'db.replicate', 'cache.hit', 'cache.miss']},
] as const;

/** Every id a script may declare as its primary `world`. */
export const PRIMARY_WORLD_IDS: string[] = [...BUILTIN_WORLDS.map((b) => b.id as string), ...WORLD_IDS];

/** True when an action is a signature micro-interaction (built-in state change or a world's declared one). */
export const isSignatureAction = (a: Action): boolean => {
	const k = String(a.do);
	if (BUILTIN_WORLDS.some((b) => (b.signature as readonly string[]).includes(k))) return true;
	const w = worldOfAction(k);
	if (!w || !w.signature.includes(k)) return false;
	return w.isSignature ? w.isSignature(a) : true;
};

/** Registry problems (the schema throws on any): unique ids and prefixes, prefixed kinds, no clash with built-ins. */
export const registryProblems = (builtinKinds: readonly string[]): string[] => {
	const out: string[] = [];
	const ids = new Set<string>();
	const prefixes = new Set<string>();
	const kinds = new Map<string, string>();
	for (const w of WORLDS) {
		if (ids.has(w.id)) out.push(`world id "${w.id}" is registered twice`);
		ids.add(w.id);
		if (BUILTIN_WORLDS.some((b) => b.id === w.id)) out.push(`world id "${w.id}" is reserved`);
		if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$/.test(w.id)) out.push(`world id "${w.id}": lowercase name, optionally "area.name"`);
		if (!/^[a-z][a-z0-9-]*\.$/.test(w.prefix)) out.push(`world ${w.id}: prefix "${w.prefix}" must look like "name."`);
		if (prefixes.has(w.prefix)) out.push(`world ${w.id}: prefix "${w.prefix}" is used by another world`);
		prefixes.add(w.prefix);
		if (!w.actions.length) out.push(`world ${w.id} declares no actions`);
		for (const k of w.actions) {
			if (!k.startsWith(w.prefix)) out.push(`world ${w.id}: action "${k}" does not start with "${w.prefix}"`);
			if (builtinKinds.includes(k) || k === WORLD_SET) out.push(`world ${w.id}: action "${k}" clashes with a built-in action`);
			if (kinds.has(k)) out.push(`world ${w.id}: action "${k}" is also declared by ${kinds.get(k)}`);
			kinds.set(k, w.id);
		}
		for (const k of w.signature) if (!w.actions.includes(k)) out.push(`world ${w.id}: signature "${k}" is not one of its actions`);
	}
	return out;
};

// ---- runtime: a scene item of kind "world" -> its module, instance and state

export const worldOfItem = (tl: Pick<Timeline, 'worlds'>, item: Item): {world: AnyWorld; inst: WorldInstance} | undefined => {
	if (item.kind !== 'world') return undefined;
	const world = worldById(item.props.world);
	const inst = tl.worlds.find((i) => i.key === item.props.inst);
	return world && inst ? {world, inst} : undefined;
};

/** The world's state for a scene item at `frame` (undefined for other items). */
export const worldStateOf = (tl: Pick<Timeline, 'worlds'>, item: Item, frame: number): unknown => {
	const r = worldOfItem(tl, item);
	return r ? r.world.stateAt(r.inst.events, frame) : undefined;
};
