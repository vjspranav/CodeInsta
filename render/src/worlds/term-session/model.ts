/**
 * term.session: a real terminal session, as a pure model.
 *
 *   world.set      {world: "term.session", cwd?: "~/linux", prompt?: "{cwd} $", title?: "zsh"}
 *   term.run       {cmd, out?: string | (string | {text, tone})[], exit?: 0..255, running?: true,
 *                   cwd?: "<cwd after the command>", wait_ms?, line_ms?, cps?}
 *                  types the command at the prompt (block cursor), presses Enter, streams the output one line
 *                  every line_ms (default 133 ms) after wait_ms, then shows the exit status and a fresh prompt.
 *                  running: true keeps the process in the foreground (no exit) until a term.exit.
 *   term.out       {out, line_ms?}           more output from the last command (a long-running process)
 *   term.exit      {code}                    the last command ends now with this exit status
 *   term.clear     {}                        Ctrl-L: the screen is cleared (and any highlight), a fresh prompt at the top
 *   term.highlight {match: "<text>"} | {off: true}   marks every visible row containing the text; scrolls
 *                                             back to it when it has scrolled out of view
 *
 * Tones for output lines: out (default), err, warn, ok, dim. A non-zero exit turns the command's gutter red,
 * shows "exit N" in red in the status bar and turns the next prompt symbol red (the signature moment).
 *
 * Timing rule: every action starts at its own frame. A command typed while the previous output is still
 * streaming makes that output appear at once (and the gate reports it), so token times stay exact.
 */
import type {Action} from '../../schema';
import type {Rect} from '../../theme';
import {CODE_MIN_PX, colW, wrapCodeLine} from '../../codewrap';
import type {WorldEvent, WorldText} from '../types';
import {msToFrames, needString, nv, optNumber, Props, sv} from '../kit';

export const TERM_ID = 'term.session';
export const TERM_ACTIONS = ['term.run', 'term.out', 'term.exit', 'term.clear', 'term.highlight'] as const;

/** frames per typed character (20 characters per second) */
export const CPF = 1.5;
/** frames between the last typed character and Enter */
export const ENTER_FRAMES = 6;
/** frames between streamed output lines */
export const LINE_FRAMES = 4;
/** frames between the last output line and the exit status */
export const EXIT_FRAMES = 4;
export const MAX_CMD = 120;
export const MAX_LINE = 160;
export const MAX_LINES = 16;
/** output streamed at least this slowly (ms per line, 3+ lines) counts as a signature moment */
export const STREAM_SIGNATURE_MS = 200;
export const DEFAULT_PROMPT = '{cwd} $';

export const TONES = ['out', 'err', 'warn', 'ok', 'dim'] as const;
export type Tone = (typeof TONES)[number];
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
			const tone = (TONES as readonly string[]).includes(sv(o.tone)) ? (sv(o.tone) as Tone) : 'out';
			return {text: sv(o.text), tone};
		}
		return {text: sv(x), tone: 'out' as Tone};
	});
};

const outOf = (p: Props) => outLines(p.out ?? p.output ?? p.lines);
const cpfOf = (p: Props) => (typeof p.cps === 'number' && p.cps > 0 ? 30 / p.cps : CPF);
const gapOf = (p: Props) => (typeof p.line_ms === 'number' ? Math.max(1, msToFrames(p.line_ms)) : LINE_FRAMES);
const promptFor = (tpl: string, cwd: string) => tpl.replace(/\{cwd\}/g, cwd);

/** Frame offsets (from the action) of one term.run: typing end, Enter, each output line, exit. */
export const runSchedule = (p: Props) => {
	const cmd = sv(p.cmd);
	const cpf = cpfOf(p);
	const typeEnd = Math.ceil(cmd.length * cpf);
	const enter = typeEnd + ENTER_FRAMES;
	const wait = msToFrames(nv(p.wait_ms, 0));
	const gap = gapOf(p);
	const out = outOf(p);
	const lines = out.map((_, i) => enter + wait + i * gap);
	const exit = p.running === true ? Infinity : (lines.length ? lines[lines.length - 1] : enter + wait) + EXIT_FRAMES;
	return {cmd, cpf, typeEnd, enter, lines, out, exit};
};

// ------------------------------------------------------------------ plan (whole session, frame independent)
interface PLine extends OutLine {
	t: number;
}
interface Block {
	idx: number;
	beat: number;
	cmd: string;
	prompt: string;
	start: number;
	cpf: number;
	typeEnd: number;
	lines: PLine[];
	exit: number | null;
	exitAt: number;
	cwdAfter: string;
}
interface Plan {
	blocks: Block[];
	clears: number[];
	highlights: {frame: number; match: string | null}[];
	titles: {frame: number; title: string}[];
	tpl: {frame: number; tpl: string; cwd: string}[];
	maxCols: number;
	issues: string[];
}

const plans = new WeakMap<WorldEvent[], Plan>();

export const planSession = (events: WorldEvent[]): Plan => {
	const hit = plans.get(events);
	if (hit) return hit;
	const blocks: Block[] = [];
	const clears: number[] = [];
	const highlights: Plan['highlights'] = [];
	const titles: Plan['titles'] = [];
	const tpls: Plan['tpl'] = [];
	const issues: string[] = [];
	let cwd = '~';
	let tpl = DEFAULT_PROMPT;
	const snap = (b: Block, f: number, why: string) => {
		let cut = false;
		for (const l of b.lines) if (l.t > f) {
			l.t = f;
			cut = true;
		}
		if (b.exitAt > f && b.exitAt !== Infinity) {
			b.exitAt = f;
			cut = true;
		}
		if (cut) issues.push(`beat ${b.beat}: "${b.cmd}" is still printing when ${why}; its remaining output appears at once (start the next action later or shorten the output)`);
	};
	for (const e of events) {
		const p = e.action as Props;
		switch (e.action.do) {
			case 'world.set': {
				if (typeof p.cwd === 'string') cwd = p.cwd;
				if (typeof p.prompt === 'string') tpl = p.prompt;
				titles.push({frame: e.frame, title: sv(p.title, 'zsh')});
				tpls.push({frame: e.frame, tpl, cwd});
				break;
			}
			case 'term.run': {
				const prev = blocks[blocks.length - 1];
				if (prev) {
					if (prev.exitAt === Infinity) issues.push(`beat ${e.beat}: "${sv(p.cmd)}" is typed while "${prev.cmd}" is still running in the foreground (end it with term.exit first)`);
					else snap(prev, e.frame, `"${sv(p.cmd)}" is typed`);
				}
				const s = runSchedule(p);
				const b: Block = {
					idx: blocks.length,
					beat: e.beat,
					cmd: s.cmd,
					prompt: promptFor(tpl, cwd),
					start: e.frame,
					cpf: s.cpf,
					typeEnd: e.frame + s.typeEnd,
					lines: s.out.map((l, i) => ({...l, t: e.frame + s.lines[i]})),
					exit: typeof p.exit === 'number' ? p.exit : p.running === true ? null : 0,
					exitAt: s.exit === Infinity ? Infinity : e.frame + s.exit,
					cwdAfter: typeof p.cwd === 'string' ? p.cwd : cwd,
				};
				if (b.cwdAfter !== cwd) tpls.push({frame: e.frame, tpl, cwd: b.cwdAfter});
				cwd = b.cwdAfter;
				blocks.push(b);
				break;
			}
			case 'term.out': {
				const b = blocks[blocks.length - 1];
				if (!b) {
					issues.push(`beat ${e.beat}: term.out before any term.run`);
					break;
				}
				if (b.exitAt !== Infinity && e.frame >= b.exitAt) issues.push(`beat ${e.beat}: term.out arrives after "${b.cmd}" already exited (give its term.run "running": true)`);
				const gap = gapOf(p);
				const add = outOf(p).map((l, i) => ({...l, t: e.frame + i * gap}));
				b.lines.push(...add);
				if (b.exitAt !== Infinity && add.length) b.exitAt = Math.max(b.exitAt, add[add.length - 1].t + EXIT_FRAMES);
				break;
			}
			case 'term.exit': {
				const b = blocks[blocks.length - 1];
				if (!b) {
					issues.push(`beat ${e.beat}: term.exit before any term.run`);
					break;
				}
				if (b.exitAt !== Infinity && e.frame >= b.exitAt && b.exit !== null && p.code !== b.exit) issues.push(`beat ${e.beat}: term.exit changes the exit status of "${b.cmd}" after it was shown`);
				snap(b, e.frame, 'term.exit fires');
				b.exit = nv(p.code, 0);
				b.exitAt = e.frame;
				break;
			}
			case 'term.clear': {
				const b = blocks[blocks.length - 1];
				if (b && b.exitAt !== Infinity) snap(b, e.frame, 'the screen is cleared');
				clears.push(e.frame);
				highlights.push({frame: e.frame, match: null}); // the highlighted rows are gone with the screen
				break;
			}
			case 'term.highlight': {
				const m = p.off === true ? null : sv(p.match, sv(p.text)) || null;
				highlights.push({frame: e.frame, match: m});
				break;
			}
		}
	}
	let maxCols = 0;
	for (const b of blocks) {
		maxCols = Math.max(maxCols, b.prompt.length + 1 + b.cmd.length);
		for (const l of b.lines) maxCols = Math.max(maxCols, l.text.length);
	}
	const plan: Plan = {blocks, clears, highlights, titles, tpl: tpls, maxCols, issues};
	plans.set(events, plan);
	return plan;
};

// ------------------------------------------------------------------ state at a frame
export interface TermRow {
	kind: 'cmd' | 'out' | 'prompt';
	prompt: string;
	/** full text of the row (command or output line), prompt excluded */
	text: string;
	/** characters of `text` on screen (typing) */
	typed: number;
	tone: Tone;
	block: number;
	hl: boolean;
	/** the block cursor sits at the end of this row */
	cursor: boolean;
	/** the command of this row's block exited non-zero (and that is already shown) */
	failed: boolean;
	/** the command of this row's block is still running */
	running: boolean;
	/** the prompt follows a failed command (its symbol turns red) */
	afterFail: boolean;
}

export interface TermState {
	visible: boolean;
	frame: number;
	title: string;
	cwd: string;
	rows: TermRow[];
	running: boolean;
	typing: boolean;
	lastExit: {code: number; frame: number; cmd: string} | null;
	highlight: string | null;
	/** longest row of the whole session (font size stays the same for the whole reel) */
	maxCols: number;
	/** frame the latest command started (status bar timer) */
	runningSince: number | null;
	runningCmd: string;
}

export const termStateAt = (events: WorldEvent[], frame: number): TermState => {
	const plan = planSession(events);
	const visible = events.length > 0 && frame >= events[0].frame;
	let title = 'zsh';
	for (const t of plan.titles) if (t.frame <= frame) title = t.title;
	let tpl = DEFAULT_PROMPT;
	let cwd = '~';
	for (const t of plan.tpl) if (t.frame <= frame) {
		tpl = t.tpl;
		cwd = t.cwd;
	}
	let clearAt = -Infinity;
	for (const c of plan.clears) if (c <= frame) clearAt = c;
	let highlight: string | null = null;
	for (const h of plan.highlights) if (h.frame <= frame) highlight = h.match;

	const rows: TermRow[] = [];
	const started = plan.blocks.filter((b) => b.start <= frame);
	const last = started[started.length - 1];
	let lastExit: TermState['lastExit'] = null;
	for (const b of started) {
		const done = frame >= b.exitAt;
		const failed = done && b.exit !== null && b.exit !== 0;
		if (done && b.exit !== null) lastExit = {code: b.exit, frame: b.exitAt, cmd: b.cmd};
		const running = !done;
		const base = {block: b.idx, hl: false, failed, running, afterFail: false};
		if (b.start >= clearAt) {
			const typed = frame >= b.typeEnd ? b.cmd.length : Math.min(b.cmd.length, Math.floor((frame - b.start) / b.cpf) + 1);
			rows.push({...base, kind: 'cmd', prompt: b.prompt, text: b.cmd, typed, tone: 'out', cursor: b === last && frame < b.typeEnd + ENTER_FRAMES});
		}
		for (const l of b.lines) if (l.t <= frame && l.t >= clearAt) rows.push({...base, kind: 'out', prompt: '', text: l.text, typed: l.text.length, tone: l.tone, cursor: false});
	}
	const idle = !last || frame >= last.exitAt;
	if (visible && idle) {
		const afterFail = !!last && last.exit !== null && last.exit !== 0;
		rows.push({kind: 'prompt', prompt: promptFor(tpl, cwd), text: '', typed: 0, tone: 'out', block: -1, hl: false, cursor: true, failed: false, running: false, afterFail});
	}
	if (highlight) for (const r of rows) if (r.kind !== 'prompt' && (r.kind === 'out' ? r.text : `${r.prompt} ${r.text}`).includes(highlight)) r.hl = true;
	return {
		visible,
		frame,
		title,
		cwd,
		rows,
		running: !idle,
		typing: !!last && !idle && frame < last.typeEnd,
		lastExit,
		highlight,
		maxCols: plan.maxCols,
		runningSince: last && !idle ? last.start : null,
		runningCmd: last && !idle ? last.cmd : '',
	};
};

// ------------------------------------------------------------------ layout (shared by the view and the QA gate)
export const TITLE_H = 40;
export const STATUS_H = 38;
export const PAD_X = 16;
export const PAD_Y = 12;
export const GUTTER = 10;
export const FONT_MAX = 24;
export const FONT_MIN = 18;

export interface TermVRow {
	row: number;
	/** wrapped sub-row index */
	sub: number;
	/** text drawn on this visual row (prompt included on the first sub-row of a command) */
	text: string;
	/** characters of `text` revealed */
	shown: number;
	/** prompt characters at the start of `text` */
	promptLen: number;
	indent: number;
	y: number;
}

export interface TermLayout {
	fs: number;
	lh: number;
	cols: number;
	cap: number;
	top: number;
	total: number;
	body: Rect;
	vrows: TermVRow[];
	clean: boolean;
}

export const pickFont = (maxCols: number, bodyW: number): number => {
	for (let fs = FONT_MAX; fs > FONT_MIN; fs--) if (maxCols * colW(fs) <= bodyW) return fs;
	return FONT_MIN;
};

export const termLayout = (s: TermState, rect: Rect): TermLayout => {
	const body: Rect = {x: PAD_X + GUTTER, y: TITLE_H + PAD_Y, w: rect.w - PAD_X * 2 - GUTTER, h: rect.h - TITLE_H - STATUS_H - PAD_Y * 2};
	const fs = Math.max(CODE_MIN_PX, pickFont(s.maxCols, body.w));
	const cw = colW(fs);
	const cols = Math.max(8, Math.floor(body.w / cw));
	const lh = Math.round(fs * 1.42);
	const cap = Math.max(1, Math.floor(body.h / lh));
	const flat: Omit<TermVRow, 'y'>[] = [];
	let clean = true;
	s.rows.forEach((r, ri) => {
		const promptLen = r.kind === 'out' ? 0 : r.prompt.length + 1;
		const full = r.kind === 'out' ? r.text : `${r.prompt} ${r.text}`;
		const w = wrapCodeLine(full, cols);
		clean = clean && w.clean;
		let left = r.kind === 'out' ? Infinity : promptLen + r.typed;
		w.rows.forEach((row, sub) => {
			const indent = sub === 0 ? 0 : row.length - row.trimStart().length;
			const text = sub === 0 ? row : row.slice(indent);
			const shown = Math.max(0, Math.min(text.length, left));
			left -= text.length + (sub === 0 ? 0 : 1);
			flat.push({row: ri, sub, text, shown, promptLen: sub === 0 ? Math.min(promptLen, text.length) : 0, indent});
		});
	});
	const total = flat.length;
	let top = Math.max(0, total - cap);
	// scrollback: a highlighted row that scrolled out of view is brought back
	const firstHl = flat.findIndex((v) => s.rows[v.row].hl);
	if (firstHl >= 0 && firstHl < top) top = firstHl;
	const vrows = flat.slice(top, top + cap).map((v, i) => ({...v, y: body.y + i * lh}));
	return {fs, lh, cols, cap, top, total, body, vrows, clean};
};

export const statusText = (s: TermState): {left: string; right: string; failed: boolean} => {
	const left = s.cwd;
	if (s.running) return {left, right: s.typing ? '' : 'running', failed: false};
	if (!s.lastExit) return {left, right: '', failed: false};
	return {left, right: `exit ${s.lastExit.code}`, failed: s.lastExit.code !== 0};
};

/** What a viewer can read: every drawn row (revealed part), the title and the status bar. */
export const termTexts = (s: TermState, rect: Rect): string[] => {
	if (!s.visible) return [];
	const lay = termLayout(s, rect);
	const out = lay.vrows.map((v) => v.text.slice(0, v.shown).trim()).filter(Boolean);
	const st = statusText(s);
	if (st.right) out.push(st.right);
	out.push(s.title);
	return out;
};

export const termProblems = (s: TermState, rect: Rect): string[] => {
	if (!s.visible) return [];
	const lay = termLayout(s, rect);
	const out: string[] = [];
	if (lay.fs < CODE_MIN_PX) out.push(`terminal font ${lay.fs} px < ${CODE_MIN_PX} px`);
	if (lay.cap < 6) out.push(`terminal shows only ${lay.cap} rows (slot ${Math.round(rect.w)}x${Math.round(rect.h)})`);
	if (!lay.clean) out.push('a terminal line has a token wider than the window and is cut mid-token');
	if (s.highlight && !s.rows.some((r) => r.hl)) out.push(`highlight "${s.highlight}" matches no row on screen`);
	if (s.highlight && s.rows.some((r) => r.hl) && !lay.vrows.some((v) => s.rows[v.row].hl)) out.push(`highlighted row "${s.highlight}" is not in view`);
	return out;
};

// ------------------------------------------------------------------ validation, tokens, rows, settle
const actionWhat = (a: Action) => String(a.do);

export const validateTerm = (a: Action): string[] => {
	const p = a as Props;
	const what = actionWhat(a);
	const errs: string[] = [];
	const checkOut = (key: string, need: boolean) => {
		const raw = p[key] ?? (key === 'out' ? (p.output ?? p.lines) : undefined);
		if (raw === undefined) {
			if (need) errs.push(`${what} needs "out": ["line", ...]`);
			return;
		}
		if (typeof raw !== 'string' && !Array.isArray(raw)) return errs.push(`${what}: "out" must be a string or an array of lines`);
		if (Array.isArray(raw)) {
			raw.forEach((x, i) => {
				if (typeof x === 'string') return;
				if (x && typeof x === 'object' && typeof (x as Props).text === 'string') {
					const tone = (x as Props).tone;
					if (tone !== undefined && !(TONES as readonly unknown[]).includes(tone)) errs.push(`${what}: out[${i}].tone must be one of ${TONES.join(', ')}`);
					return;
				}
				errs.push(`${what}: out[${i}] must be a string or {text, tone?}`);
			});
		}
		const lines = outLines(raw);
		if (lines.length > MAX_LINES) errs.push(`${what}: ${lines.length} output lines (max ${MAX_LINES}); show the lines that matter, not a wall`);
		lines.forEach((l, i) => {
			if (l.text.length > MAX_LINE) errs.push(`${what}: out[${i}] is ${l.text.length} characters (max ${MAX_LINE})`);
		});
	};
	switch (a.do) {
		case 'world.set':
			if (p.cwd !== undefined && typeof p.cwd !== 'string') errs.push('world.set term.session: "cwd" must be a string');
			if (p.prompt !== undefined && (typeof p.prompt !== 'string' || p.prompt.length > 40)) errs.push('world.set term.session: "prompt" must be a string of at most 40 characters ("{cwd}" is replaced by the directory)');
			if (p.title !== undefined && typeof p.title !== 'string') errs.push('world.set term.session: "title" must be a string');
			break;
		case 'term.run':
			errs.push(...needString(p, 'cmd', what, MAX_CMD));
			checkOut('out', false);
			errs.push(...optNumber(p, 'exit', what, 0, 255, true));
			errs.push(...optNumber(p, 'wait_ms', what, 0, 5000));
			errs.push(...optNumber(p, 'line_ms', what, 30, 2000));
			errs.push(...optNumber(p, 'cps', what, 5, 120));
			if (p.running !== undefined && typeof p.running !== 'boolean') errs.push(`${what}: "running" must be true or false`);
			if (p.running === true && p.exit !== undefined) errs.push(`${what}: a running command has no exit yet (end it with term.exit)`);
			if (p.cwd !== undefined && typeof p.cwd !== 'string') errs.push(`${what}: "cwd" must be a string`);
			break;
		case 'term.out':
			checkOut('out', true);
			errs.push(...optNumber(p, 'line_ms', what, 30, 2000));
			break;
		case 'term.exit':
			if (typeof p.code !== 'number') errs.push(`${what} needs "code": <exit status>`);
			else errs.push(...optNumber(p, 'code', what, 0, 255, true));
			break;
		case 'term.clear':
			break;
		case 'term.highlight':
			if (p.off !== true && (typeof (p.match ?? p.text) !== 'string' || !sv(p.match ?? p.text).trim())) errs.push(`${what} needs "match": "<text of the row>" (or "off": true)`);
			break;
	}
	return errs;
};

export const termTokens = (a: Action): WorldText[] => {
	const p = a as Props;
	switch (a.do) {
		case 'world.set':
			return [{text: sv(p.cwd), off: 0}].filter((x) => x.text);
		case 'term.run': {
			const s = runSchedule(p);
			const out: WorldText[] = [{text: s.cmd, off: s.typeEnd}];
			s.out.forEach((l, i) => out.push({text: l.text, off: s.lines[i]}));
			if (typeof p.exit === 'number') out.push({text: `exit ${p.exit}`, off: s.exit});
			return out;
		}
		case 'term.out': {
			const gap = gapOf(p);
			return outOf(p).map((l, i) => ({text: l.text, off: i * gap}));
		}
		case 'term.exit':
			return [{text: `exit ${nv(p.code, 0)}`, off: 0}];
	}
	return [];
};

export const termRows = (a: Action): number => {
	const p = a as Props;
	if (a.do === 'term.run') return 1 + outOf(p).length;
	if (a.do === 'term.out') return outOf(p).length;
	return 0;
};

export const termSettle = (a: Action): number => {
	const p = a as Props;
	if (a.do === 'term.run') {
		const s = runSchedule(p);
		return (s.exit === Infinity ? (s.lines.length ? s.lines[s.lines.length - 1] : s.enter) : s.exit) + 2;
	}
	if (a.do === 'term.out') return outOf(p).length * gapOf(p) + 2;
	return 2;
};

/** A red non-zero exit, or output visibly streaming in (3+ lines at >= 200 ms per line). */
export const termIsSignature = (a: Action): boolean => {
	const p = a as Props;
	if (a.do === 'term.exit') return nv(p.code, 0) !== 0;
	if (a.do === 'term.run' && typeof p.exit === 'number' && p.exit !== 0) return true;
	if (a.do === 'term.run' || a.do === 'term.out') return outOf(p).length >= 3 && typeof p.line_ms === 'number' && p.line_ms >= STREAM_SIGNATURE_MS;
	return false;
};
