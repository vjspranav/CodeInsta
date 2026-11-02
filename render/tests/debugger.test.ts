import {describe, expect, it} from 'vitest';
import './helpers';
import {mkStory} from './helpers';
import type {Action} from '../src/schema';
import {validateStory} from '../src/schema';
import {contrast, setActiveStyle, STYLES} from '../src/styles';
import type {WorldEvent} from '../src/worlds';
import {WORLDS, isSignatureAction} from '../src/worlds';
import {debuggerWorld} from '../src/worlds/debugger';
import {
	CPF,
	ENTER_FRAMES,
	FLASH_FRAMES,
	LINE_FRAMES,
	RUN_FRAMES,
	codeTop,
	dbgIsSignature,
	dbgLayout,
	dbgProblems,
	dbgRows,
	dbgSettle,
	dbgStateAt,
	dbgTexts,
	dbgTokens,
	focusTop,
	planDebugger,
	schedule,
	validateDbg,
	varText,
} from '../src/worlds/debugger/model';
import {tokenize} from '../src/worlds/debugger/syntax';
import {dbgColors} from '../src/worlds/debugger/View';
import {CONTENT} from '../src/theme';

const A = (a: Record<string, unknown>) => a as unknown as Action;
const ev = (frame: number, a: Record<string, unknown>, beat = 0): WorldEvent => ({frame, beat, action: A(a)});
const RECT = CONTENT;

const CODE = [
	'#include <assert.h>',
	'#include <stdio.h>',
	'',
	'int sum_array(const int *a, int n) {',
	'    int total = 0;',
	'    for (int i = 0; i < n - 1; i++)',
	'        total += a[i];',
	'    return total;',
	'}',
	'',
	'int main(void) {',
	'    int a[5] = {1, 2, 3, 4, 5};',
	'    int s = sum_array(a, 5);',
	'    assert(s == 15);',
	'    printf("sum = %d\\n", s);',
	'    return 0;',
	'}',
];
const SET = ev(0, {
	do: 'world.set',
	world: 'debugger',
	file: 'sum.c',
	code: CODE,
	title: 'lldb ./sum',
	prompt: '(lldb)',
	breakpoints: [5],
	line: 5,
	reason: 'breakpoint',
	vars: {a: '0x16fdfe370', n: 5, total: '1876944296'},
	stack: [{fn: 'sum_array', at: ':5'}, 'main', 'start'],
});

describe('debugger validation', () => {
	it('accepts well-formed actions', () => {
		expect(validateDbg(A({do: 'world.set', world: 'debugger', code: CODE, line: 5, vars: {n: 5}, stack: ['f', {fn: 'main', at: 'a.c:3'}]}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.cmd', cmd: 'bt', out: ['#0 f', {text: 'oops', tone: 'err'}]}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.break', line: 8, cmd: 'b sum.c:8', out: 'Breakpoint 2'}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.break', lines: [5, 8], off: true}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.step', kind: 'into', line: 7, vars: {i: {value: 1, tone: 'bad'}}}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.continue'}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.continue', to: 14, reason: 'assert', msg: 'assertion failed', run_ms: 700, stack: ['abort', 'main'], frame: 1}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.stop', line: 3, reason: 'signal'}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.set', vars: {x: 1}, drop: ['y']}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.edit', line: 6, text: '    for (;;)'}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.mark', var: 'x'}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.mark', off: true}))).toEqual([]);
		expect(validateDbg(A({do: 'dbg.exit', status: 1, cmd: 'kill'}))).toEqual([]);
	});
	it('rejects missing or malformed fields', () => {
		expect(validateDbg(A({do: 'dbg.step'})).join()).toMatch(/needs "line"/);
		expect(validateDbg(A({do: 'dbg.step', line: 3, kind: 'sideways'})).join()).toMatch(/kind/);
		expect(validateDbg(A({do: 'dbg.stop'})).join()).toMatch(/needs "line"/);
		expect(validateDbg(A({do: 'dbg.stop', line: 2, reason: 'boom'})).join()).toMatch(/reason/);
		expect(validateDbg(A({do: 'dbg.break'})).join()).toMatch(/needs "line"/);
		expect(validateDbg(A({do: 'dbg.break', line: 0})).join()).toMatch(/needs "line"/);
		expect(validateDbg(A({do: 'dbg.cmd'})).join()).toMatch(/needs "cmd"/);
		expect(validateDbg(A({do: 'dbg.cmd', cmd: 'x'.repeat(101)})).join()).toMatch(/max 100/);
		expect(validateDbg(A({do: 'dbg.cmd', out: Array.from({length: 15}, (_, i) => `l${i}`)})).join()).toMatch(/max 14/);
		expect(validateDbg(A({do: 'dbg.cmd', out: [{text: 'a', tone: 'purple'}]})).join()).toMatch(/tone/);
		expect(validateDbg(A({do: 'dbg.set'})).join()).toMatch(/needs "vars"/);
		expect(validateDbg(A({do: 'dbg.set', vars: {x: 'v'.repeat(31)}})).join()).toMatch(/max 30/);
		expect(validateDbg(A({do: 'dbg.set', vars: {['n'.repeat(17)]: 1}})).join()).toMatch(/name/);
		expect(validateDbg(A({do: 'dbg.set', vars: {x: {value: 1, tone: 'red'}}})).join()).toMatch(/tone/);
		expect(validateDbg(A({do: 'dbg.set', vars: [1]})).join()).toMatch(/object/);
		expect(validateDbg(A({do: 'dbg.set', stack: Array.from({length: 8}, () => 'f')})).join()).toMatch(/max 7/);
		expect(validateDbg(A({do: 'dbg.set', stack: ['f'.repeat(23)]})).join()).toMatch(/max 22/);
		expect(validateDbg(A({do: 'dbg.edit', line: 3})).join()).toMatch(/needs "text"/);
		expect(validateDbg(A({do: 'dbg.mark'})).join()).toMatch(/needs "line"/);
		expect(validateDbg(A({do: 'dbg.continue', line: 'x'})).join()).toMatch(/line/);
		expect(validateDbg(A({do: 'dbg.exit', status: 300})).join()).toMatch(/status/);
		expect(validateDbg(A({do: 'world.set', world: 'debugger', code: ['x'.repeat(53)]})).join()).toMatch(/max 52/);
		expect(validateDbg(A({do: 'world.set', world: 'debugger', code: ['a\tb']})).join()).toMatch(/tab/);
		expect(validateDbg(A({do: 'world.set', world: 'debugger', prompt: 'x'.repeat(15)})).join()).toMatch(/prompt/);
		expect(validateDbg(A({do: 'world.set', world: 'debugger', breakpoints: ['a']})).join()).toMatch(/breakpoints/);
	});
	it('is registered with a prefix, kinds and a signature that are all valid', () => {
		expect(WORLDS.some((w) => w.id === 'debugger')).toBe(true);
		for (const k of debuggerWorld.actions) expect(k.startsWith('dbg.')).toBe(true);
		for (const k of debuggerWorld.signature) expect(debuggerWorld.actions).toContain(k);
	});
	it('a script with the debugger validates end to end and rejects a bad action by name', () => {
		const ok = validateStory({
			version: 3,
			format: 'story',
			title: 't',
			topic: 't',
			world: 'debugger',
			tags: [],
			level: 'beginner',
			cast: [],
			glossary: [],
			beats: [{speaker: 'narrator', text: 'A line of speech here.', visuals: [{do: 'world.set', world: 'debugger', code: CODE, line: 5}, {do: 'dbg.step', line: 6}]}],
		});
		expect(ok.ok).toBe(true);
		const bad = validateStory({
			version: 3,
			format: 'story',
			title: 't',
			topic: 't',
			tags: [],
			level: 'beginner',
			cast: [],
			glossary: [],
			beats: [{speaker: 'narrator', text: 'A line of speech here.', visuals: [{do: 'world.set', world: 'debugger', code: CODE}, {do: 'dbg.step'}]}],
		});
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.errors.join()).toMatch(/dbg\.step needs "line"/);
	});
});

describe('debugger state', () => {
	it('opens paused on a breakpoint with its panels filled', () => {
		const s = dbgStateAt([SET], 0);
		expect(s.visible).toBe(true);
		expect(s.status).toBe('paused');
		expect(s.cur?.line).toBe(5);
		expect(s.breakpoints.map((b) => b.line)).toEqual([5]);
		expect(s.breakpoints[0].hitAt).toBe(0);
		expect(s.vars.map(varText)).toEqual(['a = 0x16fdfe370', 'n = 5', 'total = 1876944296']);
		expect(s.stack.map((f) => f.fn)).toEqual(['sum_array', 'main', 'start']);
		expect(s.pill).toBe('breakpoint hit');
		expect(s.title).toBe('lldb ./sum');
		expect(dbgStateAt([SET], -1).visible).toBe(false);
		expect(dbgTexts(dbgStateAt([SET], 0), RECT)).toEqual(expect.arrayContaining(['lldb ./sum', 'n = 5', '#1 main', '#0 sum_array :5', 'int total = 0;']));
	});

	it('a step moves the highlight, flashes the changed variable and leaves the others alone', () => {
		const step = {do: 'dbg.step', kind: 'over', line: 6, vars: {total: 0}};
		const evs = [SET, ev(20, step)];
		const before = dbgStateAt(evs, 19);
		expect(before.cur?.line).toBe(5);
		expect(before.vars.find((v) => v.name === 'total')?.value).toBe('1876944296');
		const after = dbgStateAt(evs, 20);
		expect(after.cur).toMatchObject({line: 6, prev: 5, movedAt: 20, how: 'over'});
		const total = after.vars.find((v) => v.name === 'total')!;
		expect(total).toMatchObject({value: '0', prev: '1876944296', changedAt: 20});
		expect(after.vars.find((v) => v.name === 'n')!.changedAt).toBe(0);
		expect(after.ctl).toEqual({kind: 'over', at: 20});
		expect(after.pill).toBe('step over');
		// the same value again is not a change
		const again = dbgStateAt([...evs, ev(60, {do: 'dbg.set', vars: {total: 0}})], 61);
		expect(again.vars.find((v) => v.name === 'total')!.changedAt).toBe(20);
	});

	it('a breakpoint is set with a pop, hit with a pulse and cleared', () => {
		const evs = [SET, ev(10, {do: 'dbg.break', line: 8}), ev(50, {do: 'dbg.continue', line: 8, reason: 'breakpoint', vars: {total: {value: 10, tone: 'bad'}}, drop: ['i']}), ev(120, {do: 'dbg.break', line: 8, off: true})];
		expect(dbgStateAt(evs, 9).breakpoints.map((b) => b.line)).toEqual([5]);
		const set = dbgStateAt(evs, 10);
		expect(set.breakpoints.map((b) => [b.line, b.setAt])).toEqual([[5, 0], [8, 10]]);
		const running = dbgStateAt(evs, 50 + 1);
		expect(running.status).toBe('running');
		expect(running.cur).toBeNull();
		const land = 50 + RUN_FRAMES;
		expect(dbgStateAt(evs, land - 1).status).toBe('running');
		const hit = dbgStateAt(evs, land);
		expect(hit.status).toBe('paused');
		expect(hit.cur?.line).toBe(8);
		expect(hit.breakpoints.find((b) => b.line === 8)?.hitAt).toBe(land);
		expect(hit.vars.find((v) => v.name === 'total')?.tone).toBe('bad');
		expect(dbgStateAt(evs, 120).breakpoints.map((b) => b.line)).toEqual([5]);
	});

	it('a crash turns the status red and the stack grows only by its new frames', () => {
		const evs = [SET, ev(30, {do: 'dbg.continue', line: 14, reason: 'assert', stack: ['__pthread_kill', 'abort', 'main', 'start'], frame: 2, vars_reset: true, vars: {s: {value: 10, tone: 'bad'}}})];
		const s = dbgStateAt(evs, 30 + RUN_FRAMES);
		expect(s.status).toBe('crashed');
		expect(s.pill).toBe('assertion failed');
		expect(s.sel).toBe(2);
		expect(s.vars.map(varText)).toEqual(['s = 10']);
		// main and start were already on the stack: only the frames above them are new
		expect(s.stack.map((f) => [f.fn, f.addedAt])).toEqual([['__pthread_kill', 30 + RUN_FRAMES], ['abort', 30 + RUN_FRAMES], ['main', 0], ['start', 0]]);
		expect(dbgStateAt(evs, 20).stack.map((f) => f.fn)).toEqual(['sum_array', 'main', 'start']);
		expect(dbgStateAt([...evs, ev(200, {do: 'dbg.exit', status: 134, cmd: 'kill'})], 260).status).toBe('exited');
	});

	it('exit clears the panels; edit changes the source and flashes the line; marks ring a line, a variable and a frame', () => {
		const evs = [SET, ev(10, {do: 'dbg.edit', line: 5, text: '    int total = 1;'}), ev(20, {do: 'dbg.mark', line: 5, var: 'n', frame: 1}), ev(40, {do: 'dbg.exit', status: 0, msg: 'exited with code 0'})];
		const e = dbgStateAt(evs, 12);
		expect(e.code[4]).toBe('    int total = 1;');
		expect(e.edits).toEqual([{line: 5, at: 10}]);
		expect(CODE[4]).toBe('    int total = 0;');
		const m = dbgStateAt(evs, 25);
		expect(m.mark).toMatchObject({line: 5, name: 'n', frame: 1, at: 20});
		expect(dbgProblems(m, RECT)).toEqual([]);
		const x = dbgStateAt(evs, 40);
		expect(x.status).toBe('exited');
		expect(x.vars).toEqual([]);
		expect(x.stack).toEqual([]);
		expect(x.cur).toBeNull();
		expect(dbgStateAt([...evs, ev(50, {do: 'dbg.mark', off: true})], 55).mark.line).toBeNull();
	});

	it('is deterministic and never shows the future', () => {
		const base = [SET, ev(20, {do: 'dbg.step', cmd: 'next', out: ['Process stopped'], line: 6, vars: {total: 0}})];
		const more = [...base, ev(200, {do: 'dbg.step', line: 7, vars: {i: 0}})];
		for (const f of [0, 12, 25, 40, 199]) {
			const a = dbgStateAt(base, f);
			const b = dbgStateAt(more, f);
			expect(b).toEqual(a);
			expect(dbgStateAt(more, f)).toEqual(dbgStateAt(more.map((e) => ({...e})), f));
		}
		expect(dbgStateAt(more, 260).cur?.line).toBe(7);
	});
});

describe('debugger console and timing', () => {
	const cmd = {do: 'dbg.step', cmd: 'next', pre: ['Process 1 resuming'], out: ['Process 1 stopped', 'frame #0: sum_array at sum.c:6'], line: 6, vars: {total: 0}, wait_ms: 100};
	const sc = schedule(cmd);
	const evs = [SET, ev(10, cmd)];

	it('types the command, enters it, presses the button, lands the effect, then prints', () => {
		expect(sc.typeEnd).toBe(Math.ceil(4 * CPF));
		expect(sc.enter).toBe(sc.typeEnd + ENTER_FRAMES);
		expect(sc.land).toBe(sc.enter);
		const typing = dbgStateAt(evs, 10 + 2);
		expect(typing.typing).toBe(true);
		expect(typing.con[0]).toMatchObject({kind: 'cmd', text: 'next', typed: Math.floor(2 / CPF) + 1, cursor: true});
		expect(typing.cur?.line).toBe(5);
		const entered = dbgStateAt(evs, 10 + sc.enter);
		expect(entered.cur?.line).toBe(6);
		expect(entered.ctl?.at).toBe(10 + sc.enter);
		expect(entered.con.filter((r) => r.kind === 'out').map((r) => r.text)).toEqual(['Process 1 resuming']);
		// output lines stream one every LINE_FRAMES after wait_ms
		const o0 = 10 + sc.outT[0];
		expect(sc.outT[1] - sc.outT[0]).toBe(LINE_FRAMES);
		expect(dbgStateAt(evs, o0 - 1).con.filter((r) => r.kind === 'out')).toHaveLength(1);
		expect(dbgStateAt(evs, o0).con.filter((r) => r.kind === 'out')).toHaveLength(2);
		expect(dbgStateAt(evs, o0 + LINE_FRAMES).con.filter((r) => r.kind === 'out')).toHaveLength(3);
		expect(dbgStateAt(evs, o0 + LINE_FRAMES).con[dbgStateAt(evs, o0 + LINE_FRAMES).con.length - 1].kind).toBe('prompt');
	});

	it('shows a prompt with a cursor when idle and none while the process runs', () => {
		const e2 = [SET, ev(10, {do: 'dbg.continue', cmd: 'continue'}), ev(100, {do: 'dbg.stop', line: 8})];
		expect(dbgStateAt(e2, 5).con[dbgStateAt(e2, 5).con.length - 1].kind).toBe('prompt');
		expect(dbgStateAt(e2, 60).con.some((r) => r.kind === 'prompt')).toBe(false);
		expect(dbgStateAt(e2, 60).status).toBe('running');
		expect(dbgStateAt(e2, 101).status).toBe('paused');
		expect(planDebugger(e2).issues).toEqual([]);
	});

	it('continue lands after run_ms and its output prints from the landing', () => {
		const c = {do: 'dbg.continue', cmd: 'continue', line: 8, run_ms: 1000, pre: ['Process 1 resuming'], out: ['Process 1 stopped']};
		const s = schedule(c);
		expect(s.land - s.enter).toBe(30);
		expect(s.outT[0]).toBe(s.land);
		expect(s.preT[0]).toBe(s.enter);
		expect(dbgSettle(A(c))).toBeGreaterThan(s.last + FLASH_FRAMES);
	});

	it('reports a command typed over still-streaming output, and an action while the process runs', () => {
		const a = [SET, ev(0, {do: 'dbg.cmd', cmd: 'bt', out: Array.from({length: 10}, (_, i) => `frame #${i}`), line_ms: 500}), ev(40, {do: 'dbg.cmd', cmd: 'p 1'}, 2)];
		expect(planDebugger(a).issues.join()).toMatch(/still printing/);
		expect(dbgStateAt(a, 40).con.filter((r) => r.text.startsWith('frame #'))).toHaveLength(10);
		const b = [SET, ev(0, {do: 'dbg.continue'}), ev(60, {do: 'dbg.step', line: 6})];
		expect(planDebugger(b).issues.join()).toMatch(/while the process is running/);
		const c = [SET, ev(0, {do: 'dbg.continue', line: 8, run_ms: 2000}), ev(30, {do: 'dbg.step', line: 6})];
		expect(planDebugger(c).issues.join()).toMatch(/while the process is running/);
		const d = [SET, ev(0, {do: 'dbg.step', line: 99})];
		expect(planDebugger(d).issues.join()).toMatch(/outside the source/);
		expect(planDebugger([ev(0, {do: 'world.set', world: 'debugger'}), ev(5, {do: 'dbg.step', line: 2})]).issues.join()).toMatch(/needs a world\.set with "code"/);
	});

	it('tokens never claim a text before it is on screen', () => {
		const acts = [
			{do: 'dbg.cmd', cmd: 'p a[4]', out: ['(const int) 5'], wait_ms: 200},
			{do: 'dbg.step', cmd: 'next', line: 6, vars: {total: 0}, stack: [{fn: 'sum_array', at: ':6'}, 'main', 'start'], msg: 'stepped'},
		];
		for (const act of acts) {
			const evs = [SET, ev(20, act)];
			for (const tok of dbgTokens(A(act))) {
				const at = (f: number) => dbgTexts(dbgStateAt(evs, f), RECT).map((x) => x.replace(/\s+/g, '')).join('\n');
				const want = tok.text.replace(/\s+/g, '');
				expect(at(20 + tok.off), tok.text).toContain(want);
			}
		}
		// an output line is absent one frame before its token
		const o = {do: 'dbg.cmd', cmd: 'p 1', out: ['(int) 1'], wait_ms: 300};
		const evs = [SET, ev(20, o)];
		const out = dbgTokens(A(o)).find((t) => t.text === '(int) 1')!;
		expect(dbgTexts(dbgStateAt(evs, 20 + out.off - 1), RECT).join('\n')).not.toContain('(int) 1');
	});

	it('rows and settle count what the action puts on screen', () => {
		expect(dbgRows(A({do: 'dbg.cmd', cmd: 'bt', out: ['a', 'b']}))).toBe(3);
		expect(dbgRows(A({do: 'dbg.step', line: 3, vars: {x: 1, y: 2}}))).toBe(3);
		expect(dbgRows(A({do: 'dbg.mark', var: 'x'}))).toBe(0);
		expect(dbgSettle(A({do: 'dbg.mark', var: 'x'}))).toBeGreaterThan(FLASH_FRAMES);
		expect(dbgSettle(A({do: 'dbg.cmd', cmd: 'p 1'}))).toBeLessThan(40);
	});
});

describe('debugger signature', () => {
	it('a breakpoint hit, a crash or a bad value counts; a plain step does not', () => {
		expect(dbgIsSignature(A({do: 'dbg.stop', line: 8}))).toBe(true);
		expect(dbgIsSignature(A({do: 'dbg.stop', line: 8, reason: 'watchpoint'}))).toBe(true);
		expect(dbgIsSignature(A({do: 'dbg.continue', line: 14, reason: 'assert'}))).toBe(true);
		expect(dbgIsSignature(A({do: 'dbg.continue', line: 8}))).toBe(true);
		expect(dbgIsSignature(A({do: 'dbg.continue'}))).toBe(false);
		expect(dbgIsSignature(A({do: 'dbg.stop', line: 8, reason: 'signal'}))).toBe(true);
		expect(dbgIsSignature(A({do: 'dbg.step', line: 6}))).toBe(false);
		expect(dbgIsSignature(A({do: 'dbg.step', line: 6, reason: 'exception'}))).toBe(true);
		expect(dbgIsSignature(A({do: 'dbg.step', line: 6, vars: {total: {value: 10, tone: 'bad'}}}))).toBe(true);
		expect(dbgIsSignature(A({do: 'dbg.set', vars: {total: {value: 10, tone: 'ok'}}}))).toBe(false);
		expect(dbgIsSignature(A({do: 'dbg.set', vars: {total: {value: 10, tone: 'bad'}}}))).toBe(true);
		expect(dbgIsSignature(A({do: 'dbg.cmd', cmd: 'bt'}))).toBe(false);
		expect(isSignatureAction(A({do: 'dbg.stop', line: 3}))).toBe(true);
		expect(isSignatureAction(A({do: 'dbg.mark', line: 3}))).toBe(false);
		expect(debuggerWorld.signature).toContain('dbg.stop');
	});
});

describe('debugger layout', () => {
	const s0 = dbgStateAt([SET], 10);
	it('fits the slot: readable fonts, the highlighted line in view, panels inside the frame', () => {
		const lay = dbgLayout(s0, RECT);
		expect(lay.fs).toBeGreaterThanOrEqual(16);
		expect(lay.fs).toBeLessThanOrEqual(20);
		expect(lay.cap).toBeGreaterThanOrEqual(8);
		expect(lay.code.y + lay.code.h).toBeLessThanOrEqual(lay.vars.y);
		expect(lay.vars.y + lay.vars.h).toBeLessThanOrEqual(lay.con.y);
		expect(lay.con.y + lay.con.h).toBeLessThanOrEqual(RECT.h + 0.5);
		expect(lay.vars.w + lay.stack.w).toBeLessThanOrEqual(RECT.w);
		expect(dbgProblems(s0, RECT)).toEqual([]);
	});
	it('pages the source so the highlighted line is always visible', () => {
		const long = Array.from({length: 40}, (_, i) => `    x${i} = ${i};`);
		const evs = [ev(0, {do: 'world.set', world: 'debugger', code: long, line: 2}), ev(10, {do: 'dbg.step', line: 30}), ev(50, {do: 'dbg.step', line: 3})];
		for (const [f, line] of [[5, 2], [20, 30], [60, 3]] as const) {
			const s = dbgStateAt(evs, f);
			const lay = dbgLayout(s, RECT);
			const i = line - 1;
			expect(i >= lay.top && i < lay.top + lay.cap, `line ${line} top ${lay.top} cap ${lay.cap}`).toBe(true);
			expect(dbgProblems(s, RECT)).toEqual([]);
		}
		expect(codeTop(2, 1, 40, 11)).toBe(0);
		expect(codeTop(8, 1, 40, 11)).toBe(0); // within the pane: it does not scroll
		expect(codeTop(10, 1, 40, 11)).toBe(1); // within 2 rows of the bottom: it follows
		expect(codeTop(30, 1, 40, 11)).toBe(21);
		expect(codeTop(40, 1, 40, 11)).toBe(29); // never past the end
		expect(codeTop(5, 1, 8, 11)).toBe(0);
	});
	it('a mark far from the highlight moves the page just enough to show both', () => {
		const evs = [SET, ev(10, {do: 'dbg.stop', line: 14, reason: 'assert'}), ev(30, {do: 'dbg.mark', line: 6})];
		const s = dbgStateAt(evs, 40);
		const lay = dbgLayout(s, RECT);
		expect(5 >= lay.top && 5 < lay.top + lay.cap).toBe(true);
		expect(13 >= lay.top && 13 < lay.top + lay.cap).toBe(true);
		expect(focusTop(s, lay.cap)).toBe(lay.top);
		expect(dbgProblems(s, RECT)).toEqual([]);
	});
	it('flags a slot too small, values wider than their panel, a mark that is not there and a bad line', () => {
		expect(dbgProblems(s0, {x: 0, y: 0, w: 576, h: 520}).join()).toMatch(/only \d+ rows/);
		const wide = dbgStateAt([SET, ev(5, {do: 'dbg.set', vars: {total: 'x'.repeat(30)}})], 10);
		expect(dbgProblems(wide, RECT).join()).toMatch(/wider than the panel/);
		const m = dbgStateAt([SET, ev(5, {do: 'dbg.mark', var: 'nope'})], 10);
		expect(dbgProblems(m, RECT).join()).toMatch(/not in the panel/);
		const mf = dbgStateAt([SET, ev(5, {do: 'dbg.mark', frame: 5})], 10);
		expect(dbgProblems(mf, RECT).join()).toMatch(/stack frame 5/);
		const bl = dbgStateAt([SET, ev(5, {do: 'dbg.break', line: 40})], 10);
		expect(dbgProblems(bl, RECT).join()).toMatch(/breakpoint line 40/);
		expect(dbgProblems(dbgStateAt([ev(0, {do: 'world.set', world: 'debugger'})], 3), RECT).join()).toMatch(/no source/);
		const many = dbgStateAt([SET, ev(5, {do: 'dbg.set', vars: {a: 1, b: 2, c: 3, d: 4}}), ev(6, {do: 'dbg.set', vars: {e: 5, f: 6, g: 7}})], 10);
		expect(dbgProblems(many, RECT).join()).toMatch(/variables, the panel shows 6/);
	});
	it('wraps long console lines and shows the newest rows', () => {
		const out = Array.from({length: 6}, (_, i) => `line ${i} ${i === 3 ? 'frame #0: 0x00000001000004bc sum`sum_array(a=0x000000016fdfe370, n=5) at sum.c:5:9' : 'x'}`);
		const evs = [SET, ev(0, {do: 'dbg.cmd', cmd: 'bt', out, line_ms: 100})];
		const s = dbgStateAt(evs, 200);
		const lay = dbgLayout(s, RECT);
		expect(lay.conRows.length).toBeLessThanOrEqual(lay.conCap);
		expect(lay.conRows.some((v) => v.sub > 0)).toBe(true);
		expect(lay.conRows[lay.conRows.length - 1].text).toContain('(lldb)');
		expect(dbgProblems(s, RECT)).toEqual([]);
	});
});

describe('debugger syntax colouring', () => {
	it('classifies C keywords, types, calls, strings, numbers, preprocessor and comments', () => {
		const t = tokenize(['#include <stdio.h>', 'int f(size_t n) { // note', '    return printf("a%d", 0x1F + 2);', '/* open', 'still */ int x;'], 'c');
		const cls = (line: number, text: string) => t[line].find((x) => x.text === text)?.cls;
		expect(t[0][0].cls).toBe('pre');
		expect(cls(1, 'int')).toBe('type');
		expect(cls(1, 'f')).toBe('fn');
		expect(cls(1, 'size_t')).toBe('type');
		expect(t[1][t[1].length - 1]).toEqual({text: '// note', cls: 'com'});
		expect(cls(2, 'return')).toBe('kw');
		expect(cls(2, 'printf')).toBe('fn');
		expect(cls(2, '"a%d"')).toBe('str');
		expect(cls(2, '0x1F')).toBe('num');
		expect(t[3].every((x) => x.cls === 'com')).toBe(true);
		expect(t[4][0]).toEqual({text: 'still */', cls: 'com'});
		expect(t[4].find((x) => x.text === 'int')?.cls).toBe('type');
		// the colouring never changes the characters
		for (const [i, line] of ['#include <stdio.h>', 'int f(size_t n) { // note', '    return printf("a%d", 0x1F + 2);'].entries()) expect(t[i].map((x) => x.text).join('')).toBe(line);
	});
	it('a semicolon or a hash inside C code does not swallow the rest of the line', () => {
		const t = tokenize(['for (int i = 0; i < n - 1; i++)'], 'c');
		expect(t[0].some((x) => x.cls === 'id' && x.text.includes('n '))).toBe(true);
		expect(t[0].some((x) => x.cls === 'num')).toBe(true);
		expect(t[0].map((x) => x.text).join('')).toBe('for (int i = 0; i < n - 1; i++)');
	});
	it('knows a few other languages', () => {
		expect(tokenize(['fn main() { let x = 1; }'], 'rust')[0].find((x) => x.text === 'let')?.cls).toBe('kw');
		expect(tokenize(['x = 1  # note'], 'python')[0].pop()?.cls).toBe('com');
		expect(tokenize(['  ret i32 %x ; done'], 'ir')[0].pop()?.cls).toBe('com');
		expect(tokenize(['  %y = add i32 %x, 1'], 'ir')[0].find((x) => x.text === 'add')?.cls).toBe('kw');
	});
});

describe('debugger colours', () => {
	it('every text colour is legible (>= 4.5:1) on every background it can sit on, in every style', () => {
		for (const st of STYLES) {
			setActiveStyle(st.id);
			const c = dbgColors(st);
			const onCode = [c.bg, c.panel, c.bar, c.band, c.bandHit, c.crash, c.bad, c.flash, c.edit];
			for (const [name, fg] of [['text', c.fg], ['dim', c.dim], ['accent', c.accent], ['err', c.err], ['ok', c.ok], ...Object.entries(c.syn)] as [string, string][]) {
				for (const bg of onCode) expect(contrast(fg, bg), `${st.id} ${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
			}
			for (const [name, p] of [['step pill', c.pillStep], ['crash pill', c.pillCrash], ['quiet pill', c.pillQuiet]] as const) {
				expect(contrast(p.fg, p.bg), `${st.id} ${name}`).toBeGreaterThanOrEqual(4.5);
			}
			for (const [name, fg] of Object.entries(c.con).filter(([k]) => k !== 'bg' && k !== 'bar')) {
				expect(contrast(fg as string, c.con.bg), `${st.id} console ${name}`).toBeGreaterThanOrEqual(4.5);
				expect(contrast(fg as string, c.con.bar), `${st.id} console ${name} on bar`).toBeGreaterThanOrEqual(4.5);
			}
			// the source keeps distinct colours for keywords, strings and numbers
			expect(new Set([c.syn.kw, c.syn.str, c.syn.num, c.syn.com]).size, st.id).toBeGreaterThanOrEqual(3);
		}
		setActiveStyle('sketch');
	});
});

describe('debugger in a story', () => {
	it('builds a timeline with the debugger as the primary world and no timeline problems', () => {
		const story = mkStory(
			[
				{text: 'We stop on the first line of the function and look at the variables.', visuals: [A({do: 'world.set', world: 'debugger', code: CODE, line: 5, vars: {n: 5}, stack: ['sum_array', 'main']}), A({do: 'dbg.step', at: 0.5, line: 6, vars: {total: 0}})]},
			],
			{world: 'debugger'}
		);
		expect(story.world).toBe('debugger');
	});
});
