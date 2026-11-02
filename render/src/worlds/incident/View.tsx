import React from 'react';
import {lin, prog} from '../../theme';
import {contrast, mixHexRaw} from '../../styles';
import type {Style} from '../../styles';
import type {WorldViewProps} from '../types';
import {measure} from '../../text';
import {legible} from '../kit';
import {
	ALERT_FRAMES,
	AVATAR,
	bannerParts,
	bannerTextLeft,
	chartSeries,
	CHAT_PAD,
	clockText,
	GAP,
	IncidentAlert,
	incidentLayout,
	IncidentMetric,
	IncidentState,
	LABEL_PX,
	LINE_H,
	MSG_FRAMES,
	NAME_H,
	ROW_GAP,
	SMALL_PX,
	STATUS_FRAMES,
	TICKET_FRAMES,
	TONE_FRAMES,
	TYPING_H,
	type Level,
	type Tone,
} from './model';

/** The colours of the incident room in a style; every text colour is legible on the surface it sits on. */
export const incidentColors = (st: Style) => {
	const t = st.tokens;
	const card = t.card;
	const err = legible(t.like, card);
	const ok = legible(t.ok, card);
	const warn = legible(t.accentText, card);
	const fg = legible(t.ink, card);
	const muted = legible(t.muted, card);
	const tint = (c: string, a: number) => mixHexRaw(card, c, a);
	const surfaces = {
		info: tint(t.muted, 0.14),
		warn: tint(t.accent, 0.2),
		err: tint(t.like, 0.2),
		ok: tint(t.ok, 0.2),
	};
	const on = (bg: string) => legible(t.ink, bg);
	return {
		card,
		rule: t.faint,
		fg,
		muted,
		err,
		ok,
		warn,
		line: {ok: t.ok, warn: t.accent, err: t.like, info: t.muted},
		surfaces,
		/** text on each tinted surface */
		onSurface: {info: on(surfaces.info), warn: on(surfaces.warn), err: on(surfaces.err), ok: on(surfaces.ok)},
		/** the status colours as text on the plain card */
		text: {info: muted, warn, err, ok},
		/** filled pill: background colour and a text colour legible on it */
		pill: (c: string) => ({bg: c, fg: onFill(c, [t.card, t.ink])}),
		avatars: t.cast.length ? t.cast : [t.accent],
		onFill: (bg: string) => onFill(bg, [t.card, t.ink]),
		paper: t.paper,
		ink: t.ink,
		card2: card,
	};
};
/** the most legible text colour on a solid fill: the style's own colours first, black or white if none reaches 4.5 */
const onFill = (bg: string, own: string[]): string => {
	const all = [...own, '#000000', '#ffffff'];
	const ok = own.find((c) => contrast(c, bg) >= 4.5);
	return ok ?? all.reduce((a, b) => (contrast(b, bg) > contrast(a, bg) ? b : a));
};
export type IncidentColors = ReturnType<typeof incidentColors>;

const hash = (s: string) => {
	let h = 7;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
};
const initials = (role: string) => (role.trim().charAt(0) || '?').toUpperCase();
const levelOf = (l: Level): 'info' | 'warn' | 'err' | 'ok' => l;
const backOut = (t: number) => {
	const x = Math.max(0, Math.min(1, t)) - 1;
	return 1 + 2.70158 * x * x * x + 1.70158 * x * x;
};

const Bell: React.FC<{color: string; rot: number}> = ({color, rot}) => (
	<svg width={26} height={26} viewBox="0 0 24 24" style={{transform: `rotate(${rot}deg)`, transformOrigin: '50% 10%'}} aria-hidden="true">
		<path d="M6 17h12l-1.6-2.2V10a4.4 4.4 0 0 0-8.8 0v4.8L6 17z M10 19.5a2 2 0 0 0 4 0" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);
const Check: React.FC<{color: string; scale: number}> = ({color, scale}) => (
	<svg width={26} height={26} viewBox="0 0 24 24" style={{transform: `scale(${scale})`}} aria-hidden="true">
		<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);
const Pin: React.FC<{color: string}> = ({color}) => (
	<svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
		<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z M12 14v7" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const Tile: React.FC<{m: IncidentMetric; s: IncidentState; box: {x: number; y: number; w: number; h: number}; frame: number; c: IncidentColors; font: string}> = ({m, s, box, frame, c, font}) => {
	const tone: Tone = m.tone;
	const age = frame - m.toneFrame;
	const flash = tone === 'ok' ? 0 : 1 - lin(age, 0, TONE_FRAMES);
	const surface = tone === 'ok' ? c.card : mixHexRaw(c.card, c.line[tone], 0.1 + 0.12 * flash);
	const valCol = legible(c.text[tone], surface);
	const nameCol = legible(c.muted, surface);
	const padX = 12;
	const top = 38;
	const bottom = 24;
	const cw = box.w - padX * 2;
	const ch = Math.max(24, box.h - top - bottom - 4);
	const span = Math.max(1, s.t1 - s.t0);
	const X = (t: number) => padX + ((t - s.t0) / span) * cw;
	const Y = (v: number) => top + ch - Math.max(0, Math.min(1, v / m.max)) * ch;
	const series = chartSeries(m, s.t0, s.now);
	const pts = series.map(([t, v]) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`);
	const head = series[series.length - 1];
	const lineCol = c.line[tone === 'ok' ? 'ok' : tone];
	const area = series.length > 1 ? `${pts.join(' ')} ${X(head[0]).toFixed(1)},${(top + ch).toFixed(1)} ${X(series[0][0]).toFixed(1)},${(top + ch).toFixed(1)}` : '';
	const pulse = (Math.sin(frame / 4) + 1) / 2;
	return (
		<div
			style={{
				position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, boxSizing: 'border-box', background: surface, overflow: 'hidden',
				border: `${tone === 'ok' ? 1.5 : 2 + 3 * flash}px solid ${tone === 'ok' ? c.rule : c.line[tone]}`, borderRadius: 12,
			}}
		>
			<div data-label style={{position: 'absolute', left: padX, top: 6, fontFamily: font, fontSize: LABEL_PX, fontWeight: 700, lineHeight: '28px', color: nameCol, whiteSpace: 'nowrap'}}>{m.name}</div>
			<div data-label style={{position: 'absolute', right: padX, top: 6, fontFamily: font, fontSize: LABEL_PX, fontWeight: 800, lineHeight: '28px', color: valCol, whiteSpace: 'nowrap'}}>{m.display}</div>
			<svg style={{position: 'absolute', left: 0, top: 0}} width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
				{s.windows.map((w, i) => {
					const x0 = X(Math.max(s.t0, w.from));
					const x1 = X(Math.min(s.t1, Math.min(s.now, w.to ?? s.now)));
					return x1 > x0 ? <rect key={i} x={x0} y={top - 4} width={x1 - x0} height={ch + 8} fill={c.line.err} opacity={0.16} /> : null;
				})}
				<line x1={padX} x2={padX + cw} y1={top + ch / 2} y2={top + ch / 2} stroke={c.rule} strokeWidth={1} strokeDasharray="4 6" />
				<line x1={padX} x2={padX + cw} y1={top + ch} y2={top + ch} stroke={c.rule} strokeWidth={1.5} />
				{area && <polygon points={area} fill={lineCol} opacity={0.16} />}
				{pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke={lineCol} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
				{head && <line x1={X(head[0])} x2={X(head[0])} y1={top - 2} y2={top + ch} stroke={lineCol} strokeWidth={1.5} strokeDasharray="3 4" opacity={0.7} />}
				{head && <circle cx={X(head[0])} cy={Y(head[1])} r={7 + (tone === 'err' ? 3 * pulse : 0)} fill={lineCol} opacity={tone === 'err' ? 0.35 : 0.25} />}
				{head && <circle cx={X(head[0])} cy={Y(head[1])} r={5} fill={lineCol} />}
			</svg>
			<div data-data style={{position: 'absolute', left: padX, bottom: 3, fontFamily: font, fontSize: SMALL_PX, color: nameCol, whiteSpace: 'nowrap'}}>{clockText(s.t0).slice(0, 5)}</div>
			<div data-data style={{position: 'absolute', right: padX, bottom: 3, fontFamily: font, fontSize: SMALL_PX, color: nameCol, whiteSpace: 'nowrap'}}>{clockText(s.t1).slice(0, 5)}</div>
		</div>
	);
};

export const IncidentView: React.FC<WorldViewProps<IncidentState>> = ({state: s, rect, frame, start, style: st, dim}) => {
	if (!s.visible) return null;
	const c = incidentColors(st);
	const font = st.font.ui.fontFamily;
	const weight = st.font.ui.fontWeight;
	const lay = incidentLayout(s, rect);
	const radius = Math.min(14, st.skin.panel.radius + 4);
	const enter = lin(frame, start, 12);
	const panel = (r: {x: number; y: number; w: number; h: number}, bg: string, extra?: React.CSSProperties): React.CSSProperties => ({
		position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, boxSizing: 'border-box', background: bg, border: `1.5px solid ${c.rule}`, borderRadius: radius, overflow: 'hidden', ...extra,
	});
	const mono = st.font.mono;

	// ---- pinned status line
	const lv = levelOf(s.level);
	const statusP = prog(frame, s.statusFrame, STATUS_FRAMES);
	const statusAge = frame - s.statusFrame;
	const pinFlash = s.statusFrame > 0 ? 1 - lin(statusAge, 0, 22) : 0;
	const pinBg = mixHexRaw(c.surfaces[lv], c.line[lv], 0.25 * pinFlash);
	const pinFg = legible(c.ink, pinBg);

	// ---- alert banner
	const b = bannerParts(s);
	const lastAlert: IncidentAlert | undefined = s.alerts.length ? s.alerts.reduce((a, x) => (x.frame >= a.frame ? x : a)) : undefined;
	const aAge = lastAlert ? frame - lastAlert.frame : 1000;
	const aAmt = b?.tone === 'err' ? Math.max(0, 1 - aAge / ALERT_FRAMES) : 0;
	const bannerBg = b ? (b.tone === 'err' ? mixHexRaw(c.surfaces.err, c.line.err, 0.3 * aAmt * Math.abs(Math.sin(aAge / 3.2))) : b.tone === 'ok' ? c.surfaces.ok : c.card) : c.card;
	const bannerFg = legible(c.ink, bannerBg);
	const bannerBorder = b ? (b.tone === 'err' ? c.line.err : b.tone === 'ok' ? c.line.ok : c.rule) : c.rule;
	const pillCol = b ? (b.tone === 'err' ? c.line.err : b.tone === 'ok' ? c.line.ok : c.rule) : c.rule;
	const pill = c.pill(pillCol);
	const rot = b?.tone === 'err' ? Math.sin(aAge * 0.95) * 24 * aAmt : 0;
	const checkScale = b?.tone === 'ok' ? 0.4 + 0.6 * backOut(aAge / 14) : 1;

	// ---- chat
	const newest = lay.rows[lay.rows.length - 1];
	const mp = s.messages.length ? prog(frame, s.messages[s.messages.length - 1].frame, MSG_FRAMES) : 1;
	const slide = newest ? (1 - mp) * (newest.h + 6) : 0;
	const typingBottom = lay.chat.h - CHAT_PAD;
	const rowsBottom = typingBottom - (s.typing ? TYPING_H : 0);
	let yy = rowsBottom;
	const placed = [...lay.rows].reverse().map((r) => {
		yy -= r.h - ROW_GAP;
		const top = yy;
		yy -= ROW_GAP;
		return {r, top};
	});

	// ---- ticket
	const tk = s.ticket;
	const tkP = tk ? prog(frame, tk.frame, TICKET_FRAMES) : 0;
	const typed = tk ? lin(frame, tk.frame + 6, Math.max(1, tk.typeFrames - 6)) : 1;
	const chipIn = tk ? lin(frame, tk.frame + tk.typeFrames - 4, 6) : 1;
	const chipAge = tk && tk.statusFrame > tk.frame ? frame - tk.statusFrame : 99;
	const chipPulse = chipAge < 14 ? 1 + 0.3 * (1 - chipAge / 14) : 1;
	const tkTone = tk ? (tk.tone === 'info' ? 'info' : tk.tone) : 'info';
	const chipBg = tk ? c.surfaces[tkTone] : c.card;
	const chipFg = tk ? legible(c.ink, chipBg) : c.fg;
	const chipLine = tk ? c.line[tkTone] : c.rule;

	return (
		<div
			data-shell
			data-world="incident"
			style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity: dim ? 0.42 : 1, transform: `scale(${0.96 + 0.04 * enter})`, transformOrigin: '50% 40%', fontFamily: font, fontWeight: weight}}
		>
			{/* header: channel and the dashboard clock */}
			<div style={panel(lay.head, c.card)}>
				<div style={{position: 'absolute', left: 14, top: 12, width: 12, height: 12, borderRadius: 6, background: c.line.err, opacity: 0.45 + 0.55 * (Math.floor(frame / 15) % 2)}} />
				<div data-label style={{position: 'absolute', left: 36, top: 5, fontSize: LABEL_PX, fontWeight: 800, lineHeight: '28px', color: c.fg, whiteSpace: 'nowrap'}}>{`#${s.channel}`}</div>
				{s.sub && <div data-data style={{position: 'absolute', left: 36, top: 33, fontSize: SMALL_PX, lineHeight: '20px', color: c.muted, whiteSpace: 'nowrap'}}>{s.sub}</div>}
				<div data-label style={{position: 'absolute', right: 14, top: 14, ...mono, fontSize: LABEL_PX, fontWeight: 700, lineHeight: '30px', color: c.fg, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'}}>{clockText(s.now)}</div>
			</div>

			{/* pinned status line */}
			<div style={panel(lay.pin, pinBg, {borderColor: c.line[lv]})}>
				<div style={{position: 'absolute', left: 12, top: 12}}><Pin color={pinFg} /></div>
				<div data-label style={{position: 'absolute', left: 46, top: 8, fontSize: LABEL_PX, fontWeight: 800, lineHeight: '30px', color: pinFg, whiteSpace: 'nowrap', opacity: 0.4 + 0.6 * statusP, transform: `translateY(${(1 - statusP) * 12}px)`}}>{s.status}</div>
			</div>

			{/* alert banner */}
			{lay.banner && b && (
				<div style={panel(lay.banner, bannerBg, {borderColor: bannerBorder, borderWidth: 1.5 + 2.5 * aAmt})}>
					<div style={{position: 'absolute', left: 10, top: 10}}>{b.tone === 'ok' ? <Check color={pillCol === c.rule ? bannerFg : c.ok} scale={checkScale} /> : <Bell color={b.tone === 'err' ? c.err : c.muted} rot={rot} />}</div>
					<div data-data style={{position: 'absolute', left: 46, top: 8, fontSize: 19, fontWeight: 800, lineHeight: '28px', letterSpacing: 0.5, color: pill.fg, background: pill.bg, padding: '0 10px', borderRadius: 8, whiteSpace: 'nowrap'}}>{b.pill}</div>
					<div data-label style={{position: 'absolute', left: bannerTextLeft(b.pill), top: 8, fontSize: LABEL_PX, fontWeight: 500, lineHeight: '30px', color: bannerFg, whiteSpace: 'nowrap'}}>{b.text}</div>
					{b.chip && <div data-data style={{position: 'absolute', right: 12, top: 12, fontSize: SMALL_PX + 1, fontWeight: 800, lineHeight: '22px', color: bannerFg, whiteSpace: 'nowrap'}}>{b.chip}</div>}
				</div>
			)}

			{/* dashboard */}
			{lay.tiles.map((t) => {
				const m = s.metrics.find((x) => x.name === t.name);
				return m ? <Tile key={t.name} m={m} s={s} box={t} frame={frame} c={c} font={font} /> : <div key={t.name} style={{...panel(t, 'transparent'), borderStyle: 'dashed'}} />;
			})}

			{/* chat */}
			<div style={panel(lay.chat, c.card)}>
				{placed.map(({r, top}) => {
					const m = s.messages[r.index];
					const idx = hash(m.role) % c.avatars.length;
					const av = c.avatars[idx];
					const nameCol = legible(av, c.card);
					const isNew = r === newest;
					const square = st.skin.avatar === 'monogram-square';
					return (
						<div key={`${m.frame}.${r.index}`} style={{position: 'absolute', left: CHAT_PAD, top, width: lay.chat.w - CHAT_PAD * 2, height: r.h - ROW_GAP, transform: `translateY(${slide}px)`, opacity: isNew ? mp : 1}}>
							<div style={{position: 'absolute', left: 0, top: 0, width: AVATAR, height: AVATAR, borderRadius: square ? 8 : AVATAR / 2, background: av, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.onFill(av), fontSize: 20, fontWeight: 800, lineHeight: 1}}>{initials(m.role)}</div>
							<div data-data style={{position: 'absolute', left: AVATAR + 12, top: 0, fontSize: 19, fontWeight: 800, lineHeight: `${NAME_H}px`, color: nameCol, whiteSpace: 'nowrap'}}>{m.role}</div>
							<div data-data style={{position: 'absolute', right: 0, top: 2, fontSize: SMALL_PX, lineHeight: '22px', color: c.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'}}>{m.time}</div>
							{r.lines.map((ln, i) => (
								<div key={i} data-label style={{position: 'absolute', left: AVATAR + 12, top: NAME_H + i * LINE_H, fontSize: LABEL_PX, fontWeight: weight, lineHeight: `${LINE_H}px`, color: c.fg, whiteSpace: 'nowrap'}}>{ln}</div>
							))}
						</div>
					);
				})}
				{s.typing && (
					<div style={{position: 'absolute', left: CHAT_PAD, top: typingBottom - TYPING_H + 4, height: TYPING_H - 8, display: 'flex', alignItems: 'center', gap: 10}}>
						<div style={{display: 'flex', gap: 5}}>
							{[0, 1, 2].map((i) => (
								<div key={i} style={{width: 9, height: 9, borderRadius: 5, background: c.muted, transform: `translateY(${-5 * Math.max(0, Math.sin((frame - i * 4) / 3))}px)`}} />
							))}
						</div>
						<div data-data style={{fontSize: SMALL_PX + 1, color: c.muted, whiteSpace: 'nowrap'}}>{`${s.typing.role} is typing`}</div>
					</div>
				)}
			</div>

			{/* ticket */}
			{lay.ticket && (
				<>
					<div style={{...panel(lay.ticket, 'transparent'), borderStyle: 'dashed', opacity: tk ? 0 : 0.7}} />
					{tk && (
						<div style={panel(lay.ticket, c.card, {borderColor: chipLine, transform: `translateY(${(1 - tkP) * (lay.ticket.h + GAP + 24)}px)`, opacity: tkP})}>
							<div data-data style={{position: 'absolute', left: 14, top: 8, fontSize: SMALL_PX, fontWeight: 800, letterSpacing: 0.6, lineHeight: '22px', color: c.muted, whiteSpace: 'nowrap'}}>{tk.kind}</div>
							{tk.key && <div data-data style={{position: 'absolute', left: 170, top: 8, fontSize: SMALL_PX, fontWeight: 800, lineHeight: '22px', color: c.fg, whiteSpace: 'nowrap'}}>{tk.key}</div>}
							<div data-label style={{position: 'absolute', left: 14, top: 36, fontSize: LABEL_PX, fontWeight: 500, lineHeight: '34px', color: c.fg, whiteSpace: 'nowrap', clipPath: `inset(0 ${(1 - typed) * 100}% 0 0)`}}>{tk.title}</div>
							{typed < 1 && <div style={{position: 'absolute', left: 14, top: 40, width: 2, height: 26, background: c.fg, opacity: Math.floor(frame / 6) % 2 ? 0.2 : 0.9, transform: `translateX(${Math.round(typed * measure(tk.title, 'ui', LABEL_PX, 500))}px)`}} />}
							<div data-data style={{position: 'absolute', right: 14, top: 8, fontSize: SMALL_PX + 1, fontWeight: 800, lineHeight: '24px', color: chipFg, background: chipBg, border: `2px solid ${chipLine}`, borderRadius: 8, padding: '0 10px', whiteSpace: 'nowrap', opacity: chipIn, transform: `scale(${chipPulse})`, transformOrigin: '100% 50%'}}>{tk.status}</div>
						</div>
					)}
				</>
			)}
		</div>
	);
};
