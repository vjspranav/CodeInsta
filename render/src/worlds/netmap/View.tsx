import React from 'react';
import {easeOut, lin} from '../../theme';
import {Draw, rLine, seedOf, Svg} from '../../sketch';
import {Panel} from '../../components/Panel';
import {alpha, mixHexRaw} from '../../styles';
import type {Style} from '../../styles';
import type {WorldViewProps} from '../types';
import {legible} from '../kit';
import {CODE_PX, CROWN_H, CROWN_W, LABEL_PX, LOG_HEAD_H, NetScene, netScene, NODE_H, PKT_H, PKT_W, TItem, TITLE_H} from './layout';
import {CROWN_F, CROWN_LOST_F, GHOST_F, ARRIVE_F, NetState, NodeKind, NodeS, PULSE_F} from './model';

/** The colours of the network map in a style, every text colour legible on its background. */
export const netColors = (st: Style) => {
	const t = st.tokens;
	const bg = t.card;
	const accentTone = legible(t.accentText, bg);
	return {
		bg,
		ink: t.ink,
		muted: t.muted,
		rule: t.faint,
		ok: legible(t.ok, bg),
		warn: accentTone,
		err: legible(t.like, bg),
		/** non-text strokes and fills */
		accent: t.accent,
		likeLine: t.like,
		okLine: t.ok,
		leaderBg: t.accentTint,
		downBg: t.soft,
		trackBg: t.fill,
		packet: {req: t.accent, ack: t.ok, vote: t.tags[2 % t.tags.length], beat: t.tags[4 % t.tags.length], err: t.like},
		log: {
			bg: t.termBg,
			fg: t.termFg,
			dim: t.termDim,
			err: legible(t.like, t.termBg),
			warn: legible(t.termPrompt, t.termBg),
			ok: legible(t.ok, t.termBg),
			tag: legible(t.termPrompt, t.termBg),
			rule: t.faint,
		},
	};
};
export type NetColors = ReturnType<typeof netColors>;

export const toneText = (c: NetColors, tone?: string): string => (tone === 'ok' ? c.ok : tone === 'warn' ? c.warn : tone === 'err' ? c.err : c.ink);
const toneStrokeOf = (c: NetColors, tone?: string): string => (tone === 'ok' ? c.okLine : tone === 'warn' ? c.accent : tone === 'err' ? c.likeLine : c.rule);

const easeOutBack = (t: number) => {
	const x = Math.min(1, Math.max(0, t)) - 1;
	return 1 + 2.70158 * x * x * x + 1.70158 * x * x;
};

const Icon: React.FC<{kind: NodeKind; color: string}> = ({kind, color}) => {
	const p = {fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
	return (
		<svg width={28} height={28} viewBox="0 0 26 26">
			{kind === 'client' && (
				<>
					<rect x={3} y={4} width={20} height={13} rx={1.5} {...p} />
					<path d="M9 22 H17 M13 17 V22" {...p} />
				</>
			)}
			{kind === 'router' && (
				<>
					<rect x={2} y={13} width={22} height={8} rx={1.5} {...p} />
					<path d="M7 13 V5 M19 13 V5 M6 17 H8 M11 17 H13" {...p} />
				</>
			)}
			{kind === 'server' && (
				<>
					<rect x={3} y={3} width={20} height={6} rx={1.5} {...p} />
					<rect x={3} y={10} width={20} height={6} rx={1.5} {...p} />
					<rect x={3} y={17} width={20} height={6} rx={1.5} {...p} />
					<path d="M7 6 H8 M7 13 H8 M7 20 H8" {...p} />
				</>
			)}
			{(kind === 'replica' || kind === 'db') && (
				<>
					<ellipse cx={13} cy={6} rx={9} ry={3} {...p} />
					<path d="M4 6 V19 A9 3 0 0 0 22 19 V6 M4 12.5 A9 3 0 0 0 22 12.5" {...p} />
				</>
			)}
			{kind === 'node' && (
				<>
					<circle cx={13} cy={13} r={9} {...p} />
					<circle cx={13} cy={13} r={2.5} {...p} />
				</>
			)}
		</svg>
	);
};

const chipStyle = (st: Style, c: NetColors, it: TItem, mono: React.CSSProperties, extra: React.CSSProperties = {}): React.CSSProperties => ({
	position: 'absolute',
	left: it.box.x,
	top: it.box.y,
	width: it.box.w,
	height: it.box.h,
	boxSizing: 'border-box',
	background: c.bg,
	border: `1.5px solid ${toneStrokeOf(c, it.tone)}`,
	borderRadius: st.stroke === 'clean' ? Math.min(st.skin.panel.radius, 10) : st.stroke === 'rough' ? 5 : 0,
	textAlign: 'center',
	...mono,
	fontSize: it.size,
	lineHeight: `${it.box.h - 3}px`,
	whiteSpace: 'pre',
	color: toneText(c, it.tone),
	...extra,
});

export const NetMapView: React.FC<WorldViewProps<NetState>> = ({state: s, rect, frame, start, style: st, dim}) => {
	if (!s.visible) return null;
	const t = st.tokens;
	const c = netColors(st);
	const sc: NetScene = netScene(s, rect);
	const mono = {...st.font.mono, fontVariantLigatures: 'none' as const};
	const fade = easeOut(lin(frame, start, 8));
	const frameP = easeOut(lin(frame, start, 12));
	const item = (id: string) => sc.items.find((x) => x.id === id);
	const stat = item('status');
	const radius = st.stroke === 'clean' ? Math.min(st.skin.panel.radius, 14) : 0;
	const pulseRound = st.stroke === 'clean' ? Math.min(st.skin.panel.radius, 12) : 3;
	const flash = (a: number | null, n: number) => (a === null ? 0 : Math.max(0, 1 - a / n));

	return (
		<div data-shell data-world="netmap" style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity: (dim ? 0.42 : 1) * (0.2 + 0.8 * fade)}}>
			{/* the console window */}
			<Svg w={rect.w} h={rect.h}>
				<Panel w={rect.w} h={rect.h} seed={seedOf('netmap')} p={frameP} hatch={false} bg={c.bg} inset={3} />
				<line x1={8} x2={rect.w - 8} y1={TITLE_H} y2={TITLE_H} stroke={c.rule} strokeWidth={1.5} opacity={frameP} />
				{sc.halos.map((h, i) => {
					const col = t.tags[i % t.tags.length];
					const p = Math.min(1, (s.partition?.age ?? 0) / 10);
					return <rect key={i} x={h.rect.x} y={h.rect.y} width={h.rect.w} height={h.rect.h} rx={pulseRound + 6} fill={alpha(col, 0.1)} stroke={col} strokeWidth={2} strokeDasharray="10 7" opacity={p} />;
				})}
			</Svg>

			{/* title bar */}
			<div data-code style={{position: 'absolute', left: item('title')!.box.x, top: 0, height: TITLE_H, lineHeight: `${TITLE_H}px`, ...mono, fontSize: CODE_PX, color: c.ink, whiteSpace: 'pre'}}>
				{s.title}
			</div>
			{stat && (
				<div data-code style={{position: 'absolute', left: stat.box.x, top: 0, height: TITLE_H, lineHeight: `${TITLE_H}px`, ...mono, fontSize: CODE_PX, color: toneText(c, stat.tone), whiteSpace: 'pre', fontWeight: stat.tone === 'err' ? 700 : 400}}>
					{stat.text}
				</div>
			)}

			{/* links */}
			<Svg w={rect.w} h={rect.h}>
				{sc.links.map((lg) => {
					const cut = lg.l.cut;
					const healed = !cut && lg.l.age < 16;
					const col = cut ? c.likeLine : healed ? c.okLine : c.muted;
					const w = cut ? 3 + 3 * Math.max(0, 1 - lg.l.age / 10) : healed ? 3 + 3 * (1 - lg.l.age / 16) : 3;
					return <Draw key={lg.l.key} paths={rLine(lg.p1.x, lg.p1.y, lg.p2.x, lg.p2.y, seedOf(lg.l.key), {strokeWidth: 3, roughness: 0.7, bowing: 0.5})} p={lg.l.appear} color={col} width={w} dashed={cut} />;
				})}
			</Svg>
			{sc.items
				.filter((it) => it.kind === 'link')
				.map((it) => (
					<div key={it.id} data-code style={chipStyle(st, c, it, mono)}>
						{it.text}
					</div>
				))}

			{/* nodes */}
			{sc.nodes.map((g) => (
				<NodeView key={g.n.id} g={g} sc={sc} frame={frame} st={st} c={c} mono={mono} pulseRound={pulseRound} radius={radius} flash={flash} />
			))}

			{/* HUD counters and stat chips */}
			{sc.items
				.filter((it) => it.kind === 'hud' || it.kind === 'stat')
				.map((it) => {
					const st2 = s.stats.find((x) => `stat.${x.id}` === it.id);
					const f = flash(st2 ? st2.age : null, 12);
					return (
						<div key={it.id} data-code style={chipStyle(st, c, it, mono, {background: f > 0 ? mixHexRaw(c.bg, c.accent, 0.3 * f) : c.bg})}>
							{it.text}
						</div>
					);
				})}

			{/* packets */}
			{sc.packets.map((pg) => {
				const p = pg.p;
				const col = c.packet[p.tone];
				const shake = p.status === 'dropped' ? (p.age % 2 === 0 ? -2 : 2) : 0;
				const sc2 = p.status === 'arrived' ? 1 - 0.6 * (p.age / ARRIVE_F) : Math.min(1, 0.45 + 0.55 * (p.age / 4));
				const op = p.status === 'dropped' ? 1 - p.age / GHOST_F : p.status === 'arrived' ? 1 - p.age / ARRIVE_F : 1;
				return (
					<svg key={p.id} width={PKT_W} height={PKT_H} viewBox={`0 0 ${PKT_W} ${PKT_H}`} style={{position: 'absolute', left: pg.at.x - PKT_W / 2 + shake, top: pg.at.y - PKT_H / 2, overflow: 'visible', opacity: op, transform: `scale(${sc2})`}}>
						<rect x={1} y={1} width={PKT_W - 2} height={PKT_H - 2} rx={st.stroke === 'mono' ? 0 : 4} fill={col} stroke={t.ink} strokeWidth={1.8} />
						<path d={`M3 4 L${PKT_W / 2} ${PKT_H / 2 + 1} L${PKT_W - 3} 4`} fill="none" stroke={t.ink} strokeWidth={1.4} opacity={0.65} />
					</svg>
				);
			})}
			{sc.packets
				.filter((pg) => pg.label)
				.map((pg) => {
					const it = pg.label!;
					return (
						<div key={it.id} data-code style={chipStyle(st, c, it, mono, {border: `2px solid ${c.packet[pg.p.tone]}`, color: c.ink, opacity: pg.p.status === 'dropped' ? 1 - pg.p.age / GHOST_F : 1})}>
							{it.text}
						</div>
					);
				})}

			{/* bursts: a red X where a packet was lost, a spray at a router that overflows */}
			{sc.bursts.map((bg, i) => {
				const a = bg.b.age;
				const grow = easeOut(Math.min(1, a / 6));
				const op = a < 30 ? 1 : Math.max(0, 1 - (a - 30) / 20);
				return (
					<React.Fragment key={i}>
						<svg width={30} height={30} viewBox="0 0 30 30" style={{position: 'absolute', left: bg.at.x - 15, top: bg.at.y - 15, overflow: 'visible', opacity: op, transform: `scale(${0.4 + 0.8 * grow})`}}>
							<path d="M6 6 L24 24 M24 6 L6 24" stroke={c.likeLine} strokeWidth={5} strokeLinecap="round" fill="none" />
						</svg>
						{bg.b.node &&
							a < 24 &&
							[0, 1, 2].map((k) => {
								const u = a / 24;
								const x = bg.at.x + (k - 0.2) * 22 * easeOut(u) + 6;
								const y = bg.at.y - 14 - 26 * easeOut(u) + 70 * u * u;
								return (
									<svg key={k} width={18} height={12} viewBox="0 0 18 12" style={{position: 'absolute', left: x - 9, top: y - 6, opacity: 1 - u, transform: `rotate(${(k - 1) * 40 * u}deg)`}}>
										<rect x={1} y={1} width={16} height={10} rx={2} fill={c.packet.err} stroke={t.ink} strokeWidth={1.2} />
									</svg>
								);
							})}
					</React.Fragment>
				);
			})}
			{sc.bursts
				.filter((bg) => bg.label)
				.map((bg) => {
					const it = bg.label!;
					return (
						<div key={it.id} data-code style={chipStyle(st, c, it, mono, {opacity: bg.b.age < 24 ? 1 : Math.max(0, 1 - (bg.b.age - 24) / 12), border: `2px solid ${c.likeLine}`, color: c.err, fontWeight: 700})}>
							{it.text}
						</div>
					);
				})}

			{/* log panel */}
			{sc.log && sc.items.some((it) => it.kind === 'logHead') && (
				<div style={{position: 'absolute', left: sc.log.x, top: sc.log.y, width: sc.log.w, height: sc.log.h, background: c.log.bg, borderRadius: radius, border: `1.5px solid ${c.log.rule}`, boxSizing: 'border-box', overflow: 'hidden'}}>
					<div style={{position: 'absolute', left: 0, right: 0, top: LOG_HEAD_H - 1, height: 1, background: c.log.rule}} />
				</div>
			)}
			{sc.items
				.filter((it) => it.kind === 'logHead')
				.map((it) => (
					<div key={it.id} data-code style={{position: 'absolute', left: it.box.x, top: it.box.y, height: it.box.h, lineHeight: `${it.box.h}px`, ...mono, fontSize: it.size, color: c.log.dim, whiteSpace: 'pre'}}>
						{it.text}
					</div>
				))}
			{sc.items
				.filter((it) => it.kind === 'log')
				.map((it, i) => {
					const row = s.logs[i];
					const col = it.tone === 'err' ? c.log.err : it.tone === 'warn' ? c.log.warn : it.tone === 'ok' ? c.log.ok : it.tone === 'dim' ? c.log.dim : c.log.fg;
					const f = row ? flash(row.age, 14) : 0;
					return (
						<div key={it.id} data-code style={{position: 'absolute', left: sc.log!.x + 4, top: it.box.y, width: sc.log!.w - 8, height: it.box.h, background: f > 0 ? alpha(c.accent, 0.22 * f) : 'transparent', borderRadius: 3}}>
							<div style={{position: 'absolute', left: 6, top: 0, lineHeight: `${it.box.h}px`, ...mono, fontSize: it.size, whiteSpace: 'pre', color: col}}>
								<span style={{color: c.log.tag}}>{it.tag}</span> <span>{it.body}</span>
							</div>
						</div>
					);
				})}
		</div>
	);
};

const NodeView: React.FC<{
	g: NetScene['nodes'][number];
	sc: NetScene;
	frame: number;
	st: Style;
	c: NetColors;
	mono: React.CSSProperties;
	pulseRound: number;
	radius: number;
	flash: (a: number | null, n: number) => number;
}> = ({g, sc, st, c, mono, pulseRound, flash}) => {
	const n: NodeS = g.n;
	const t = st.tokens;
	const {box} = g;
	const leader = n.crown;
	const stroke = n.down ? c.muted : leader ? c.accent : n.role === 'candidate' ? c.warn : t.ink;
	const bg = n.down ? c.downBg : leader ? c.leaderBg : c.bg;
	const full = n.buffer?.full ? flash(n.buffer.overflowAge, 18) : 0;
	const lift = (1 - n.appear) * 8;
	const own = (kind: string) => sc.items.filter((it) => it.id.endsWith(`.${n.id}`) && it.kind === kind);
	const bufFrac = n.buffer ? Math.min(1, n.buffer.level / n.buffer.cap) : 0;
	const bufCol = bufFrac >= 0.95 ? c.likeLine : bufFrac >= 0.65 ? c.accent : c.okLine;
	const crownY = n.crown ? -(1 - easeOutBack(n.crownAge / CROWN_F)) * 34 : n.crownLostAge !== null ? (n.crownLostAge / CROWN_LOST_F) * 26 : 0;
	const crownRot = n.crown ? 0 : n.crownLostAge !== null ? (n.crownLostAge / CROWN_LOST_F) * 35 : 0;
	const crownOp = n.crown ? Math.min(1, n.crownAge / 4) : n.crownLostAge !== null ? 1 - n.crownLostAge / CROWN_LOST_F : 0;
	const tm = n.timer;
	const ringCol = tm ? (tm.expired ? c.likeLine : tm.frac > 0.5 ? c.okLine : tm.frac > 0.25 ? c.accent : c.likeLine) : c.okLine;
	const badge = own('badge')[0];
	const timerLabel = own('timer')[0];
	const buf = own('buf')[0];
	const chipFor = (it: TItem) => <div key={it.id} data-code style={chipStyle(st, c, it, mono, {opacity: n.appear, fontWeight: it.kind === 'badge' && n.role === 'leader' ? 700 : 400})}>{it.text}</div>;
	return (
		<>
			<div style={{position: 'absolute', left: box.x, top: box.y + lift, width: box.w, height: box.h, opacity: n.appear * (n.down ? 0.6 : 1)}}>
				<Svg w={box.w} h={box.h}>
					<Panel w={box.w} h={box.h} seed={seedOf(n.id)} p={n.appear} hatch={false} bg={bg} inset={2} stroke={stroke} width={leader ? 3.2 : undefined} />
				</Svg>
				{/* the router buffer fills the box from below */}
				{n.buffer && (
					<div style={{position: 'absolute', left: 4, right: 4, bottom: 4, height: Math.max(0, (box.h - 8) * bufFrac), background: alpha(bufCol, 0.3), borderRadius: pulseRound}} />
				)}
				<div style={{position: 'absolute', left: 10, top: (NODE_H - 28) / 2}}>
					<Icon kind={n.kind} color={n.down ? c.muted : t.ink} />
				</div>
				<div data-label style={{position: 'absolute', left: 44, right: 8, top: 0, height: NODE_H, lineHeight: `${NODE_H}px`, textAlign: 'center', ...st.font.hand, fontSize: LABEL_PX, color: c.ink, whiteSpace: 'pre'}}>
					{n.label}
				</div>
				{n.down && (
					<svg width={box.w} height={box.h} style={{position: 'absolute', left: 0, top: 0}}>
						<path d={`M8 8 L${box.w - 8} ${box.h - 8} M${box.w - 8} 8 L8 ${box.h - 8}`} stroke={c.likeLine} strokeWidth={3} opacity={0.7} strokeLinecap="round" />
					</svg>
				)}
				{/* election timer ring */}
				{tm && (
					<svg width={box.w + 16} height={box.h + 16} style={{position: 'absolute', left: -8, top: -8, overflow: 'visible'}}>
						<rect x={2} y={2} width={box.w + 12} height={box.h + 12} rx={pulseRound + 5} fill="none" stroke={c.rule} strokeWidth={2} opacity={0.5} />
						<rect
							x={2}
							y={2}
							width={box.w + 12}
							height={box.h + 12}
							rx={pulseRound + 5}
							fill="none"
							stroke={ringCol}
							strokeWidth={tm.expired ? 5 : 4}
							strokeLinecap="round"
							pathLength={100}
							strokeDasharray={tm.expired ? '100 0' : `${Math.max(0.5, tm.frac * 100)} 100`}
							opacity={tm.expired ? (Math.floor(tm.expiredAge / 3) % 2 === 0 ? 1 : 0.35) : 1}
						/>
					</svg>
				)}
				{/* a receive ping, and the red flash of a full buffer */}
				{n.pulseAge !== null && (
					<div style={{position: 'absolute', left: -4, top: -4, right: -4, bottom: -4, border: `${n.pulseSmall ? 2 : 3}px solid ${c.okLine}`, borderRadius: pulseRound + 3, opacity: (1 - n.pulseAge / PULSE_F) * (n.pulseSmall ? 0.5 : 0.9), transform: `scale(${1 + 0.1 * (n.pulseAge / PULSE_F)})`}} />
				)}
				{full > 0 && <div style={{position: 'absolute', left: -3, top: -3, right: -3, bottom: -3, border: `4px solid ${c.likeLine}`, borderRadius: pulseRound + 2, opacity: full}} />}
			</div>
			{/* the crown */}
			{crownOp > 0 && (
				<svg width={CROWN_W} height={CROWN_H} viewBox="0 0 34 24" style={{position: 'absolute', left: g.cx - CROWN_W / 2, top: box.y - CROWN_H - 4 + crownY, overflow: 'visible', opacity: crownOp, transform: `rotate(${crownRot}deg)`}}>
					<path d="M2 20 L5 6 L12 14 L17 2 L22 14 L29 6 L32 20 Z" fill={c.accent} stroke={t.ink} strokeWidth={2} strokeLinejoin="round" />
					<path d="M2 23 H32" stroke={t.ink} strokeWidth={2} strokeLinecap="round" />
				</svg>
			)}
			{badge && chipFor(badge)}
			{timerLabel && chipFor(timerLabel)}
			{buf && g.bar && (
				<>
					<div style={{position: 'absolute', left: g.bar.x, top: g.bar.y, width: g.bar.w, height: g.bar.h, background: c.trackBg, border: `1.5px solid ${n.buffer?.full ? c.likeLine : c.rule}`, boxSizing: 'border-box', borderRadius: 3, overflow: 'hidden'}}>
						<div style={{width: `${bufFrac * 100}%`, height: '100%', background: bufCol}} />
					</div>
					{chipFor(buf)}
				</>
			)}
		</>
	);
};
