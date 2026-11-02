/**
 * The world contract (decisions.md 2026-11-02, "Reels must not look the same").
 *
 * A world is a full-frame scene that looks like the real thing (a terminal session, a debugger, a browser
 * network tab, an incident channel ...). A script puts a world on screen with `world.set {world: "<id>"}` and then
 * drives it with the world's own prefixed actions (`term.run`, `term.exit` ...). Everything the world draws is a
 * pure function of those actions and the frame, so the same script always renders the same frames, and the QA
 * gate (verify-lib.ts) and vitest read the same state the view draws.
 *
 * A world implements WorldModule and is listed once in src/worlds/index.ts. Nothing else changes: the schema,
 * the timeline, layout, SceneView and the QA gate all read the registry. See src/worlds/README.md.
 */
import type React from 'react';
import type {Action, Story} from '../schema';
import type {Rect} from '../theme';
import type {Style} from '../styles';

/**
 * One action of a world as it landed on the timeline. Events come in timeline order (frame, then script order)
 * and include the `world.set` actions that (re)entered the world, with `do: "world.set"`.
 */
export interface WorldEvent {
	/** frame at which the action fires (30 fps) */
	frame: number;
	/** script beat the action belongs to */
	beat: number;
	/** the action as written in the script (do, at, id and the world's own props) */
	action: Action;
}

/** A piece of text a world action puts on screen, `off` frames after the action fires (voice-after-visual sync). */
export interface WorldText {
	text: string;
	off: number;
}

/** Context for per-action validation. */
export interface WorldValidateCtx {
	story: Story;
	beat: number;
	/** index of the action within the beat's visuals */
	index: number;
}

/** What a world's view gets. The view draws inside `rect` only (720x1280 video coordinates). */
export interface WorldViewProps<S> {
	/** the world's state at `frame` (from stateAt) */
	state: S;
	/** the slot the layout gave the world; it already respects the overlay zones and the caption area */
	rect: Rect;
	frame: number;
	/** frame at which the world appeared in the current scene (entrance animation) */
	start: number;
	/** the active style (tokens, fonts, skin): draw with these, never with literal colours */
	style: Style;
	/** another element has focus: draw dimmed */
	dim?: boolean;
}

export interface WorldModule<S = unknown> {
	/** world id used in `world.set {world}` and in the script's top-level `world`, e.g. "term.session" */
	id: string;
	/** short human name for reports */
	label: string;
	/** action prefix, e.g. "term." (every action kind starts with it) */
	prefix: string;
	/** the world's action kinds, e.g. ["term.run", "term.exit"] (never a built-in kind) */
	actions: readonly string[];
	/** action kinds that count as a signature micro-interaction for the variety gate */
	signature: readonly string[];
	/** optional finer test: a signature-kind action only counts when this returns true (e.g. a non-zero exit) */
	isSignature?: (a: Action) => boolean;
	/**
	 * Problems with one action (error strings, empty = fine). Called for every world action and for each
	 * `world.set` that names this world (with `do: "world.set"`). Static: no frames are known yet.
	 */
	validate: (a: Action, ctx: WorldValidateCtx) => string[];
	/**
	 * Deterministic reducer: the world's state at `frame` from all of its events (events after `frame` must not
	 * change the result, except for frame-independent things such as a font size picked for the whole reel).
	 */
	stateAt: (events: WorldEvent[], frame: number) => S;
	/** Text the action puts on screen and when (frames after it fires). Drives reveal scheduling and the sync gate. */
	tokens?: (a: Action) => WorldText[];
	/** Rows / lines the action introduces (each one adds on-screen time before the scene may leave). */
	rows?: (a: Action) => number;
	/** Frames until the action has finished animating (the gate checks the world once it settles). Default 1. */
	settle?: (a: Action) => number;
	/** Text a viewer can read at this state inside `rect` (the gate looks for each one in the rendered frame). */
	texts: (state: S, rect: Rect) => string[];
	/** Geometry / legibility problems of this state inside `rect` (empty = fine). */
	problems?: (state: S, rect: Rect) => string[];
	/** Problems that need the whole timeline (e.g. a command typed while the previous one is still streaming). */
	timelineProblems?: (events: WorldEvent[]) => string[];
	/** Full-frame view. Root element must carry `data-shell` and `data-world={id}`; text uses data-code / data-label. */
	View: React.FC<WorldViewProps<S>>;
}

/** Registry-facing type: a world with its state type erased. */
export type AnyWorld = WorldModule<unknown>;

/** Erase a world's state type for the registry (the timeline only ever hands a world its own state). */
export const defineWorld = <S,>(m: WorldModule<S>): AnyWorld => m as unknown as AnyWorld;
