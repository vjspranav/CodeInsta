import {describe, expect, it} from 'vitest';
import './helpers';
import type {Action} from '../src/schema';
import {contrast, setActiveStyle, STYLES} from '../src/styles';
import type {WorldEvent} from '../src/worlds';
import {termSession} from '../src/worlds/term-session';
import {
	CPF,
	ENTER_FRAMES,
	EXIT_FRAMES,
	FONT_MAX,
	LINE_FRAMES,
	planSession,
	runSchedule,
	termIsSignature,
	termLayout,
	termProblems,
	termStateAt,
	termTexts,
	termTokens,
	validateTerm,
} from '../src/worlds/term-session/model';
import {termColors} from '../src/worlds/term-session/View';
import {CONTENT} from '../src/theme';

const A = (a: Record<string, unknown>) => a as unknown as Action;
const ev = (frame: number, a: Record<string, unknown>, beat = 0): WorldEvent => ({frame, beat, action: A(a)});
const SET = ev(0, {do: 'world.set', world: 'term.session', cwd: '~/app'});
const RECT = CONTENT;

describe('term.session validation', () => {
	it('accepts a well-formed run, out, exit, clear and highlight', () => {
		expect(validateTerm(A({do: 'term.run', cmd: 'ls -l', out: ['total 8', {text: 'oops', tone: 'err'}], exit: 2, line_ms: 250}))).toEqual([]);
		expect(validateTerm(A({do: 'term.run', cmd: 'tail -f log', running: true}))).toEqual([]);
		expect(validateTerm(A({do: 'term.out', out: 'a\nb'}))).toEqual([]);
		expect(validateTerm(A({do: 'term.exit', code: 130}))).toEqual([]);
		expect(validateTerm(A({do: 'term.clear'}))).toEqual([]);
		expect(validateTerm(A({do: 'term.highlight', match: 'total'}))).toEqual([]);
		expect(validateTerm(A({do: 'term.highlight', off: true}))).toEqual([]);
	});
	it('rejects missing or malformed fields', () => {
		expect(validateTerm(A({do: 'term.run'})).join()).toMatch(/needs "cmd"/);
		expect(validateTerm(A({do: 'term.run', cmd: 'x', exit: 300})).join()).toMatch(/exit/);
		expect(validateTerm(A({do: 'term.run', cmd: 'x', exit: 1.5})).join()).toMatch(/integer/);
		expect(validateTerm(A({do: 'term.run', cmd: 'x', out: Array.from({length: 17}, (_, i) => `l${i}`)})).join()).toMatch(/max 16/);
		expect(validateTerm(A({do: 'term.run', cmd: 'x', out: [{text: 'a', tone: 'purple'}]})).join()).toMatch(/tone/);
		expect(validateTerm(A({do: 'term.run', cmd: 'x', out: [3]})).join()).toMatch(/out\[0\]/);
		expect(validateTerm(A({do: 'term.run', cmd: 'x', running: true, exit: 0})).join()).toMatch(/running command has no exit/);
		expect(validateTerm(A({do: 'term.run', cmd: 'x'.repeat(121)})).join()).toMatch(/max 120/);
		expect(validateTerm(A({do: 'term.out'})).join()).toMatch(/needs "out"/);
		expect(validateTerm(A({do: 'term.exit'})).join()).toMatch(/needs "code"/);
		expect(validateTerm(A({do: 'term.highlight'})).join()).toMatch(/needs "match"/);
		expect(validateTerm(A({do: 'world.set', world: 'term.session', prompt: 'x'.repeat(41)})).join()).toMatch(/prompt/);
	});
});

describe('term.session state', () => {
	const run = {do: 'term.run', cmd: 'git push', out: ['To origin', ' ! [rejected]  main -> main', 'error: failed'], exit: 1};
	const events = [SET, ev(10, run)];
	const s0 = runSchedule(run);

	it('types the command with the cursor, then streams output, then shows the exit status', () => {
		expect(termStateAt(events, 5).visible).toBe(true);
		expect(termStateAt(events, 5).rows.map((r) => r.kind)).toEqual(['prompt']);
		const typing = termStateAt(events, 10 + 3);
		expect(typing.typing).toBe(true);
		expect(typing.rows[0].kind).toBe('cmd');
		expect(typing.rows[0].typed).toBe(Math.floor(3 / CPF) + 1);
		expect(typing.rows[0].cursor).toBe(true);
		const typed = 10 + Math.ceil('git push'.length * CPF);
		expect(termStateAt(events, typed).rows[0].typed).toBe('git push'.length);
		expect(s0.enter).toBe(Math.ceil('git push'.length * CPF) + ENTER_FRAMES);
		// output streams one line every LINE_FRAMES
		expect(termStateAt(events, 10 + s0.lines[0]).rows.filter((r) => r.kind === 'out')).toHaveLength(1);
		expect(termStateAt(events, 10 + s0.lines[0] + LINE_FRAMES).rows.filter((r) => r.kind === 'out')).toHaveLength(2);
		const streaming = termStateAt(events, 10 + s0.lines[2]);
		expect(streaming.running).toBe(true);
		expect(streaming.lastExit).toBeNull();
		// exit: red, the prompt after it turns red
		const done = termStateAt(events, 10 + s0.lines[2] + EXIT_FRAMES);
		expect(done.running).toBe(false);
		expect(done.lastExit).toEqual({code: 1, frame: 10 + s0.exit, cmd: 'git push'});
		expect(done.rows.filter((r) => r.block === 0).every((r) => r.failed)).toBe(true);
		const prompt = done.rows[done.rows.length - 1];
		expect(prompt.kind).toBe('prompt');
		expect(prompt.afterFail).toBe(true);
		expect(termTexts(done, RECT)).toContain('exit 1');
	});

	it('is deterministic and never shows the future', () => {
		const more = [...events, ev(200, {do: 'term.run', cmd: 'git status', out: ['On branch main']})];
		for (const f of [0, 12, 30, 60, 199]) {
			const a = termStateAt(events, f);
			const b = termStateAt(more, f);
			expect({...b, maxCols: 0}).toEqual({...a, maxCols: 0});
			expect(termStateAt(more, f)).toEqual(termStateAt(more.map((e) => ({...e})), f));
		}
		expect(termStateAt(more, 260).rows.some((r) => r.text === 'On branch main')).toBe(true);
	});

	it('a running process waits for term.out and term.exit', () => {
		const evs = [SET, ev(0, {do: 'term.run', cmd: 'ping -c 2 example.com', running: true, out: ['PING example.com']}), ev(80, {do: 'term.out', out: ['64 bytes', '64 bytes'], line_ms: 300}), ev(140, {do: 'term.exit', code: 0})];
		expect(termStateAt(evs, 85).running).toBe(true);
		expect(termStateAt(evs, 85).rows.filter((r) => r.kind === 'out')).toHaveLength(2);
		expect(termStateAt(evs, 89).rows.filter((r) => r.kind === 'out')).toHaveLength(3);
		expect(termStateAt(evs, 139).lastExit).toBeNull();
		expect(termStateAt(evs, 140).lastExit?.code).toBe(0);
		expect(planSession(evs).issues).toEqual([]);
	});

	it('clear hides earlier rows and any highlight; cwd changes the next prompt', () => {
		const evs = [SET, ev(0, {do: 'term.run', cmd: 'cd src', cwd: '~/app/src'}), ev(60, {do: 'term.highlight', match: 'cd src'}), ev(90, {do: 'term.clear'})];
		expect(termStateAt(evs, 70).rows.find((r) => r.kind === 'cmd')?.hl).toBe(true);
		const after = termStateAt(evs, 95);
		expect(after.rows.map((r) => r.kind)).toEqual(['prompt']);
		expect(after.rows[0].prompt).toBe('~/app/src $');
		expect(after.highlight).toBeNull();
	});

	it('reports a command typed over still-streaming output', () => {
		const evs = [SET, ev(0, {do: 'term.run', cmd: 'make', out: Array.from({length: 10}, (_, i) => `cc ${i}`), line_ms: 500}), ev(40, {do: 'term.run', cmd: 'ls'}, 2)];
		expect(planSession(evs).issues.join()).toMatch(/still printing/);
		// the interrupted output is complete at once, so token times stay exact
		expect(termStateAt(evs, 40).rows.filter((r) => r.text.startsWith('cc '))).toHaveLength(10);
	});

	it('tokens never claim a text before it is on screen; output lines appear exactly at their token', () => {
		const a = {do: 'term.run', cmd: 'ls -l deploy.sh', out: ['-rw-r--r--  1 dev  staff  48 deploy.sh'], exit: 0, wait_ms: 300, line_ms: 250};
		const evs = [SET, ev(20, a)];
		for (const tok of termTokens(A(a))) {
			const texts = termTexts(termStateAt(evs, 20 + tok.off), RECT).join('\n');
			expect(texts).toContain(tok.text);
			if (tok.off > 0 && tok.text.startsWith('-rw')) expect(termTexts(termStateAt(evs, 20 + tok.off - 1), RECT).join('\n')).not.toContain(tok.text);
		}
	});

	it('signature: a red non-zero exit or a visible stream', () => {
		expect(termIsSignature(A({do: 'term.run', cmd: 'x', exit: 1}))).toBe(true);
		expect(termIsSignature(A({do: 'term.exit', code: 2}))).toBe(true);
		expect(termIsSignature(A({do: 'term.out', out: ['a', 'b', 'c'], line_ms: 300}))).toBe(true);
		expect(termIsSignature(A({do: 'term.run', cmd: 'x', exit: 0, out: ['a', 'b', 'c']}))).toBe(false);
		expect(termIsSignature(A({do: 'term.exit', code: 0}))).toBe(false);
		expect(termSession.signature).toContain('term.run');
	});
});

describe('term.session layout', () => {
	it('wraps long lines, follows the newest row and scrolls back to a highlight', () => {
		const out = Array.from({length: 16}, (_, i) => `line ${i} ${i === 3 ? 'remote: Counting objects and compressing them, then writing the pack to the server' : 'xxxx'}`);
		const evs = [SET, ev(0, {do: 'term.run', cmd: 'cat log', out}), ev(100, {do: 'term.run', cmd: 'cat log', out})];
		const s = termStateAt(evs, 200);
		const lay = termLayout(s, RECT);
		expect(lay.fs).toBeGreaterThanOrEqual(16);
		expect(lay.fs).toBeLessThanOrEqual(FONT_MAX);
		expect(lay.total).toBeGreaterThan(lay.cap);
		expect(lay.vrows[lay.vrows.length - 1].text).toContain('$');
		expect(lay.vrows.some((v) => v.sub > 0)).toBe(true);
		const hl = termStateAt([...evs, ev(150, {do: 'term.highlight', match: 'line 1 x'})], 200);
		const lay2 = termLayout(hl, RECT);
		expect(lay2.top).toBeLessThan(lay.top);
		expect(lay2.vrows.some((v) => hl.rows[v.row].hl)).toBe(true);
		expect(termProblems(hl, RECT)).toEqual([]);
	});
	it('flags a slot too small to read and a highlight that matches nothing', () => {
		const evs = [SET, ev(0, {do: 'term.run', cmd: 'ls'}), ev(30, {do: 'term.highlight', match: 'nope'})];
		expect(termProblems(termStateAt(evs, 40), {x: 0, y: 0, w: 300, h: 200}).join()).toMatch(/only \d+ rows/);
		expect(termProblems(termStateAt(evs, 40), RECT).join()).toMatch(/matches no row/);
	});
});

describe('term.session colours', () => {
	it('every terminal colour is legible (>= 4.5:1) in every style', () => {
		for (const st of STYLES) {
			setActiveStyle(st.id);
			const c = termColors(st);
			for (const [name, fg, bg] of [
				['err', c.err, c.bg],
				['ok', c.ok, c.bg],
				['warn', c.warn, c.bg],
				['prompt', c.prompt, c.bg],
				['highlight', c.hlFg, c.hlBg],
				['exit pill', c.pillFg, c.err],
			] as const) {
				expect(contrast(fg, bg), `${st.id} ${name}`).toBeGreaterThanOrEqual(4.5);
			}
		}
		setActiveStyle('sketch');
	});
});
