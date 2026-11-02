import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import './helpers';
import type {Action} from '../src/schema';
import {validateStory} from '../src/schema';
import {contrast, setActiveStyle, STYLES} from '../src/styles';
import type {WorldEvent} from '../src/worlds';
import {isSignatureAction, worldById} from '../src/worlds';
import {incident} from '../src/worlds/incident';
import {
	ALERT_FRAMES,
	bannerParts,
	chartSeries,
	CLOCK_FRAMES,
	clockAt,
	clockText,
	fmtClock,
	incidentLayout,
	incidentProblems,
	incidentSettle,
	incidentStateAt,
	incidentTexts,
	incidentTimelineProblems,
	incidentTokens,
	metricValueAt,
	parseClock,
	typeFramesOf,
	typingFrames,
	validateIncident,
} from '../src/worlds/incident/model';
import {incidentColors} from '../src/worlds/incident/View';
import {CONTENT} from '../src/theme';
import {buildTimeline} from '../src/timeline';

const A = (a: Record<string, unknown>) => a as unknown as Action;
const ev = (frame: number, a: Record<string, unknown>, beat = 0): WorldEvent => ({frame, beat, action: A(a)});
const SET = ev(0, {do: 'world.set', world: 'incident', channel: 'inc-1', sub: 'replay', from: '13:30', to: '14:30'});

describe('incident validation', () => {
	it('accepts well-formed actions', () => {
		expect(validateIncident(A({do: 'world.set', world: 'incident', channel: 'inc-1', from: '13:30', to: '14:30'}))).toEqual([]);
		expect(validateIncident(A({do: 'incident.message', role: 'SRE', text: 'Checking traffic.', utc: '13:42', typing_ms: 600}))).toEqual([]);
		expect(validateIncident(A({do: 'incident.status', text: 'P0 declared', level: 'err'}))).toEqual([]);
		expect(validateIncident(A({do: 'incident.metric', name: 'CPU', value: 99, max: 100, display: 'nearly 100%', tone: 'err', utc: '13:45'}))).toEqual([]);
		expect(validateIncident(A({do: 'incident.alert', state: 'firing', text: 'CPU saturation', id: 'cpu'}))).toEqual([]);
		expect(validateIncident(A({do: 'incident.alert', state: 'resolved', text: 'cleared', all: true}))).toEqual([]);
		expect(validateIncident(A({do: 'incident.ticket', title: 'Rule change', kind: 'CHANGE REQUEST', status: 'FILED'}))).toEqual([]);
		expect(validateIncident(A({do: 'incident.ticket', status: 'CLOSED'}))).toEqual([]);
	});
	it('rejects malformed values', () => {
		expect(validateIncident(A({do: 'world.set', world: 'incident', from: '25:00'})).join()).toMatch(/UTC time/);
		expect(validateIncident(A({do: 'world.set', world: 'incident', from: '13:30', to: '13:35'})).join()).toMatch(/10 minutes/);
		expect(validateIncident(A({do: 'incident.message', role: '', text: 'x'})).join()).toMatch(/role/);
		expect(validateIncident(A({do: 'incident.message', role: 'SRE', text: 'x'.repeat(111)})).join()).toMatch(/max 110/);
		expect(validateIncident(A({do: 'incident.message', role: 'SRE', text: 'x', utc: '1342'})).join()).toMatch(/utc/);
		expect(validateIncident(A({do: 'incident.message', role: 'SRE', text: 'x', typing_ms: 9000})).join()).toMatch(/typing_ms/);
		expect(validateIncident(A({do: 'incident.status', text: 'x', level: 'loud'})).join()).toMatch(/level/);
		expect(validateIncident(A({do: 'incident.metric', name: 'CPU'})).join()).toMatch(/value/);
		expect(validateIncident(A({do: 'incident.metric', name: 'CPU', value: -1})).join()).toMatch(/value/);
		expect(validateIncident(A({do: 'incident.metric', name: 'CPU', value: 120, max: 100})).join()).toMatch(/above/);
		expect(validateIncident(A({do: 'incident.metric', name: 'CPU', value: 1, tone: 'red'})).join()).toMatch(/tone/);
		expect(validateIncident(A({do: 'incident.alert', state: 'open', text: 'x'})).join()).toMatch(/state/);
		expect(validateIncident(A({do: 'incident.ticket'})).join()).toMatch(/title|status/);
		expect(validateIncident(A({do: 'incident.ticket', title: 'x'.repeat(45)})).join()).toMatch(/max 44/);
	});
	it('is registered with prefixed actions and signature kinds', () => {
		expect(worldById('incident')).toBe(incident);
		expect(incident.actions).toEqual(['incident.message', 'incident.status', 'incident.metric', 'incident.alert', 'incident.ticket']);
		for (const k of incident.signature) expect(incident.actions).toContain(k);
		expect(isSignatureAction(A({do: 'incident.alert', state: 'firing', text: 'x'}))).toBe(true);
		expect(isSignatureAction(A({do: 'incident.alert', state: 'resolved', text: 'x'}))).toBe(true);
		expect(isSignatureAction(A({do: 'incident.ticket', title: 'Fix'}))).toBe(true);
		expect(isSignatureAction(A({do: 'incident.message', role: 'SRE', text: 'x'}))).toBe(false);
		expect(isSignatureAction(A({do: 'incident.metric', name: 'CPU', value: 1}))).toBe(false);
	});
});

describe('incident clock', () => {
	it('parses and formats UTC times', () => {
		expect(parseClock('13:42')).toBe(822);
		expect(parseClock('24:00')).toBeNull();
		expect(parseClock('9:05')).toBeNull();
		expect(fmtClock(822.9)).toBe('13:42');
		expect(clockText(0)).toBe('00:00 UTC');
	});
	it('sweeps from one time to the next over CLOCK_FRAMES and holds', () => {
		const c = {from: 810, to: 822, frame: 100};
		expect(clockAt(c, 100)).toBe(810);
		expect(clockAt(c, 100 + CLOCK_FRAMES / 2)).toBeCloseTo(816, 5);
		expect(clockAt(c, 100 + CLOCK_FRAMES)).toBe(822);
		expect(clockAt(c, 5000)).toBe(822);
	});
});

describe('incident state', () => {
	const events: WorldEvent[] = [
		SET,
		ev(1, {do: 'incident.status', text: 'Quiet', level: 'ok', utc: '13:30'}),
		ev(1, {do: 'incident.metric', name: 'CPU', value: 15, display: 'normal', tone: 'ok', utc: '13:30'}),
		ev(1, {do: 'incident.metric', name: 'Traffic', value: 100, display: 'normal', tone: 'ok', utc: '13:30'}),
		ev(30, {do: 'incident.ticket', title: 'Rule change', kind: 'CHANGE REQUEST', status: 'FILED', utc: '13:42'}),
		ev(30, {do: 'incident.metric', name: 'CPU', value: 15, display: 'normal', tone: 'ok', utc: '13:42'}),
		ev(90, {do: 'incident.alert', state: 'firing', text: 'Test failing', id: 'waf', utc: '13:45'}),
		ev(90, {do: 'incident.metric', name: 'CPU', value: 99, display: 'nearly 100%', tone: 'err', utc: '13:45'}),
		ev(130, {do: 'incident.alert', state: 'firing', text: 'Traffic drop', id: 'traffic', utc: '13:46'}),
		ev(150, {do: 'incident.message', role: 'SRE', text: 'P0 declared', utc: '13:46', typing_ms: 500}),
		ev(260, {do: 'incident.alert', state: 'resolved', text: 'All cleared', all: true, utc: '14:09'}),
		ev(260, {do: 'incident.metric', name: 'CPU', value: 15, display: 'normal', tone: 'ok', utc: '14:09'}),
		ev(262, {do: 'incident.ticket', status: 'CLOSED'}),
	];
	const at = (f: number) => incidentStateAt(events, f);

	it('is hidden before world.set and reserves room from the whole script', () => {
		expect(incidentStateAt([ev(5, {do: 'world.set', world: 'incident'})], 4).visible).toBe(false);
		expect(at(0).plan).toEqual({alerts: true, ticket: true, metrics: ['CPU', 'Traffic']});
		expect(incidentTexts(incidentStateAt(events.slice(1), 10), CONTENT)).toEqual([]);
	});
	it('moves the clock and draws the CPU spike as the clock reaches the alert', () => {
		expect(at(0).now).toBe(810);
		expect(at(1 + CLOCK_FRAMES).now).toBe(810);
		expect(at(30 + CLOCK_FRAMES / 2).now).toBeGreaterThan(810);
		expect(at(30 + CLOCK_FRAMES).now).toBe(822);
		const cpu = (f: number) => at(f).metrics.find((m) => m.name === 'CPU')!;
		const s = at(90);
		expect(metricValueAt(cpu(90), 822)).toBe(15);
		expect(metricValueAt(cpu(90), 825)).toBe(99);
		expect(metricValueAt(cpu(90), 823.5)).toBeCloseTo(57, 5);
		// line is cut at the clock: just after the alert it is mid-ramp, a moment later it reaches 99
		const mid = chartSeries(cpu(90 + CLOCK_FRAMES / 2), s.t0, at(90 + CLOCK_FRAMES / 2).now);
		const end = chartSeries(cpu(90 + CLOCK_FRAMES), s.t0, at(90 + CLOCK_FRAMES).now);
		expect(mid[mid.length - 1][1]).toBeGreaterThan(15);
		expect(mid[mid.length - 1][1]).toBeLessThan(99);
		expect(end[end.length - 1]).toEqual([825, 99]);
		expect(end[0]).toEqual([810, 15]);
		expect(cpu(90).display).toBe('nearly 100%');
		expect(cpu(90).tone).toBe('err');
	});
	it('marks tone changes so the tile can flash', () => {
		const m = at(90).metrics.find((x) => x.name === 'CPU')!;
		expect(m.toneFrame).toBe(90);
		expect(at(80).metrics.find((x) => x.name === 'CPU')!.toneFrame).toBeLessThan(0);
	});
	it('aggregates alerts into the banner and opens then closes the incident window', () => {
		expect(bannerParts(at(10))).toMatchObject({pill: 'OK', text: 'No active alerts'});
		expect(bannerParts(at(100))).toMatchObject({pill: 'FIRING', text: 'Test failing', chip: ''});
		expect(bannerParts(at(140))).toMatchObject({pill: 'FIRING', text: 'Traffic drop', chip: '2 firing'});
		expect(at(140).windows).toEqual([{from: 825, to: null}]);
		expect(bannerParts(at(270))).toMatchObject({pill: 'RESOLVED', chip: 'all clear'});
		expect(at(270).alerts.every((a) => a.state === 'resolved')).toBe(true);
		expect(at(270).windows).toEqual([{from: 825, to: 849}]);
	});
	it('resolves a single alert by id and keeps the other firing', () => {
		const ev2 = [SET, ev(1, {do: 'incident.alert', state: 'firing', text: 'A down', id: 'a'}), ev(2, {do: 'incident.alert', state: 'firing', text: 'B down', id: 'b'}), ev(3, {do: 'incident.alert', state: 'resolved', text: 'A up', id: 'a'})];
		const s = incidentStateAt(ev2, 10);
		expect(s.alerts.map((a) => `${a.id}:${a.state}`)).toEqual(['a:resolved', 'b:firing']);
		expect(bannerParts(s)).toMatchObject({pill: 'FIRING', text: 'B down'});
	});
	it('types the title when a ticket is filed and flips its status without retyping', () => {
		const s = at(40);
		expect(s.ticket).toMatchObject({kind: 'CHANGE REQUEST', title: 'Rule change', status: 'FILED', frame: 30, typeFrames: typeFramesOf('Rule change')});
		const closed = at(270).ticket!;
		expect(closed.status).toBe('CLOSED');
		expect(closed.tone).toBe('ok');
		expect(closed.frame).toBe(30);
		expect(closed.statusFrame).toBe(262);
	});
	it('shows a typing indicator, then the message with the clock time', () => {
		const tf = typingFrames(A({do: 'incident.message', typing_ms: 500}));
		expect(tf).toBe(15);
		expect(at(150).typing).toMatchObject({role: 'SRE', frame: 150, land: 165});
		expect(at(150).messages).toHaveLength(0);
		expect(at(164).messages).toHaveLength(0);
		const landed = at(165);
		expect(landed.typing).toBeNull();
		expect(landed.messages[0]).toMatchObject({role: 'SRE', text: 'P0 declared', time: '13:46', frame: 165});
		expect(incidentTexts(at(150), CONTENT)).toContain('SRE is typing');
	});
	it('is deterministic: later events never change earlier frames', () => {
		const more = [...events, ev(400, {do: 'incident.message', role: 'SRE', text: 'Recovered.'}), ev(401, {do: 'incident.status', text: 'Done', level: 'ok'})];
		for (const f of [0, 1, 20, 31, 60, 89, 95, 140, 160, 200, 259, 265, 300]) expect(incidentStateAt(more, f)).toEqual(incidentStateAt(events, f));
		expect(incidentStateAt(more, 410).messages.at(-1)?.text).toBe('Recovered.');
		expect(incidentStateAt(events, 77)).toEqual(incidentStateAt(events, 77));
	});
});

describe('incident tokens, texts and layout', () => {
	const events: WorldEvent[] = [
		SET,
		ev(1, {do: 'incident.status', text: 'P0 declared', level: 'err'}),
		ev(2, {do: 'incident.metric', name: 'CPU', value: 99, display: 'nearly 100%', tone: 'err', utc: '13:45'}),
		ev(2, {do: 'incident.metric', name: 'Traffic', value: 20, display: '-80%', tone: 'err', utc: '13:45'}),
		ev(3, {do: 'incident.alert', state: 'firing', text: 'Global traffic drop'}),
		ev(40, {do: 'incident.message', role: 'Solutions Eng', text: 'We have lost 80% of our traffic', typing_ms: 600}),
		ev(80, {do: 'incident.ticket', key: 'CHG-1', kind: 'CHANGE REQUEST', title: 'XSS detection rule change', status: 'FILED'}),
	];
	it('shows each token text at its declared offset, and settles every action in time', () => {
		for (const e of events) {
			const toks = [...incidentTokens(e.action), ...(e.action.do === 'world.set' ? [] : [])];
			for (const t of toks) {
				const f = e.frame + t.off;
				expect(incidentTexts(incidentStateAt(events, f), CONTENT).join('\n'), `${e.action.do} ${t.text}`).toContain(t.text);
			}
			const settle = incidentSettle(e.action);
			expect(settle).toBeGreaterThanOrEqual(toks.reduce((m, t) => Math.max(m, t.off), 0));
		}
		expect(incidentTokens(A({do: 'incident.message', role: 'SRE', text: 'x', typing_ms: 600}))[0].off).toBe(18);
		expect(incidentTokens(A({do: 'incident.ticket', title: 'Fix it', status: 'FILED'})).map((t) => t.off)).toEqual([typeFramesOf('Fix it'), typeFramesOf('Fix it')]);
		expect(incidentTokens(A({do: 'incident.ticket', status: 'CLOSED'}))).toEqual([{text: 'CLOSED', off: 0}]);
	});
	it('lists every visible text: channel, clock, status, banner, tiles, chat, ticket', () => {
		const texts = incidentTexts(incidentStateAt(events, 200), CONTENT);
		expect(texts).toEqual(expect.arrayContaining(['#inc-1', 'replay', '13:45 UTC', 'P0 declared', 'FIRING', 'Global traffic drop', 'CPU', 'nearly 100%', 'Traffic', '-80%', 'Solutions Eng', 'We have lost 80% of our traffic', 'CHANGE REQUEST', 'CHG-1', 'XSS detection rule change', 'FILED']));
	});
	it('lays out inside the slot, newest messages from the bottom, no panel overlaps', () => {
		const many = [...events.slice(0, 5), events[6], ...Array.from({length: 12}, (_, i) => ev(10 + i, {do: 'incident.message', role: 'SRE', text: `Message number ${i} with some extra words to wrap onto a second line of the chat`}))];
		const s = incidentStateAt(many, 100);
		const lay = incidentLayout(s, CONTENT);
		expect(lay.rows.length).toBeGreaterThan(1);
		expect(lay.rows.length).toBeLessThan(12);
		expect(lay.rows[lay.rows.length - 1].index).toBe(11);
		expect(lay.rowsH).toBeLessThanOrEqual(lay.chat.h);
		const stack = [lay.head, lay.pin, lay.banner!, ...lay.tiles, lay.chat, lay.ticket!];
		for (const r of stack) {
			expect(r.x).toBeGreaterThanOrEqual(0);
			expect(r.x + r.w).toBeLessThanOrEqual(CONTENT.w + 0.5);
			expect(r.y + r.h).toBeLessThanOrEqual(CONTENT.h + 0.5);
		}
		expect(lay.chat.y).toBeGreaterThanOrEqual(lay.tiles[0].y + lay.tiles[0].h);
		expect(lay.ticket!.y).toBeGreaterThanOrEqual(lay.chat.y + lay.chat.h);
		expect(incidentProblems(s, CONTENT)).toEqual([]);
	});
	it('reports a slot that is too small, texts that do not fit and too many metrics', () => {
		const s = incidentStateAt(events, 200);
		expect(incidentProblems(s, {x: 0, y: 0, w: 300, h: 300}).join()).toMatch(/too small/);
		expect(incidentProblems(s, {x: 0, y: 0, w: CONTENT.w, h: 520}).join()).toMatch(/chat panel/);
		const long = incidentStateAt([...events, ev(90, {do: 'incident.status', text: 'W'.repeat(40)})], 200);
		expect(incidentProblems(long, CONTENT).join()).toMatch(/status/);
		const five = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ev(5 + i, {do: 'incident.metric', name: n, value: 1}));
		expect(incidentProblems(incidentStateAt([SET, ...five], 100), CONTENT).join()).toMatch(/metrics/);
		const wide = incidentStateAt([SET, ev(1, {do: 'incident.metric', name: 'Requests per second', value: 1, display: '1000000 rps'}), ev(1, {do: 'incident.metric', name: 'B', value: 1}), ev(1, {do: 'incident.metric', name: 'C', value: 1})], 100);
		expect(incidentProblems(wide, CONTENT).join()).toMatch(/tile/);
	});
	it('flags a clock that runs backwards and actions that run over each other', () => {
		const bad = [
			SET,
			ev(10, {do: 'incident.message', role: 'SRE', text: 'a', utc: '13:50', typing_ms: 1000}, 1),
			ev(20, {do: 'incident.message', role: 'SRE', text: 'b', utc: '13:40'}, 2),
			ev(100, {do: 'incident.ticket', title: 'x'.repeat(30)}, 3),
			ev(105, {do: 'incident.ticket', title: 'second'}, 4),
		];
		const p = incidentTimelineProblems(bad).join('\n');
		expect(p).toMatch(/backwards/);
		expect(p).toMatch(/still being typed/);
		expect(p).toMatch(/title is still typing/);
		expect(incidentTimelineProblems(events)).toEqual([]);
		expect(ALERT_FRAMES).toBeGreaterThan(0);
	});
});

describe('incident style contrast', () => {
	it('keeps every text colour legible on the surface it is drawn on, in every style', () => {
		for (const st of STYLES) {
			setActiveStyle(st.id);
			const c = incidentColors(st);
			for (const [name, fg, bg] of [
				['text', c.fg, c.card],
				['muted', c.muted, c.card],
				['err', c.err, c.card],
				['ok', c.ok, c.card],
				['warn', c.warn, c.card],
				...(['info', 'warn', 'err', 'ok'] as const).map((k) => [`on ${k} surface`, c.onSurface[k], c.surfaces[k]] as const),
				...(['info', 'warn', 'err', 'ok'] as const).map((k) => [`${k} on card`, c.text[k], c.card] as const),
			] as const) {
				expect(contrast(fg, bg), `${st.id} ${name}`).toBeGreaterThanOrEqual(4.5);
			}
			for (const col of [c.line.err, c.line.ok, c.line.warn, c.line.info]) {
				const p = c.pill(col);
				expect(contrast(p.fg, p.bg), `${st.id} pill ${col}`).toBeGreaterThanOrEqual(4.5);
			}
			for (const tone of ['ok', 'warn', 'err'] as const) {
				const surface = c.surfaces[tone];
				expect(contrast(c.text[tone], c.card)).toBeGreaterThanOrEqual(4.5);
				expect(surface).toBeTruthy();
			}
		}
		setActiveStyle('sketch');
	});
});

describe('incident demo (content/lab-v3/worlds/incident.json)', () => {
	const file = path.join(__dirname, '../../content/lab-v3/worlds/incident.json');
	const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

	it('validates and declares the incident world as primary, citing the postmortem', () => {
		const v = validateStory(raw);
		expect(v.ok, v.ok ? '' : v.errors.join('; ')).toBe(true);
		expect(raw.world).toBe('incident');
		expect(raw.sources).toContain('https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/');
	});
	it('only shows numbers that the postmortem gives', () => {
		// 13:31..14:52 UTC timeline, 80% traffic lost, nearly 100% CPU, 502 errors, 27 minutes, 3,868 rules, P0, 2019
		const allowed = new Set(['13:30', '13:37', '13:42', '13:45', '14:00', '14:02', '14:07', '14:09', '14:30', '14:52', '14:55', '80', '100', '502', '27', '3,868', '0702', '0', '2019', '2']);
		const strings: string[] = [];
		const walk = (v: unknown, key = '') => {
			if (typeof v === 'string') strings.push(v);
			else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
			else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!['utc', 'from', 'to'].includes(k)) walk(x, k);
		};
		for (const b of raw.beats) {
			strings.push(b.text);
			for (const a of b.visuals) {
				if (a.do === 'incident.metric') strings.push(a.display);
				else if (String(a.do).startsWith('incident.') || a.do === 'world.set') walk(a);
			}
		}
		for (const s of strings) for (const m of s.match(/\d[\d,:.]*\d|\d/g) ?? []) expect(allowed.has(m.replace(/[.,]$/, '')), `number "${m}" in "${s}"`).toBe(true);
		const timed = raw.beats.flatMap((b: {visuals: {utc?: string}[]}) => b.visuals.map((a) => a.utc).filter(Boolean)) as string[];
		for (const t of timed) expect(allowed.has(t), `utc ${t}`).toBe(true);
	});
	it('plays on the timeline with no world problems and the clock moving forward', () => {
		const v = validateStory(raw);
		if (!v.ok) throw new Error('invalid');
		const audio = {lines: v.story.beats.map((b, i) => ({beat_index: i, speaker: b.speaker, src: `a${i}.wav`, duration_ms: 5000}))};
		const tl = buildTimeline(v.story, audio);
		const inst = tl.worlds.find((w) => w.world === 'incident')!;
		expect(incidentTimelineProblems(inst.events)).toEqual([]);
		const end = incidentStateAt(inst.events, tl.beatsEnd);
		expect(end.now).toBe(parseClock('14:52'));
		expect(bannerParts(end)?.pill).toBe('RESOLVED');
		expect(end.windows).toEqual([{from: parseClock('13:45'), to: parseClock('14:09')}]);
		expect(end.ticket?.title).toBe('XSS detection rule change');
		expect(incidentProblems(end, CONTENT)).toEqual([]);
	});
});
