/**
 * incident: an incident chat channel next to a live dashboard. Pure code (no React): the reducer, the validation,
 * the layout geometry and the text checks all read the same state, so the view, vitest and the QA gate agree.
 *
 * Time is data: every action may carry `utc: "HH:MM"`. The dashboard clock sweeps to that time over CLOCK_FRAMES,
 * the charts draw their line up to the clock, chat messages are stamped with it, and the incident window
 * (first alert firing to the last alert resolving) is shaded on every chart.
 *
 * | Action             | Props                                                                      |
 * | world.set          | channel?, sub?, from? ("13:30"), to? ("14:55")                              |
 * | incident.message   | role, text, typing_ms?, utc?                                               |
 * | incident.status    | text, level? (info warn err ok), utc?                                      |
 * | incident.metric    | name, value, max?, display?, tone? (ok warn err), utc?                      |
 * | incident.alert     | text, state (firing resolved), id?, all?, utc?                              |
 * | incident.ticket    | title (files a new one) or status (updates it), key?, kind?, status?, tone? |
 */
import type {Action} from '../../schema';
import type {Rect} from '../../theme';
import {measure, wrap} from '../../text';
import type {WorldEvent, WorldText} from '../types';
import {needString, optNumber, type Props, sv} from '../kit';

export const INCIDENT_ID = 'incident';
export const INCIDENT_ACTIONS = ['incident.message', 'incident.status', 'incident.metric', 'incident.alert', 'incident.ticket'] as const;
export const LEVELS = ['info', 'warn', 'err', 'ok'] as const;
export const TONES = ['ok', 'warn', 'err'] as const;
export type Level = (typeof LEVELS)[number];
export type Tone = (typeof TONES)[number];

// ---- sizes (video pixels). Labels are >= 22 px at 720x1280; 23 px survives the 0.96 entrance scale.
export const LABEL_PX = 23;
export const SMALL_PX = 17;
export const CLOCK_FRAMES = 24;
export const MSG_FRAMES = 9;
export const ALERT_FRAMES = 40;
export const TONE_FRAMES = 30;
export const STATUS_FRAMES = 14;
export const TICKET_FRAMES = 14;
export const TYPE_CPS = 36;
export const GAP = 8;
export const HEAD_H = 60;
export const PIN_H = 48;
export const BANNER_H = 48;
export const TICKET_H = 88;
export const TILE_MIN = 118;
export const TILE_MAX = 176;
export const CHAT_MIN = 120;
export const AVATAR = 36;
export const CHAT_PAD = 12;
export const MAX_METRICS = 4;
export const MAX_MESSAGE = 110;
export const LINE_H = 28;
export const NAME_H = 24;
export const ROW_GAP = 12;
export const TYPING_H = 40;

export interface ChatMessage {role: string; text: string; time: string; frame: number}
export interface Typing {role: string; frame: number; land: number}
export interface MetricPoint {t: number; v: number}
export interface IncidentMetric {name: string; max: number; display: string; tone: Tone; toneFrame: number; frame: number; points: MetricPoint[]}
export interface IncidentAlert {id: string; text: string; state: 'firing' | 'resolved'; frame: number}
export interface IncidentTicket {kind: string; key: string; title: string; status: string; tone: Tone | 'info'; frame: number; statusFrame: number; typeFrames: number}
export interface Plan {alerts: boolean; ticket: boolean; metrics: string[]}
export interface Clock {from: number; to: number; frame: number}
export interface IncidentState {
	visible: boolean;
	channel: string;
	sub: string;
	t0: number;
	t1: number;
	clock: Clock;
	/** the dashboard clock in minutes since 00:00 UTC at this frame */
	now: number;
	status: string;
	level: Level;
	statusFrame: number;
	messages: ChatMessage[];
	typing: Typing | null;
	metrics: IncidentMetric[];
	alerts: IncidentAlert[];
	/** first frame at which an alert was firing in the current run of alerts (0 = never) */
	alertFrame: number;
	/** shaded incident windows in minutes; `to` null while still open */
	windows: {from: number; to: number | null}[];
	ticket: IncidentTicket | null;
	plan: Plan;
}

const pOf = (a: Action) => a as Props;
const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const parseClock = (v: unknown): number | null => {
	if (typeof v !== 'string') return null;
	const m = CLOCK_RE.exec(v);
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const fmtClock = (minutes: number): string => {
	const m = ((Math.floor(minutes + 1e-6) % 1440) + 1440) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const clockText = (minutes: number) => `${fmtClock(minutes)} UTC`;

const smooth = (t: number) => {
	const x = Math.max(0, Math.min(1, t));
	return x * x * (3 - 2 * x);
};
export const clockAt = (c: Clock, frame: number): number => c.from + (c.to - c.from) * smooth((frame - c.frame) / CLOCK_FRAMES);

// ---- validation

const optClock = (p: Props, key: string, what: string): string[] => (p[key] === undefined || parseClock(p[key]) !== null ? [] : [`${what}: "${key}" must be a UTC time like "13:42"`]);
const optShort = (p: Props, key: string, what: string, max: number): string[] => {
	const v = p[key];
	if (v === undefined) return [];
	return typeof v === 'string' && v.trim() && v.length <= max ? [] : [`${what}: "${key}" must be a short text (max ${max} characters)`];
};

export const validateIncident = (a: Action): string[] => {
	const p = pOf(a);
	const kind = String(a.do);
	if (kind === 'world.set') {
		const e = [...optShort(p, 'channel', 'world.set', 28), ...optShort(p, 'sub', 'world.set', 52), ...optClock(p, 'from', 'world.set'), ...optClock(p, 'to', 'world.set')];
		const f = parseClock(p.from ?? '00:00');
		const t = parseClock(p.to);
		if (f !== null && t !== null && (t - f < 10 || t - f > 1440)) e.push('world.set: "to" must be 10 minutes to 24 hours after "from"');
		return e;
	}
	const e = optClock(p, 'utc', kind);
	if (kind === 'incident.message') {
		e.push(...needString(p, 'role', kind, 18), ...needString(p, 'text', kind, MAX_MESSAGE), ...optNumber(p, 'typing_ms', kind, 0, 3000));
		return e;
	}
	if (kind === 'incident.status') {
		e.push(...needString(p, 'text', kind, 40));
		if (p.level !== undefined && !(LEVELS as readonly unknown[]).includes(p.level)) e.push(`${kind}: "level" must be one of ${LEVELS.join(', ')}`);
		return e;
	}
	if (kind === 'incident.metric') {
		e.push(...needString(p, 'name', kind, 14));
		if (typeof p.value !== 'number') e.push(`${kind} needs "value": <number>`);
		else e.push(...optNumber(p, 'value', kind, 0, 1_000_000));
		e.push(...optNumber(p, 'max', kind, 0.001, 1_000_000), ...optShort(p, 'display', kind, 14), ...optShort(p, 'unit', kind, 6));
		if (p.tone !== undefined && !(TONES as readonly unknown[]).includes(p.tone)) e.push(`${kind}: "tone" must be one of ${TONES.join(', ')}`);
		if (typeof p.value === 'number' && typeof p.max === 'number' && p.value > p.max) e.push(`${kind}: "value" is above "max"`);
		return e;
	}
	if (kind === 'incident.alert') {
		e.push(...needString(p, 'text', kind, 44), ...optShort(p, 'id', kind, 24));
		if (p.state !== 'firing' && p.state !== 'resolved') e.push(`${kind}: "state" must be firing or resolved`);
		return e;
	}
	if (kind === 'incident.ticket') {
		const filing = p.title !== undefined;
		if (filing) e.push(...needString(p, 'title', kind, 44));
		else if (p.status === undefined) e.push(`${kind} needs "title" (to file a ticket) or "status" (to update it)`);
		e.push(...optShort(p, 'key', kind, 12), ...optShort(p, 'kind', kind, 16), ...optShort(p, 'status', kind, 14));
		if (p.tone !== undefined && !(TONES as readonly unknown[]).includes(p.tone)) e.push(`${kind}: "tone" must be one of ${TONES.join(', ')}`);
		return e;
	}
	return [`unknown incident action "${kind}"`];
};

// ---- the plan: frame-independent facts of the whole script (what the layout reserves room for)

const planCache = new WeakMap<WorldEvent[], Plan>();
export const planOf = (events: WorldEvent[]): Plan => {
	const hit = planCache.get(events);
	if (hit) return hit;
	const plan: Plan = {alerts: false, ticket: false, metrics: []};
	for (const e of events) {
		const k = String(e.action.do);
		if (k === 'incident.alert') plan.alerts = true;
		else if (k === 'incident.ticket') plan.ticket = true;
		else if (k === 'incident.metric') {
			const n = sv(pOf(e.action).name);
			if (n && !plan.metrics.includes(n)) plan.metrics.push(n);
		}
	}
	planCache.set(events, plan);
	return plan;
};

export const typingFrames = (a: Action): number => {
	const ms = pOf(a).typing_ms;
	return typeof ms === 'number' && ms > 0 ? Math.round((ms / 1000) * 30) : 0;
};
export const typeFramesOf = (title: string, cps = TYPE_CPS): number => Math.ceil((title.length * 30) / cps) + 4;

const defaultTicketTone = (status: string): Tone | 'info' => (/clos|done|resolv|fixed|not a bug|rolled/i.test(status) ? 'ok' : 'info');

// ---- the reducer

export const incidentStateAt = (events: WorldEvent[], frame: number): IncidentState => {
	const plan = planOf(events);
	const s: IncidentState = {
		visible: false, channel: 'incident', sub: '', t0: 0, t1: 0, clock: {from: 0, to: 0, frame: 0}, now: 0, status: 'Investigating', level: 'info', statusFrame: 0,
		messages: [], typing: null, metrics: [], alerts: [], alertFrame: 0, windows: [], ticket: null, plan,
	};
	let started = false;
	let lastLand = -1;
	const landed: ChatMessage[] = [];
	for (const e of events) {
		if (e.frame > frame) break;
		const p = pOf(e.action);
		const kind = String(e.action.do);
		if (kind === 'world.set') {
			s.visible = true;
			s.channel = sv(p.channel, s.channel);
			s.sub = sv(p.sub, s.sub);
			const f = parseClock(p.from);
			const t = parseClock(p.to);
			if (!started) {
				s.t0 = f ?? parseClock('00:00')!;
				s.t1 = t ?? s.t0 + 60;
				s.clock = {from: s.t0, to: s.t0, frame: e.frame};
				started = true;
			} else {
				if (f !== null) s.t0 = f;
				if (t !== null) s.t1 = t;
			}
			continue;
		}
		if (!started) continue;
		const u = parseClock(p.utc);
		if (u !== null) s.clock = {from: clockAt(s.clock, e.frame), to: u, frame: e.frame};
		const target = s.clock.to;
		switch (kind) {
			case 'incident.message': {
				const tf = typingFrames(e.action);
				const land = e.frame + tf;
				if (land <= frame) {
					landed.push({role: sv(p.role), text: sv(p.text), time: fmtClock(target), frame: land});
					lastLand = Math.max(lastLand, land);
				} else s.typing = {role: sv(p.role), frame: e.frame, land};
				break;
			}
			case 'incident.status':
				s.status = sv(p.text);
				s.level = (LEVELS as readonly unknown[]).includes(p.level) ? (p.level as Level) : 'info';
				s.statusFrame = e.frame;
				break;
			case 'incident.metric': {
				const name = sv(p.name);
				const max = typeof p.max === 'number' && p.max > 0 ? p.max : 100;
				const value = typeof p.value === 'number' ? p.value : 0;
				let m = s.metrics.find((x) => x.name === name);
				if (!m) {
					m = {name, max, display: '', tone: 'ok', toneFrame: -1000, frame: e.frame, points: []};
					s.metrics.push(m);
				}
				const tone = (TONES as readonly unknown[]).includes(p.tone) ? (p.tone as Tone) : m.tone;
				if (tone !== m.tone && m.points.length) m.toneFrame = e.frame;
				m.tone = tone;
				m.max = max;
				m.display = sv(p.display, `${value}${sv(p.unit)}`);
				m.frame = e.frame;
				const prev = m.points[m.points.length - 1];
				m.points.push({t: Math.max(target, prev?.t ?? target), v: value});
				break;
			}
			case 'incident.alert': {
				const text = sv(p.text);
				const id = sv(p.id, text);
				const wasFiring = s.alerts.some((x) => x.state === 'firing');
				if (p.state === 'firing') {
					const i = s.alerts.findIndex((x) => x.id === id);
					const entry: IncidentAlert = {id, text, state: 'firing', frame: e.frame};
					if (i >= 0) s.alerts[i] = entry;
					else s.alerts.push(entry);
				} else {
					const firing = s.alerts.filter((x) => x.state === 'firing');
					const hit = p.all === true ? firing : firing.filter((x) => x.id === id);
					const targets = hit.length ? hit : firing.length ? [firing[firing.length - 1]] : [];
					for (const x of targets) {
						x.state = 'resolved';
						x.frame = e.frame;
						if (p.all !== true) x.text = text || x.text;
					}
					if (!targets.length) s.alerts.push({id, text, state: 'resolved', frame: e.frame});
				}
				const isFiring = s.alerts.some((x) => x.state === 'firing');
				if (!wasFiring && isFiring) {
					s.windows.push({from: target, to: null});
					s.alertFrame = e.frame;
				}
				if (wasFiring && !isFiring && s.windows.length) s.windows[s.windows.length - 1].to = target;
				break;
			}
			case 'incident.ticket': {
				if (p.title !== undefined) {
					const title = sv(p.title);
					const status = sv(p.status, 'OPEN');
					s.ticket = {kind: sv(p.kind, 'TICKET'), key: sv(p.key), title, status, tone: (TONES as readonly unknown[]).includes(p.tone) ? (p.tone as Tone) : defaultTicketTone(status), frame: e.frame, statusFrame: e.frame, typeFrames: typeFramesOf(title)};
				} else if (s.ticket) {
					const status = sv(p.status, s.ticket.status);
					s.ticket = {...s.ticket, status, tone: (TONES as readonly unknown[]).includes(p.tone) ? (p.tone as Tone) : defaultTicketTone(status), statusFrame: e.frame};
				}
				break;
			}
		}
	}
	landed.sort((a, b) => a.frame - b.frame);
	s.messages = landed;
	if (s.typing && s.typing.land <= frame) s.typing = null;
	s.now = s.visible ? clockAt(s.clock, frame) : 0;
	void lastLand;
	return s;
};

// ---- charts

/** The metric's value at time `t` (minutes): the line holds the first value before its first point and the last after. */
export const metricValueAt = (m: IncidentMetric, t: number): number => {
	const pts = m.points;
	if (!pts.length) return 0;
	if (t <= pts[0].t) return pts[0].v;
	for (let i = 1; i < pts.length; i++) {
		if (t <= pts[i].t) {
			const a = pts[i - 1];
			const b = pts[i];
			return b.t === a.t ? b.v : a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t));
		}
	}
	return pts[pts.length - 1].v;
};

/** The polyline of a metric from the axis start up to the clock, as [minutes, value] pairs. */
export const chartSeries = (m: IncidentMetric, t0: number, now: number): [number, number][] => {
	if (!m.points.length) return [];
	const out: [number, number][] = [[t0, m.points[0].v]];
	for (const p of m.points) if (p.t > t0 && p.t <= now) out.push([p.t, p.v]);
	out.push([Math.max(t0, now), metricValueAt(m, now)]);
	return out;
};

// ---- layout (shared by the view and the checks)

export interface TileBox {name: string; x: number; y: number; w: number; h: number}
export interface MsgRow {index: number; lines: string[]; h: number}
export interface IncidentLayout {
	head: Rect;
	pin: Rect;
	banner: Rect | null;
	tiles: TileBox[];
	ticket: Rect | null;
	chat: Rect;
	bodyW: number;
	rows: MsgRow[];
	rowsH: number;
	chatFits: boolean;
}

export const incidentLayout = (s: IncidentState, rect: Rect): IncidentLayout => {
	const w = rect.w;
	const names = s.plan.metrics.slice(0, MAX_METRICS);
	const n = names.length;
	const cols = n <= 2 ? Math.max(1, n) : n === 3 ? 3 : 2;
	const nrows = n ? Math.ceil(n / cols) : 0;
	const bannerH = s.plan.alerts ? BANNER_H + GAP : 0;
	const ticketH = s.plan.ticket ? TICKET_H + GAP : 0;
	const fixed = HEAD_H + GAP + PIN_H + GAP + bannerH + ticketH;
	const room = rect.h - fixed - CHAT_MIN - GAP;
	const tileH = nrows ? Math.max(nrows > 1 ? 108 : TILE_MIN, Math.min(nrows > 1 ? 132 : TILE_MAX, Math.floor((room - (nrows - 1) * GAP) / nrows))) : 0;
	let y = 0;
	const head = {x: 0, y, w, h: HEAD_H};
	y += HEAD_H + GAP;
	const pin = {x: 0, y, w, h: PIN_H};
	y += PIN_H + GAP;
	let banner: Rect | null = null;
	if (s.plan.alerts) {
		banner = {x: 0, y, w, h: BANNER_H};
		y += BANNER_H + GAP;
	}
	const tiles: TileBox[] = [];
	const tw = (w - GAP * (cols - 1)) / cols;
	names.forEach((name, i) => tiles.push({name, x: (i % cols) * (tw + GAP), y: y + Math.floor(i / cols) * (tileH + GAP), w: tw, h: tileH}));
	if (nrows) y += nrows * tileH + (nrows - 1) * GAP + GAP;
	let ticket: Rect | null = null;
	const chatBottom = rect.h - (s.plan.ticket ? TICKET_H + GAP : 0);
	if (s.plan.ticket) ticket = {x: 0, y: rect.h - TICKET_H, w, h: TICKET_H};
	const chat = {x: 0, y, w, h: Math.max(0, chatBottom - y)};
	const bodyW = w - CHAT_PAD * 2 - AVATAR - 12;
	// newest rows from the bottom that fit (the typing row takes room first)
	const avail = chat.h - CHAT_PAD * 2 - (s.typing ? TYPING_H : 0);
	const rows: MsgRow[] = [];
	let used = 0;
	for (let i = s.messages.length - 1; i >= 0; i--) {
		const lines = wrap(s.messages[i].text, 'ui', LABEL_PX, bodyW);
		const h = Math.max(AVATAR, NAME_H + lines.length * LINE_H) + ROW_GAP;
		if (used + h - ROW_GAP > avail && rows.length) break;
		rows.unshift({index: i, lines, h});
		used += h;
	}
	return {head, pin, banner, tiles, ticket, chat, bodyW, rows, rowsH: used, chatFits: rows.length === 0 || used - ROW_GAP <= avail + 0.5};
};

// ---- text, tokens, checks

export const bannerParts = (s: IncidentState): {pill: string; text: string; chip: string; tone: 'ok' | 'err' | 'muted'} | null => {
	if (!s.plan.alerts) return null;
	const firing = s.alerts.filter((x) => x.state === 'firing');
	if (firing.length) {
		const last = firing.reduce((a, b) => (b.frame >= a.frame ? b : a));
		return {pill: 'FIRING', text: last.text, chip: firing.length > 1 ? `${firing.length} firing` : '', tone: 'err'};
	}
	const resolved = s.alerts.filter((x) => x.state === 'resolved');
	if (resolved.length) {
		const last = resolved.reduce((a, b) => (b.frame >= a.frame ? b : a));
		return {pill: 'RESOLVED', text: last.text, chip: 'all clear', tone: 'ok'};
	}
	return {pill: 'OK', text: 'No active alerts', chip: '', tone: 'muted'};
};

export const bannerTextLeft = (pill: string): number => 46 + Math.ceil(measure(pill, 'ui', 19, 800)) + pill.length * 0.5 + 20 + 14;

export const incidentTexts = (s: IncidentState, rect: Rect): string[] => {
	if (!s.visible) return [];
	const lay = incidentLayout(s, rect);
	const out: string[] = [`#${s.channel}`, ...(s.sub ? [s.sub] : []), clockText(s.now), s.status];
	const b = bannerParts(s);
	if (b) out.push(b.pill, b.text, ...(b.chip ? [b.chip] : []));
	for (const m of s.metrics) out.push(m.name, m.display);
	for (const r of lay.rows) out.push(s.messages[r.index].role, s.messages[r.index].text);
	if (s.typing) out.push(`${s.typing.role} is typing`);
	if (s.ticket) out.push(s.ticket.kind, ...(s.ticket.key ? [s.ticket.key] : []), s.ticket.title, s.ticket.status);
	return out;
};

export const incidentTokens = (a: Action): WorldText[] => {
	const p = pOf(a);
	switch (String(a.do)) {
		case 'world.set': return [...(p.channel ? [{text: sv(p.channel), off: 0}] : []), ...(p.sub ? [{text: sv(p.sub), off: 0}] : [])];
		case 'incident.message': return [{text: sv(p.text), off: typingFrames(a)}];
		case 'incident.status': return [{text: sv(p.text), off: 0}];
		case 'incident.metric': return [{text: sv(p.name), off: 0}, {text: sv(p.display, `${sv(p.value)}${sv(p.unit)}`), off: 0}];
		case 'incident.alert': return [{text: sv(p.text), off: 0}];
		case 'incident.ticket': {
			if (p.title === undefined) return p.status !== undefined ? [{text: sv(p.status), off: 0}] : [];
			const tf = typeFramesOf(sv(p.title));
			return [...(p.key ? [{text: sv(p.key), off: 0}] : []), {text: sv(p.title), off: tf}, {text: sv(p.status, 'OPEN'), off: tf}];
		}
		default: return [];
	}
};

export const incidentSettle = (a: Action): number => {
	const k = String(a.do);
	const clock = pOf(a).utc !== undefined ? CLOCK_FRAMES : 0;
	if (k === 'incident.message') return typingFrames(a) + Math.max(MSG_FRAMES, clock) + 2;
	if (k === 'incident.ticket') return (pOf(a).title !== undefined ? typeFramesOf(sv(pOf(a).title)) : 0) + Math.max(TICKET_FRAMES, clock) + 2;
	if (k === 'incident.alert') return Math.max(ALERT_FRAMES, clock) + 2;
	return Math.max(TONE_FRAMES, STATUS_FRAMES, clock) + 2;
};
export const incidentRows = (a: Action): number => (String(a.do) === 'incident.ticket' ? 2 : 1);

const fits = (text: string, px: number, maxW: number, weight = 700) => measure(text, 'ui', px, weight) <= maxW + 0.5;

export const incidentProblems = (s: IncidentState, rect: Rect): string[] => {
	const out: string[] = [];
	if (!s.visible) return out;
	if (rect.w < 480 || rect.h < 520) out.push(`incident slot ${Math.round(rect.w)}x${Math.round(rect.h)} is too small for the chat and the dashboard (needs 480x520)`);
	if (s.plan.metrics.length > MAX_METRICS) out.push(`incident dashboard has ${s.plan.metrics.length} metrics; keep it to ${MAX_METRICS} or fewer`);
	const lay = incidentLayout(s, rect);
	if (lay.chat.h < CHAT_MIN) out.push(`the chat panel is ${Math.round(lay.chat.h)} px tall (needs ${CHAT_MIN}); give the world a taller slot or drop a metric`);
	if (!lay.chatFits) out.push('the newest chat message does not fit the chat panel');
	if (!fits(s.status, LABEL_PX, rect.w - 80)) out.push(`status "${s.status}" does not fit on one line`);
	if (!fits(`#${s.channel}`, LABEL_PX, rect.w - 220)) out.push(`channel "#${s.channel}" does not fit the header`);
	if (s.sub && measure(s.sub, 'ui', SMALL_PX) > rect.w - 220) out.push(`sub line "${s.sub}" does not fit the header`);
	const b = bannerParts(s);
	if (b && !fits(b.text, LABEL_PX, rect.w - bannerTextLeft(b.pill) - 14 - (b.chip ? measure(b.chip, 'ui', SMALL_PX + 1, 800) + 12 : 0), 500)) out.push(`alert "${b.text}" does not fit on one line`);
	for (const t of lay.tiles) {
		const m = s.metrics.find((x) => x.name === t.name);
		if (m && measure(m.name, 'ui', LABEL_PX, 700) + measure(m.display, 'ui', LABEL_PX, 700) + 36 > t.w) out.push(`metric "${m.name}" and its value "${m.display}" do not fit a ${Math.round(t.w)} px tile`);
	}
	if (lay.ticket && s.ticket) {
		const room = rect.w - 28 - measure(s.ticket.status, 'ui', SMALL_PX + 1, 700) - 44;
		if (!fits(s.ticket.title, LABEL_PX, room, 500)) out.push(`ticket "${s.ticket.title}" does not fit on one line`);
	}
	return out;
};

export const incidentTimelineProblems = (events: WorldEvent[]): string[] => {
	const out: string[] = [];
	let clock = -1;
	let landAt = -1;
	let typeEnd = -1;
	for (const e of events) {
		const p = pOf(e.action);
		const k = String(e.action.do);
		if (k === 'world.set') continue;
		const u = parseClock(p.utc);
		if (u !== null) {
			if (clock >= 0 && u < clock) out.push(`beat ${e.beat}: the clock moves backwards (${fmtClock(clock)} to ${fmtClock(u)})`);
			clock = Math.max(clock, u);
		}
		if (k === 'incident.message') {
			if (e.frame < landAt) out.push(`beat ${e.beat}: a message starts while the previous one is still being typed; give it an "at" or wait`);
			landAt = e.frame + typingFrames(e.action);
		}
		if (k === 'incident.ticket' && p.title !== undefined) {
			if (e.frame < typeEnd) out.push(`beat ${e.beat}: a ticket is filed while the previous title is still typing`);
			typeEnd = e.frame + typeFramesOf(sv(p.title));
		}
	}
	return out;
};

export const incidentIsSignature = (a: Action): boolean => {
	const k = String(a.do);
	const p = pOf(a);
	return k === 'incident.alert' || (k === 'incident.ticket' && (p.title !== undefined || p.status !== undefined));
};
