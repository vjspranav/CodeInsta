/**
 * debugger: an IDE debug session (source pane, gutter breakpoints, variables, call stack, debug console) as a pure
 * model. The same world draws gdb, lldb, Android Studio or VS Code: the console prompt and the panel titles are props.
 *
 *   world.set     {world: "debugger", code: string | string[], file?: "sum.c", first?: 1, lang?: "c",
 *                  title?: "lldb ./sum", prompt?: "(lldb)", vars_title?: "Variables", stack_title?: "Call Stack",
 *                  breakpoints?: [lines], line?: <paused here>, reason?, msg?, vars?, stack?, frame?}
 *                 the first world.set carries the source. With `line` the session is already paused there.
 *   dbg.cmd       {cmd?, out?}                   console only: type a command, print its output
 *   dbg.break     {line | lines, off?}           set (or clear with off) breakpoints: a red dot pops in the gutter
 *   dbg.step      {kind: over|into|out, line}    the stepping highlight moves to `line`
 *   dbg.continue  {line?, reason?, msg?, run_ms?}  the process runs; with `line` it stops there after run_ms
 *   dbg.stop      {line, reason?, msg?}          the process stops here now (breakpoint, watchpoint, signal, assert ...)
 *   dbg.set       {vars?, stack?, drop?}         state changes without motion (print, set var, a watchpoint)
 *   dbg.edit      {line, text}                   the source line is edited (the fix), it flashes
 *   dbg.mark      {line | var | frame} | {off: true}   a ring around a source line, a variable or a stack frame
 *   dbg.exit      {status?, msg?}                the process ends with this exit status
 *
 * Every action but dbg.mark and dbg.edit can type a console command (`cmd`), print `pre` lines when it is entered and `out` lines
 * when its effect lands (`wait_ms`, `line_ms`, `cps`), and the state-changing ones take the shared state props:
 *   file? code? first? lang?   a new source (step into another file, a rebuilt file)
 *   vars: {name: value | {value, tone: "bad" | "ok"}}  merged into the variables panel; a changed value flashes,
 *                              tone "bad" is the unexpected value (red, stays); vars_reset: true clears first; drop: [names]
 *   stack: [fn | {fn, at}]     the whole call stack, innermost first; frames that appear slide in; frame: <selected index>
 *   reason: step | breakpoint | watchpoint | signal | assert | exception ; msg: pill text
 * Signature moments: a breakpoint / watchpoint hit, a crash (signal, assert, exception), a variable flashing to a bad value.
 */
import type {Action} from '../../schema';
import type {Rect} from '../../theme';
import {CODE_MIN_PX, colW, wrapCodeLine} from '../../codewrap';
import type {WorldEvent, WorldText} from '../types';
import {msToFrames, needString, nv, optNumber, Props, sv} from '../kit';
import {langOf, tokenize} from './syntax';
import type {Lang, Tok} from './syntax';

export const DBG_ID = 'debugger';
export const DBG_ACTIONS = ['dbg.cmd', 'dbg.break', 'dbg.step', 'dbg.continue', 'dbg.stop', 'dbg.set', 'dbg.edit', 'dbg.mark', 'dbg.exit'] as const;

export const CPF = 1.5; // frames per typed character (20 characters per second)
export const ENTER_FRAMES = 6;
export const LINE_FRAMES = 4;
export const FLASH_FRAMES = 26; // a changed variable / a hit breakpoint stays lit this long
export const MOVE_FRAMES = 6; // the stepping highlight slides to its new line
export const RUN_FRAMES = 18; // default running time before a continue lands (600 ms)
export const MAX_CODE_COLS = 52;
export const MAX_CODE_LINES = 60;
export const MAX_CMD = 100;
export const MAX_OUT_LINE = 100;
export const MAX_OUT_LINES = 14;
export const MAX_VARS = 6;
export const MAX_STACK = 7;
export const MAX_NAME = 16;
export const MAX_VALUE = 30;
export const MAX_FN = 22;
export const MAX_MSG = 34;
export const DEFAULT_PROMPT = '(gdb)';

export const REASONS = ['step', 'breakpoint', 'watchpoint', 'signal', 'assert', 'exception'] as const;
export type Reason = (typeof REASONS)[number];
export const CRASH_REASONS: readonly string[] = ['signal', 'assert', 'exception'];
export const HIT_REASONS: readonly string[] = ['breakpoint', 'watchpoint'];
export const KINDS = ['over', 'into', 'out'] as const;
export const TONES = ['out', 'err', 'warn', 'ok', 'dim'] as const;
export type Tone = (typeof TONES)[number];
export type VarTone = 'bad' | 'ok' | null;

const STATE_KINDS = ['dbg.step', 'dbg.continue', 'dbg.stop', 'dbg.set', 'dbg.exit'];
const CONSOLE_KINDS = ['dbg.cmd', 'dbg.break', 'dbg.step', 'dbg.continue', 'dbg.stop', 'dbg.set', 'dbg.exit'];

// ------------------------------------------------------------------ prop parsing
export interface OutLine {
	text: string;
	tone: Tone;
}
export const outLines = (v: unknown): OutLine[] => {
	if (typeof v === 'string') return v.split('\n').map((text) => ({text, tone: 'out' as Tone}));
	if (!Array.isArray(v)) return [];
	return v.map((x) => {
		if (x && typeof x === 'object') {
			const o = x as Props;
			return {text: sv(o.text), tone: ((TONES as readonly string[]).includes(sv(o.tone)) ? sv(o.tone) : 'out') as Tone};
		}
		return {text: sv(x), tone: 'out' as Tone};
	});
};

export interface VarSpec {
	name: string;
	value: string;
	tone: VarTone;
}
export const varSpecs = (v: unknown): VarSpec[] => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
	return Object.entries(v as Props).map(([name, raw]) => {
		if (raw && typeof raw === 'object') {
			const o = raw as Props;
			const tone = o.tone === 'bad' || o.tone === 'ok' ? o.tone : null;
			return {name, value: sv(o.value), tone: tone as VarTone};
		}
		return {name, value: sv(raw), tone: null};
	});
};

export interface FrameSpec {
	fn: string;
	at: string;
}
export const frameSpecs = (v: unknown): FrameSpec[] | null => {
	if (!Array.isArray(v)) return null;
	return v.map((x) => (x && typeof x === 'object' ? {fn: sv((x as Props).fn), at: sv((x as Props).at)} : {fn: sv(x), at: ''}));
};

export const codeLines = (v: unknown): string[] | null => {
	if (typeof v === 'string') return v.replace(/\s+$/, '').split('\n');
	if (Array.isArray(v)) return v.map((x) => sv(x));
	return null;
};

const lineOf = (p: Props): number | null => {
	const v = p.line ?? (p.do === 'dbg.continue' ? p.to : undefined);
	return typeof v === 'number' && Number.isInteger(v) ? v : null;
};
const reasonOf = (p: Props): Reason => {
	const r = sv(p.reason);
	if ((REASONS as readonly string[]).includes(r)) return r as Reason;
	return p.do === 'dbg.stop' || p.do === 'dbg.continue' ? 'breakpoint' : 'step';
};

// ------------------------------------------------------------------ timing of one action
const cpfOf = (p: Props) => (typeof p.cps === 'number' && p.cps > 0 ? 30 / p.cps : CPF);
const gapOf = (p: Props) => (typeof p.line_ms === 'number' ? Math.max(1, msToFrames(p.line_ms)) : LINE_FRAMES);

export interface Schedule {
	cmd: string;
	cpf: number;
	/** frames until the command is fully typed */
	typeEnd: number;
	/** frames until Enter is pressed (the button press, `pre` output) */
	enter: number;
	/** frames until the effect lands (stepping highlight, new values): Enter, plus the running time of a continue */
	land: number;
	pre: OutLine[];
	preT: number[];
	out: OutLine[];
	outT: number[];
	/** frames until everything is on screen (before the flash settles) */
	last: number;
}
export const schedule = (p: Props): Schedule => {
	const kind = sv(p.do);
	const cmd = sv(p.cmd);
	const cpf = cpfOf(p);
	const typeEnd = cmd ? Math.ceil(cmd.length * cpf) : 0;
	const enter = cmd ? typeEnd + ENTER_FRAMES : 0;
	const run = kind === 'dbg.continue' && lineOf(p) !== null ? Math.max(1, msToFrames(nv(p.run_ms, (RUN_FRAMES / 30) * 1000))) : 0;
	const land = enter + run;
	const gap = gapOf(p);
	const pre = outLines(p.pre);
	const out = outLines(p.out);
	const preT = pre.map((_, i) => enter + i * gap);
	const outStart = Math.max(land + msToFrames(nv(p.wait_ms, 0)), pre.length ? preT[preT.length - 1] + gap : 0);
	const outT = out.map((_, i) => outStart + i * gap);
	const last = Math.max(land, typeEnd, ...preT, ...outT);
	return {cmd, cpf, typeEnd, enter, land, pre, preT, out, outT, last};
};

// ------------------------------------------------------------------ plan (whole session, frame independent)
type Op =
	| {t: number; k: 'setup'; title?: string; prompt?: string; varsTitle?: string; stackTitle?: string}
	| {t: number; k: 'file'; file: string; code: string[]; first: number; lang: Lang}
	| {t: number; k: 'bp'; lines: number[]; on: boolean}
	| {t: number; k: 'edit'; line: number; text: string}
	| {t: number; k: 'run'}
	| {t: number; k: 'move'; line: number; reason: Reason; msg: string; how: string}
	| {t: number; k: 'vars'; set: VarSpec[]; reset: boolean; drop: string[]; title?: string}
	| {t: number; k: 'stack'; frames: FrameSpec[]; title?: string}
	| {t: number; k: 'frame'; index: number}
	| {t: number; k: 'mark'; line?: number; name?: string; frame?: number; off?: boolean}
	| {t: number; k: 'exit'; code: number; msg: string}
	| {t: number; k: 'ctl'; kind: Ctl};

export type Ctl = 'continue' | 'over' | 'into' | 'out';

interface PLine extends OutLine {
	t: number;
}
interface Entry {
	beat: number;
	cmd: string;
	prompt: string;
	start: number;
	cpf: number;
	typeEnd: number;
	enter: number;
	lines: PLine[];
	/** frame at which the entry is complete (last output line) */
	endAt: number;
}
interface Plan {
	ops: Op[];
	entries: Entry[];
	/** widest source line of the whole session (the code font stays the same for the whole reel) */
	maxCode: number;
	maxStackCols: number;
	issues: string[];
}

const plans = new WeakMap<WorldEvent[], Plan>();

export const planDebugger = (events: WorldEvent[]): Plan => {
	const hit = plans.get(events);
	if (hit) return hit;
	const ops: Op[] = [];
	const entries: Entry[] = [];
	const issues: string[] = [];
	let maxCode = 0;
	let maxStackCols = 0;
	let prompt = DEFAULT_PROMPT;
	let codeLen = 0;
	let haveCode = false;
	/** frame at which the process is running until (Infinity: until a stop), or -1 */
	let runUntil = -1;
	const range = (beat: number, what: string, line: number | null) => {
		if (line !== null && codeLen > 0 && (line < 1 || line > codeLen)) issues.push(`beat ${beat}: ${what} line ${line} is outside the source (1..${codeLen})`);
	};
	for (const e of events) {
		const p = e.action as Props;
		const k = String(e.action.do);
		const t = e.frame;
		const isSet = k === 'world.set';
		// ---- shared pieces
		if (isSet) {
			const setup = ['title', 'prompt', 'vars_title', 'stack_title'].some((x) => typeof p[x] === 'string');
			if (typeof p.prompt === 'string') prompt = p.prompt;
			if (setup) ops.push({t, k: 'setup', title: typeof p.title === 'string' ? p.title : undefined, prompt: typeof p.prompt === 'string' ? p.prompt : undefined, varsTitle: typeof p.vars_title === 'string' ? p.vars_title : undefined, stackTitle: typeof p.stack_title === 'string' ? p.stack_title : undefined});
		} else if (!(DBG_ACTIONS as readonly string[]).includes(k)) continue;
		const sc = isSet ? ({cmd: '', cpf: CPF, typeEnd: 0, enter: 0, land: 0, pre: [], preT: [], out: [], outT: [], last: 0} as Schedule) : schedule(p);
		const enter = t + sc.enter;
		const land = t + sc.land;
		// a new command while the last one is still printing: its output appears at once (and the gate reports it)
		if (!isSet && (sc.cmd || sc.pre.length || sc.out.length || CONSOLE_KINDS.includes(k))) {
			const prev = entries[entries.length - 1];
			if (prev && sc.cmd && prev.endAt > t) {
				for (const l of prev.lines) if (l.t > t) l.t = t;
				issues.push(`beat ${e.beat}: "${sc.cmd}" is typed while "${prev.cmd || 'the previous output'}" is still printing; its remaining output appears at once (start it later or shorten the output)`);
				prev.endAt = t;
			}
		}
		if (!isSet && runUntil >= 0 && t < runUntil && k !== 'dbg.stop' && k !== 'dbg.exit' && k !== 'dbg.cmd' && k !== 'dbg.mark' && k !== 'dbg.break') {
			issues.push(`beat ${e.beat}: ${k} fires while the process is running (end the run with dbg.stop or dbg.exit first)`);
		}
		const sourceOps = (at: number) => {
			const lines = codeLines(p.code);
			if (lines) {
				ops.push({t: at, k: 'file', file: sv(p.file, sv(p.name, 'main.c')), code: lines, first: nv(p.first, 1), lang: langOf(p.lang)});
				codeLen = lines.length;
				haveCode = true;
				for (const l of lines) maxCode = Math.max(maxCode, l.length);
			} else if (typeof p.file === 'string' || typeof p.first === 'number') {
				ops.push({t: at, k: 'file', file: sv(p.file), code: [], first: nv(p.first, 1), lang: langOf(p.lang)});
			}
		};
		const stateOps = (at: number) => {
			const v = p.vars !== undefined || p.drop !== undefined || p.vars_reset === true || typeof p.vars_title === 'string';
			if (v) ops.push({t: at, k: 'vars', set: varSpecs(p.vars), reset: p.vars_reset === true, drop: Array.isArray(p.drop) ? p.drop.map((x) => sv(x)) : [], title: typeof p.vars_title === 'string' ? p.vars_title : undefined});
			const fr = frameSpecs(p.stack);
			if (fr) {
				ops.push({t: at, k: 'stack', frames: fr, title: typeof p.stack_title === 'string' ? p.stack_title : undefined});
				fr.forEach((f, i) => {
					maxStackCols = Math.max(maxStackCols, `#${i} ${f.fn}`.length + (f.at ? f.at.length + 1 : 0));
				});
			}
			if (typeof p.frame === 'number') ops.push({t: at, k: 'frame', index: p.frame});
		};
		const consoleEntry = () => {
			if (!sc.cmd && !sc.pre.length && !sc.out.length) return;
			const lines: PLine[] = [...sc.pre.map((l, i) => ({...l, t: t + sc.preT[i]})), ...sc.out.map((l, i) => ({...l, t: t + sc.outT[i]}))];
			entries.push({beat: e.beat, cmd: sc.cmd, prompt, start: t, cpf: sc.cpf, typeEnd: t + sc.typeEnd, enter, lines, endAt: Math.max(t + sc.last, ...lines.map((l) => l.t))});
		};
		// ---- per action
		switch (k) {
			case 'world.set': {
				sourceOps(t);
				const bps = Array.isArray(p.breakpoints) ? (p.breakpoints as unknown[]).filter((x): x is number => typeof x === 'number') : [];
				if (bps.length) ops.push({t, k: 'bp', lines: bps, on: true});
				for (const b of bps) range(e.beat, 'breakpoint', b);
				stateOps(t);
				const line = lineOf(p);
				if (line !== null) {
					range(e.beat, 'world.set', line);
					ops.push({t, k: 'move', line, reason: reasonOf({...p, do: 'dbg.step'}), msg: sv(p.msg), how: 'stop'});
				}
				break;
			}
			case 'dbg.cmd':
				consoleEntry();
				break;
			case 'dbg.break': {
				const lines = Array.isArray(p.lines) ? (p.lines as unknown[]).filter((x): x is number => typeof x === 'number') : typeof p.line === 'number' ? [p.line] : [];
				for (const l of lines) range(e.beat, 'breakpoint', l);
				consoleEntry();
				ops.push({t: enter, k: 'bp', lines, on: p.off !== true});
				break;
			}
			case 'dbg.edit': {
				const line = lineOf(p);
				range(e.beat, 'dbg.edit', line);
				if (line !== null) {
					ops.push({t, k: 'edit', line, text: sv(p.text)});
					maxCode = Math.max(maxCode, sv(p.text).length);
				}
				break;
			}
			case 'dbg.mark':
				ops.push({t, k: 'mark', off: p.off === true, line: typeof p.line === 'number' ? p.line : undefined, name: typeof p.var === 'string' ? p.var : undefined, frame: typeof p.frame === 'number' ? p.frame : undefined});
				if (typeof p.line === 'number') range(e.beat, 'dbg.mark', p.line);
				break;
			case 'dbg.step':
			case 'dbg.continue':
			case 'dbg.stop':
			case 'dbg.set':
			case 'dbg.exit': {
				consoleEntry();
				const kind = sv(p.kind, 'over');
				if (k === 'dbg.step') ops.push({t: enter, k: 'ctl', kind: kind === 'into' ? 'into' : kind === 'out' ? 'out' : 'over'});
				if (k === 'dbg.continue') ops.push({t: enter, k: 'ctl', kind: 'continue'});
				const line = lineOf(p);
				if (k === 'dbg.continue') {
					ops.push({t: enter, k: 'run'});
					runUntil = line !== null ? land : Infinity;
				} else runUntil = -1;
				const moves = k === 'dbg.step' || k === 'dbg.stop' || (k === 'dbg.continue' && line !== null);
				if (k === 'dbg.exit') {
					ops.push({t: land, k: 'exit', code: nv(p.status, 0), msg: sv(p.msg)});
				} else if (k !== 'dbg.continue' || line !== null) {
					sourceOps(land);
					stateOps(land);
					if (moves && line !== null) {
						range(e.beat, k, line);
						ops.push({t: land, k: 'move', line, reason: reasonOf(p), msg: sv(p.msg), how: k === 'dbg.step' ? kind : k === 'dbg.continue' ? 'cont' : 'stop'});
					}
				}
				break;
			}
		}
	}
	if (!haveCode && events.length) issues.push('the debugger needs a world.set with "code" (the source file to show) before any dbg action');
	ops.sort((a, b) => a.t - b.t); // stable: actions that land together keep their script order
	const plan: Plan = {ops, entries, maxCode, maxStackCols, issues};
	plans.set(events, plan);
	return plan;
};

// ------------------------------------------------------------------ state at a frame
export interface Breakpoint {
	line: number;
	setAt: number;
	hitAt: number | null;
}
export interface DbgVar {
	name: string;
	value: string;
	prev: string | null;
	addedAt: number;
	/** frame the value (or its tone) last changed; -1000 = never flashed */
	changedAt: number;
	tone: VarTone;
}
export interface DbgFrame {
	fn: string;
	at: string;
	addedAt: number;
}
export interface CurLine {
	line: number;
	/** the line the highlight comes from (same file), for the slide */
	prev: number | null;
	movedAt: number;
	reason: Reason;
	how: string;
}
export type Status = 'idle' | 'running' | 'paused' | 'crashed' | 'exited';

export interface ConRow {
	kind: 'cmd' | 'out' | 'prompt';
	prompt: string;
	text: string;
	typed: number;
	tone: Tone;
	cursor: boolean;
}

export interface DbgState {
	visible: boolean;
	frame: number;
	title: string;
	prompt: string;
	file: string;
	lang: Lang;
	first: number;
	code: string[];
	/** lines edited (the fix), with the frame of the edit */
	edits: {line: number; at: number}[];
	breakpoints: Breakpoint[];
	status: Status;
	statusAt: number;
	pill: string;
	cur: CurLine | null;
	varsTitle: string;
	vars: DbgVar[];
	stackTitle: string;
	stack: DbgFrame[];
	sel: number;
	mark: {line: number | null; name: string | null; frame: number | null; at: number};
	ctl: {kind: Ctl; at: number} | null;
	con: ConRow[];
	typing: boolean;
	/** widest source line / stack row of the whole session (fonts and column widths stay the same for the whole reel) */
	maxCode: number;
	maxStackCols: number;
}

const PILL: Record<Reason, string> = {step: 'paused', breakpoint: 'breakpoint hit', watchpoint: 'watchpoint hit', signal: 'signal received', assert: 'assertion failed', exception: 'exception'};
export const pillFor = (reason: Reason, how: string, msg: string): string => {
	if (msg) return msg;
	if (reason === 'step') return how === 'over' ? 'step over' : how === 'into' ? 'step into' : how === 'out' ? 'step out' : PILL.step;
	return PILL[reason];
};

const sameStack = (a: DbgFrame[], b: FrameSpec[], t: number): DbgFrame[] => {
	// frames are kept from the outermost one up; the first difference starts the frames that are new
	const out: DbgFrame[] = [];
	let same = true;
	for (let k = 0; k < b.length; k++) {
		const nb = b[b.length - 1 - k];
		const ob = a[a.length - 1 - k];
		if (same && ob && ob.fn === nb.fn) out.unshift({fn: nb.fn, at: nb.at, addedAt: ob.addedAt});
		else {
			same = false;
			out.unshift({fn: nb.fn, at: nb.at, addedAt: t});
		}
	}
	return out;
};

export const dbgStateAt = (events: WorldEvent[], frame: number): DbgState => {
	const plan = planDebugger(events);
	const s: DbgState = {
		visible: events.length > 0 && frame >= events[0].frame,
		frame,
		title: 'gdb',
		prompt: DEFAULT_PROMPT,
		file: 'main.c',
		lang: 'c',
		first: 1,
		code: [],
		edits: [],
		breakpoints: [],
		status: 'idle',
		statusAt: 0,
		pill: 'not started',
		cur: null,
		varsTitle: 'Variables',
		vars: [],
		stackTitle: 'Call Stack',
		stack: [],
		sel: 0,
		mark: {line: null, name: null, frame: null, at: -1000},
		ctl: null,
		con: [],
		typing: false,
		maxCode: plan.maxCode,
		maxStackCols: plan.maxStackCols,
	};
	let lastLine: number | null = null;
	for (const op of plan.ops) {
		if (op.t > frame) break;
		switch (op.k) {
			case 'setup':
				if (op.title !== undefined) s.title = op.title;
				if (op.prompt !== undefined) s.prompt = op.prompt;
				if (op.varsTitle !== undefined) s.varsTitle = op.varsTitle;
				if (op.stackTitle !== undefined) s.stackTitle = op.stackTitle;
				break;
			case 'file':
				if (op.code.length) {
					s.code = op.code;
					s.edits = [];
					lastLine = null;
				}
				if (op.file) s.file = op.file;
				s.first = op.first;
				s.lang = op.lang;
				break;
			case 'bp':
				for (const l of op.lines) {
					const i = s.breakpoints.findIndex((b) => b.line === l);
					if (op.on && i < 0) s.breakpoints.push({line: l, setAt: op.t, hitAt: null});
					else if (!op.on && i >= 0) s.breakpoints.splice(i, 1);
				}
				break;
			case 'edit':
				if (op.line >= 1 && op.line <= s.code.length) {
					s.code = s.code.map((c, i) => (i === op.line - 1 ? op.text : c));
					s.edits = [...s.edits.filter((x) => x.line !== op.line), {line: op.line, at: op.t}];
				}
				break;
			case 'run':
				if (s.cur) lastLine = s.cur.line;
				s.cur = null;
				s.status = 'running';
				s.statusAt = op.t;
				s.pill = 'running';
				break;
			case 'move': {
				const prev = s.cur ? s.cur.line : lastLine;
				s.cur = {line: op.line, prev: prev !== null && prev !== op.line ? prev : null, movedAt: op.t, reason: op.reason, how: op.how};
				s.status = CRASH_REASONS.includes(op.reason) ? 'crashed' : 'paused';
				s.statusAt = op.t;
				s.pill = pillFor(op.reason, op.how, op.msg);
				if (HIT_REASONS.includes(op.reason)) {
					const b = s.breakpoints.find((x) => x.line === op.line);
					if (b) b.hitAt = op.t;
				}
				lastLine = op.line;
				break;
			}
			case 'vars': {
				if (op.title !== undefined) s.varsTitle = op.title;
				if (op.reset) s.vars = [];
				if (op.drop.length) s.vars = s.vars.filter((v) => !op.drop.includes(v.name));
				for (const sp of op.set) {
					const cur = s.vars.find((v) => v.name === sp.name);
					if (!cur) s.vars.push({name: sp.name, value: sp.value, prev: null, addedAt: op.t, changedAt: op.t, tone: sp.tone});
					else if (cur.value !== sp.value || cur.tone !== sp.tone) {
						s.vars = s.vars.map((v) => (v === cur ? {...v, prev: v.value !== sp.value ? v.value : v.prev, value: sp.value, tone: sp.tone, changedAt: op.t} : v));
					}
				}
				break;
			}
			case 'stack':
				if (op.title !== undefined) s.stackTitle = op.title;
				s.stack = sameStack(s.stack, op.frames, op.t);
				s.sel = Math.min(s.sel, Math.max(0, s.stack.length - 1));
				break;
			case 'frame':
				s.sel = Math.max(0, Math.min(op.index, Math.max(0, s.stack.length - 1)));
				break;
			case 'mark':
				if (op.off) s.mark = {line: null, name: null, frame: null, at: op.t};
				else s.mark = {line: op.line ?? s.mark.line, name: op.name ?? s.mark.name, frame: op.frame ?? s.mark.frame, at: op.t};
				break;
			case 'exit':
				s.status = 'exited';
				s.statusAt = op.t;
				s.pill = op.msg || `exited with code ${op.code}`;
				s.cur = null;
				s.stack = [];
				s.vars = [];
				s.sel = 0;
				break;
			case 'ctl':
				s.ctl = {kind: op.kind, at: op.t};
				break;
		}
	}
	// console
	const rows: ConRow[] = [];
	const started = plan.entries.filter((en) => en.start <= frame);
	const last = started[started.length - 1];
	for (const en of started) {
		if (en.cmd) {
			const typed = frame >= en.typeEnd ? en.cmd.length : Math.min(en.cmd.length, Math.floor((frame - en.start) / en.cpf) + 1);
			rows.push({kind: 'cmd', prompt: en.prompt, text: en.cmd, typed, tone: 'out', cursor: en === last && frame < en.enter});
		}
		for (const l of en.lines) if (l.t <= frame) rows.push({kind: 'out', prompt: '', text: l.text, typed: l.text.length, tone: l.tone, cursor: false});
	}
	s.typing = !!last && !!last.cmd && frame < last.typeEnd;
	const busy = !!last && frame < last.endAt;
	if (s.visible && s.status !== 'running' && !busy) rows.push({kind: 'prompt', prompt: s.prompt, text: '', typed: 0, tone: 'out', cursor: true});
	s.con = rows;
	return s;
};

// ------------------------------------------------------------------ layout (shared by the view and the QA gate)
export const TITLE_H = 34;
export const CTL_H = 46;
export const PAD = 10;
export const GAP = 6;
export const PANEL_FS = 17;
export const PANEL_LH = 25;
export const PANEL_HEAD = 26;
export const PANEL_ROWS = 6;
export const CON_FS = 16;
export const CON_LH = 22;
export const CON_ROWS = 5;
export const CODE_FS_MAX = 20;
export const CODE_FS_MIN = 16;

export interface CodeRowL {
	/** index into state.code */
	i: number;
	y: number;
}
export interface DbgLayout {
	fs: number;
	lh: number;
	cw: number;
	title: Rect;
	ctl: Rect;
	code: Rect;
	/** x where source text starts (inside `code`) */
	textX: number;
	numX: number;
	numW: number;
	cols: number;
	cap: number;
	top: number;
	total: number;
	vars: Rect;
	stack: Rect;
	varCap: number;
	stackCap: number;
	varCols: number;
	stackCols: number;
	stackTop: number;
	con: Rect;
	conCols: number;
	conCap: number;
	conRows: {row: number; sub: number; text: string; shown: number; promptLen: number; indent: number; y: number}[];
	conClean: boolean;
	clean: boolean;
}

export const pickCodeFont = (maxCols: number, textW: number): number => {
	for (let fs = CODE_FS_MAX; fs > CODE_FS_MIN; fs--) if (maxCols * colW(fs) <= textW) return fs;
	return CODE_FS_MIN;
};

/**
 * The first source row shown when the highlight is on `line`: the pane stays put while the line is in its upper rows
 * (stepping back and forth never scrolls) and follows it down once it gets within 2 rows of the bottom.
 */
export const codeTop = (line: number | null, first: number, total: number, cap: number): number => {
	if (total <= cap || line === null) return 0;
	const idx = Math.max(0, Math.min(total - 1, line - first));
	return Math.max(0, Math.min(idx - (cap - 3), total - cap));
};

/** The first source row shown: the page of the highlighted line, moved just enough to keep a marked line in view too. */
export const focusTop = (s: DbgState, cap: number): number => {
	const total = Math.max(1, s.code.length);
	const base = codeTop(s.cur ? s.cur.line : null, s.first, total, cap);
	if (s.mark.line === null || total <= cap) return base;
	const m = s.mark.line - s.first;
	if (m >= base && m < base + cap) return base;
	const maxTop = total - cap;
	if (s.cur) {
		const ci = s.cur.line - s.first;
		const lo = Math.min(ci, m);
		const hi = Math.max(ci, m);
		if (hi - lo < cap) return Math.max(0, Math.min(maxTop, Math.min(Math.max(base, hi - cap + 1), lo)));
		if (s.mark.at < s.cur.movedAt) return base;
	}
	return codeTop(s.mark.line, s.first, total, cap);
};

export const dbgLayout = (s: DbgState, rect: Rect): DbgLayout => {
	const w = rect.w;
	const title: Rect = {x: 0, y: 0, w, h: TITLE_H};
	const ctl: Rect = {x: 0, y: TITLE_H, w, h: CTL_H};
	const conH = CON_ROWS * CON_LH + 14;
	const panH = PANEL_HEAD + PANEL_ROWS * PANEL_LH + 8;
	const codeY = TITLE_H + CTL_H;
	const code: Rect = {x: 0, y: codeY, w, h: Math.max(0, rect.h - codeY - panH - conH - GAP * 2)};
	const panY = code.y + code.h + GAP;
	const cwP = colW(PANEL_FS);
	const stackW = Math.round(Math.max(190, Math.min(300, (s.maxStackCols + 3) * cwP + 26)));
	const varsW = w - stackW - GAP;
	const vars: Rect = {x: 0, y: panY, w: varsW, h: panH};
	const stack: Rect = {x: varsW + GAP, y: panY, w: stackW, h: panH};
	const con: Rect = {x: 0, y: panY + panH + GAP, w, h: conH};

	const total = Math.max(1, s.code.length);
	const digits = String(s.first + total - 1).length;
	const gutter = 26;
	const textXFor = (cw: number) => gutter + digits * cw + 18;
	// font from the widest line of the session, on the width left after the gutter
	const fs0 = pickCodeFont(s.maxCode, w - textXFor(colW(CODE_FS_MIN)) - 8);
	let fs = Math.max(CODE_MIN_PX, fs0);
	let cw = colW(fs);
	// the gutter depends on the font: settle it once more
	fs = Math.max(CODE_MIN_PX, pickCodeFont(s.maxCode, w - textXFor(cw) - 8));
	cw = colW(fs);
	const lh = Math.round(fs * 1.45);
	const textX = textXFor(cw);
	const cols = Math.max(8, Math.floor((w - textX - 8) / cw));
	const cap = Math.max(1, Math.floor(code.h / lh));
	const top = focusTop(s, cap);
	let clean = true;
	for (const l of s.code) if (l.length > cols) clean = false;

	const varCap = PANEL_ROWS;
	const stackCap = PANEL_ROWS;
	const varCols = Math.floor((varsW - 22) / cwP);
	const stackCols = Math.floor((stackW - 34) / cwP);
	const stackTop = Math.max(0, Math.min(s.stack.length - stackCap, Math.max(0, s.sel - stackCap + 1)));

	// console: wrapped rows, newest at the bottom
	const cwC = colW(CON_FS);
	const conCols = Math.max(8, Math.floor((w - 28) / cwC));
	const flat: Omit<DbgLayout['conRows'][number], 'y'>[] = [];
	let conClean = true;
	s.con.forEach((r, ri) => {
		const promptLen = r.kind === 'out' ? 0 : r.prompt.length + 1;
		const full = r.kind === 'out' ? r.text : `${r.prompt} ${r.text}`;
		const wr = wrapCodeLine(full, conCols);
		conClean = conClean && wr.clean;
		let left = r.kind === 'out' ? Infinity : promptLen + r.typed;
		wr.rows.forEach((row, sub) => {
			const indent = sub === 0 ? 0 : row.length - row.trimStart().length;
			const text = sub === 0 ? row : row.slice(indent);
			const shown = Math.max(0, Math.min(text.length, left));
			left -= text.length + (sub === 0 ? 0 : 1);
			flat.push({row: ri, sub, text, shown, promptLen: sub === 0 ? Math.min(promptLen, text.length) : 0, indent});
		});
	});
	const conCap = CON_ROWS;
	const conTop = Math.max(0, flat.length - conCap);
	const conRows = flat.slice(conTop).map((v, i) => ({...v, y: con.y + 8 + i * CON_LH}));
	return {fs, lh, cw, title, ctl, code, textX, numX: gutter, numW: digits * cw, cols, cap, top, total, vars, stack, varCap, stackCap, varCols, stackCols, stackTop, con, conCols, conCap, conRows, conClean, clean};
};

export const varText = (v: DbgVar) => `${v.name} = ${v.value}`;
export const frameText = (f: DbgFrame, i: number) => `#${i} ${f.fn}${f.at ? ` ${f.at}` : ''}`;

/** What a viewer can read: title, status pill, source rows, variables, stack frames and console rows. */
export const dbgTexts = (s: DbgState, rect: Rect): string[] => {
	if (!s.visible) return [];
	const lay = dbgLayout(s, rect);
	const out: string[] = [s.title, s.pill, s.file];
	for (let i = lay.top; i < Math.min(s.code.length, lay.top + lay.cap); i++) {
		const t = s.code[i].trim();
		if (t) out.push(t);
	}
	s.vars.slice(0, lay.varCap).forEach((v) => out.push(varText(v)));
	s.stack.slice(lay.stackTop, lay.stackTop + lay.stackCap).forEach((f, i) => out.push(frameText(f, lay.stackTop + i)));
	for (const v of lay.conRows) {
		const t = v.text.slice(0, v.shown).trim();
		if (t) out.push(t);
	}
	return out.filter(Boolean);
};

export const dbgProblems = (s: DbgState, rect: Rect): string[] => {
	if (!s.visible) return [];
	const lay = dbgLayout(s, rect);
	const out: string[] = [];
	if (lay.fs < CODE_MIN_PX) out.push(`source font ${lay.fs} px < ${CODE_MIN_PX} px`);
	if (lay.cap < 6) out.push(`the source pane shows only ${lay.cap} rows (slot ${Math.round(rect.w)}x${Math.round(rect.h)})`);
	if (!lay.clean) out.push(`a source line is wider than the pane (${lay.cols} columns)`);
	if (!lay.conClean) out.push('a console line has a token wider than the console and is cut mid-token');
	if (!s.code.length) out.push('no source on screen (the first world.set needs "code")');
	if (s.cur && (s.cur.line < s.first || s.cur.line > s.first + s.code.length - 1)) out.push(`the highlighted line ${s.cur.line} is outside the source`);
	if (s.cur) {
		const i = s.cur.line - s.first;
		if (i < lay.top || i >= lay.top + lay.cap) out.push(`the highlighted line ${s.cur.line} is not in view`);
	}
	if (s.vars.length > lay.varCap) out.push(`${s.vars.length} variables, the panel shows ${lay.varCap}`);
	for (const v of s.vars.slice(0, lay.varCap)) if (varText(v).length > lay.varCols) out.push(`variable "${varText(v)}" is wider than the panel (${lay.varCols} columns)`);
	if (s.stack.length > lay.stackCap) out.push(`${s.stack.length} stack frames, the panel shows ${lay.stackCap}`);
	for (const [i, f] of s.stack.entries()) if (frameText(f, i).length > lay.stackCols) out.push(`stack row "${frameText(f, i)}" is wider than the panel (${lay.stackCols} columns)`);
	if (s.mark.line !== null) {
		const i = s.mark.line - s.first;
		if (i < 0 || i >= s.code.length) out.push(`mark: line ${s.mark.line} is outside the source`);
		else if (i < lay.top || i >= lay.top + lay.cap) out.push(`mark: line ${s.mark.line} is not in view`);
	}
	if (s.mark.name !== null && !s.vars.some((v) => v.name === s.mark.name)) out.push(`mark: variable "${s.mark.name}" is not in the panel`);
	if (s.mark.frame !== null && (s.mark.frame < lay.stackTop || s.mark.frame >= Math.min(s.stack.length, lay.stackTop + lay.stackCap))) out.push(`mark: stack frame ${s.mark.frame} is not in the panel`);
	for (const b of s.breakpoints) if (b.line < s.first || b.line > s.first + s.code.length - 1) out.push(`breakpoint line ${b.line} is outside the source`);
	return out;
};

export const dbgTimelineProblems = (events: WorldEvent[]): string[] => planDebugger(events).issues;

// ------------------------------------------------------------------ source colouring (cached per source)
const tokCache = new WeakMap<string[], Tok[][]>();
export const tokensOf = (code: string[], lang: Lang): Tok[][] => {
	let t = tokCache.get(code);
	if (!t) tokCache.set(code, (t = tokenize(code, lang)));
	return t;
};

// ------------------------------------------------------------------ validation, tokens, rows, settle
const what = (a: Action) => String(a.do);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

const checkOut = (p: Props, key: 'out' | 'pre', errs: string[], w: string) => {
	const raw = key === 'out' ? (p.out) : p.pre;
	if (raw === undefined) return;
	if (typeof raw !== 'string' && !Array.isArray(raw)) return void errs.push(`${w}: "${key}" must be a string or an array of lines`);
	if (Array.isArray(raw)) {
		raw.forEach((x, i) => {
			if (typeof x === 'string') return;
			if (x && typeof x === 'object' && typeof (x as Props).text === 'string') {
				const tone = (x as Props).tone;
				if (tone !== undefined && !(TONES as readonly unknown[]).includes(tone)) errs.push(`${w}: ${key}[${i}].tone must be one of ${TONES.join(', ')}`);
				return;
			}
			errs.push(`${w}: ${key}[${i}] must be a string or {text, tone?}`);
		});
	}
	const lines = outLines(raw);
	if (lines.length > MAX_OUT_LINES) errs.push(`${w}: ${lines.length} ${key} lines (max ${MAX_OUT_LINES}); show the lines that matter, not a wall`);
	lines.forEach((l, i) => {
		if (l.text.length > MAX_OUT_LINE) errs.push(`${w}: ${key}[${i}] is ${l.text.length} characters (max ${MAX_OUT_LINE})`);
	});
};

const checkVars = (p: Props, errs: string[], w: string) => {
	if (p.vars !== undefined) {
		if (!p.vars || typeof p.vars !== 'object' || Array.isArray(p.vars)) return void errs.push(`${w}: "vars" must be an object {name: value}`);
		const entries = Object.entries(p.vars as Props);
		if (entries.length > MAX_VARS) errs.push(`${w}: ${entries.length} variables in one action (the panel holds ${MAX_VARS})`);
		for (const [name, raw] of entries) {
			if (!name || name.length > MAX_NAME) errs.push(`${w}: variable name "${name}" must be 1..${MAX_NAME} characters`);
			const value = raw && typeof raw === 'object' ? (raw as Props).value : raw;
			const tone = raw && typeof raw === 'object' ? (raw as Props).tone : undefined;
			if (typeof value !== 'string' && typeof value !== 'number') errs.push(`${w}: vars.${name} needs a string or number value`);
			else if (String(value).length > MAX_VALUE) errs.push(`${w}: vars.${name} is ${String(value).length} characters (max ${MAX_VALUE})`);
			if (tone !== undefined && tone !== 'bad' && tone !== 'ok') errs.push(`${w}: vars.${name}.tone must be "bad" or "ok"`);
		}
	}
	if (p.vars_reset !== undefined && typeof p.vars_reset !== 'boolean') errs.push(`${w}: "vars_reset" must be true or false`);
	if (p.drop !== undefined && (!Array.isArray(p.drop) || p.drop.some((x) => typeof x !== 'string'))) errs.push(`${w}: "drop" must be an array of variable names`);
};

const checkStack = (p: Props, errs: string[], w: string) => {
	if (p.stack !== undefined) {
		if (!Array.isArray(p.stack)) return void errs.push(`${w}: "stack" must be an array of frames (innermost first)`);
		if (p.stack.length > MAX_STACK) errs.push(`${w}: ${p.stack.length} stack frames (max ${MAX_STACK})`);
		p.stack.forEach((x, i) => {
			const fn = x && typeof x === 'object' ? (x as Props).fn : x;
			const at = x && typeof x === 'object' ? (x as Props).at : '';
			if (typeof fn !== 'string' || !fn.trim()) errs.push(`${w}: stack[${i}] needs a function name`);
			else if (fn.length > MAX_FN) errs.push(`${w}: stack[${i}] "${fn}" is ${fn.length} characters (max ${MAX_FN})`);
			if (at !== undefined && typeof at !== 'string') errs.push(`${w}: stack[${i}].at must be a string`);
			else if (typeof at === 'string' && at.length > 10) errs.push(`${w}: stack[${i}].at "${at}" is longer than 10 characters`);
		});
	}
	if (p.frame !== undefined && (!isInt(p.frame) || p.frame < 0)) errs.push(`${w}: "frame" must be a stack index (0 = innermost)`);
};

const checkSource = (p: Props, errs: string[], w: string) => {
	if (p.code !== undefined) {
		const lines = codeLines(p.code);
		if (!lines || !lines.length) return void errs.push(`${w}: "code" must be a string or an array of source lines`);
		if (lines.length > MAX_CODE_LINES) errs.push(`${w}: ${lines.length} source lines (max ${MAX_CODE_LINES})`);
		lines.forEach((l, i) => {
			if (l.length > MAX_CODE_COLS) errs.push(`${w}: code line ${i + 1} is ${l.length} characters (max ${MAX_CODE_COLS})`);
			if (/\t/.test(l)) errs.push(`${w}: code line ${i + 1} contains a tab (use spaces)`);
		});
	}
	if (p.file !== undefined && (typeof p.file !== 'string' || !p.file.trim() || p.file.length > 24)) errs.push(`${w}: "file" must be a file name of at most 24 characters`);
	if (p.first !== undefined && (!isInt(p.first) || p.first < 1)) errs.push(`${w}: "first" must be the number of the first source line (>= 1)`);
	if (p.lang !== undefined && langOf(p.lang) !== p.lang) errs.push(`${w}: "lang" must be c, cpp, java, kotlin, rust, python, ir or text`);
};

export const validateDbg = (a: Action): string[] => {
	const p = a as Props;
	const w = what(a);
	const errs: string[] = [];
	const k = String(a.do);
	if (CONSOLE_KINDS.includes(k)) {
		if (p.cmd !== undefined) errs.push(...needString(p, 'cmd', w, MAX_CMD));
		checkOut(p, 'out', errs, w);
		checkOut(p, 'pre', errs, w);
		errs.push(...optNumber(p, 'wait_ms', w, 0, 5000));
		errs.push(...optNumber(p, 'line_ms', w, 30, 2000));
		errs.push(...optNumber(p, 'cps', w, 5, 120));
	}
	if (STATE_KINDS.includes(k) || k === 'world.set') {
		checkVars(p, errs, w);
		checkStack(p, errs, w);
		checkSource(p, errs, w);
		if (p.reason !== undefined && !(REASONS as readonly unknown[]).includes(p.reason)) errs.push(`${w}: "reason" must be one of ${REASONS.join(', ')}`);
		if (p.msg !== undefined) errs.push(...needString(p, 'msg', w, MAX_MSG));
		if (p.vars_title !== undefined) errs.push(...needString(p, 'vars_title', w, 16));
		if (p.stack_title !== undefined) errs.push(...needString(p, 'stack_title', w, 16));
	}
	const needLine = (key = 'line') => {
		if (!isInt(p[key]) || (p[key] as number) < 1) errs.push(`${w} needs "${key}": <source line number>`);
	};
	switch (k) {
		case 'world.set':
			if (p.title !== undefined) errs.push(...needString(p, 'title', w, 40));
			if (p.prompt !== undefined) errs.push(...needString(p, 'prompt', w, 14));
			if (p.line !== undefined && (!isInt(p.line) || p.line < 1)) errs.push(`${w}: "line" must be a source line number`);
			if (p.breakpoints !== undefined && (!Array.isArray(p.breakpoints) || p.breakpoints.some((x) => !isInt(x) || x < 1))) errs.push(`${w}: "breakpoints" must be an array of source line numbers`);
			if (isInt(p.line) && Array.isArray(p.code) === false && typeof p.code === 'string' && codeLines(p.code)!.length < p.line) errs.push(`${w}: "line" ${p.line} is past the end of "code"`);
			break;
		case 'dbg.cmd':
			if (p.cmd === undefined && p.out === undefined && p.output === undefined && p.lines === undefined) errs.push(`${w} needs "cmd": "<command>" and/or "out": [...]`);
			break;
		case 'dbg.break': {
			const arr = Array.isArray(p.lines) ? p.lines : p.line !== undefined ? [p.line] : [];
			if (!arr.length || arr.some((x) => !isInt(x) || (x as number) < 1)) errs.push(`${w} needs "line": <n> or "lines": [<n>, ...]`);
			if (p.off !== undefined && typeof p.off !== 'boolean') errs.push(`${w}: "off" must be true or false`);
			break;
		}
		case 'dbg.step':
			needLine();
			if (p.kind !== undefined && !(KINDS as readonly unknown[]).includes(p.kind)) errs.push(`${w}: "kind" must be over, into or out`);
			break;
		case 'dbg.continue': {
			const l = p.line ?? p.to;
			if (l !== undefined && (!isInt(l) || l < 1)) errs.push(`${w}: "line" must be a source line number`);
			errs.push(...optNumber(p, 'run_ms', w, 100, 5000));
			break;
		}
		case 'dbg.stop':
			needLine();
			break;
		case 'dbg.set':
			if (p.vars === undefined && p.stack === undefined && p.drop === undefined && p.frame === undefined) errs.push(`${w} needs "vars", "stack", "drop" or "frame"`);
			break;
		case 'dbg.edit':
			needLine();
			errs.push(...needString(p, 'text', w, MAX_CODE_COLS));
			break;
		case 'dbg.mark':
			if (p.off !== true) {
				const n = ['line', 'var', 'frame'].filter((x) => p[x] !== undefined).length;
				if (n === 0) errs.push(`${w} needs "line", "var" or "frame" (or "off": true)`);
				if (p.line !== undefined && (!isInt(p.line) || p.line < 1)) errs.push(`${w}: "line" must be a source line number`);
				if (p.var !== undefined && (typeof p.var !== 'string' || !p.var)) errs.push(`${w}: "var" must be a variable name`);
				if (p.frame !== undefined && (!isInt(p.frame) || p.frame < 0)) errs.push(`${w}: "frame" must be a stack index`);
			}
			break;
		case 'dbg.exit':
			if (p.status !== undefined) errs.push(...optNumber(p, 'status', w, 0, 255, true));
			break;
	}
	return errs;
};

export const dbgTokens = (a: Action): WorldText[] => {
	const p = a as Props;
	const k = String(a.do);
	const out: WorldText[] = [];
	if (k === 'world.set') {
		for (const v of varSpecs(p.vars)) out.push({text: varText({...v, prev: null, addedAt: 0, changedAt: 0}), off: 0});
		frameSpecs(p.stack)?.forEach((f, i) => out.push({text: f.fn, off: 0 * i}));
		return out;
	}
	if (k === 'dbg.edit') return [{text: sv(p.text).trim(), off: 0}].filter((x) => x.text);
	if (k === 'dbg.mark' || k === 'dbg.break') return [];
	const sc = schedule(p);
	if (sc.cmd) out.push({text: sc.cmd, off: sc.typeEnd});
	sc.pre.forEach((l, i) => out.push({text: l.text, off: sc.preT[i]}));
	sc.out.forEach((l, i) => out.push({text: l.text, off: sc.outT[i]}));
	if (STATE_KINDS.includes(k)) {
		if (typeof p.msg === 'string') out.push({text: p.msg, off: sc.land});
		for (const v of varSpecs(p.vars)) out.push({text: varText({...v, prev: null, addedAt: 0, changedAt: 0}), off: sc.land});
		frameSpecs(p.stack)?.forEach((f) => out.push({text: f.fn, off: sc.land}));
	}
	return out;
};

export const dbgRows = (a: Action): number => {
	const p = a as Props;
	const k = String(a.do);
	let n = 0;
	if (CONSOLE_KINDS.includes(k)) n += (sv(p.cmd) ? 1 : 0) + outLines(p.pre).length + outLines(p.out).length;
	n += varSpecs(p.vars).length;
	n += frameSpecs(p.stack)?.length ?? 0;
	if (k === 'dbg.edit' || k === 'dbg.step' || k === 'dbg.stop' || k === 'dbg.continue') n += 1;
	return n;
};

export const dbgSettle = (a: Action): number => {
	const p = a as Props;
	const k = String(a.do);
	if (k === 'world.set') return FLASH_FRAMES + 4;
	if (k === 'dbg.mark' || k === 'dbg.edit') return FLASH_FRAMES + 2;
	const sc = schedule(p);
	return sc.last + (k === 'dbg.cmd' ? 2 : FLASH_FRAMES) + 2;
};

/** A breakpoint / watchpoint hit, a crash (signal, assert, exception), or a variable set to its unexpected value. */
export const dbgIsSignature = (a: Action): boolean => {
	const p = a as Props;
	const k = String(a.do);
	if (varSpecs(p.vars).some((v) => v.tone === 'bad')) return true;
	if (k === 'dbg.stop' || k === 'dbg.step' || (k === 'dbg.continue' && lineOf(p) !== null)) {
		const r = reasonOf(p);
		return HIT_REASONS.includes(r) || CRASH_REASONS.includes(r);
	}
	return false;
};
