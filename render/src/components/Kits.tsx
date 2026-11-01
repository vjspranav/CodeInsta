import React from 'react';
import type {Item} from '../timeline';
import {clamp01, hash, lerp, lin, prog} from '../theme';
import {Draw, rLine, rPoly, rRect, Svg} from '../sketch';
import {Panel} from './Panel';
import {Shell} from './Items';
import {useStyle} from '../styles/context';
import {alpha} from '../styles';
import type {Style} from '../styles';
import {
	editorRowsAt,
	ED_GUTTER,
	ED_HEAD,
	LABEL_PX,
	packetGeom,
	packetStateAt,
	PK_TRAVEL,
	plotGeom,
	plotStateAt,
	PLOT_B,
	PLOT_L,
	seqLayout,
	seqStateAt,
	SEQ_HEAD,
	trackGeom,
	trackStateAt,
	treeLayout,
	treeStateAt,
} from '../kits';
import type {KRect} from '../kits';

type P = {item: Item; frame: number; dim?: boolean};
type Tokens = Style['tokens'];

/** Common card: the style's panel skin + the item's pop-in; children draw in the item's own pixel space. */
const Card: React.FC<{item: Item; frame: number; dim?: boolean; kind: string; bg?: string; children: (w: number, h: number, d: number) => React.ReactNode}> = ({item, frame, dim, kind, bg, children}) => (
	<Shell rect={item.rect} frame={frame} start={item.start} dim={dim}>
		{(w, h) => {
			const d = prog(frame, item.start, 14);
			return (
				<div data-kit={kind} data-kid={item.key} style={{position: 'absolute', inset: 0}}>
					<Svg w={w} h={h}>
						<Panel w={w} h={h} seed={hash(item.key)} p={d} hatch={false} inset={4} roughness={1} bg={bg} />
					</Svg>
					{children(w, h, d)}
				</div>
			);
		}}
	</Shell>
);

/** A readable label (>= 22 px) placed by rectangle. */
const Label: React.FC<{r: KRect; text: string; color: string; st: Style; size?: number; weight?: number; align?: 'left' | 'center' | 'right'; kel?: boolean; cur?: boolean; opacity?: number; bg?: string; mono?: boolean}> = ({r, text, color, st, size = LABEL_PX, weight, align = 'center', kel, cur, opacity = 1, bg, mono}) => (
	<div
		data-kel={kel ? '' : undefined}
		data-kcur={cur ? '' : undefined}
		style={{
			position: 'absolute',
			left: r.x,
			top: r.y,
			width: r.w,
			height: r.h,
			display: 'flex',
			alignItems: 'center',
			justifyContent: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
			opacity,
		}}
	>
		<span
			data-label
			style={{
				...(mono ? st.font.mono : st.font.hand),
				fontWeight: weight ?? (mono ? st.font.mono.fontWeight : st.font.hand.fontWeight),
				fontSize: size,
				lineHeight: 1.2,
				color,
				whiteSpace: 'nowrap',
				background: bg,
				padding: bg ? '0 4px' : undefined,
			}}
		>
			{text}
		</span>
	</div>
);

/** Filled + outlined box in the style's stroke mode. */
const BoxShape: React.FC<{r: KRect; seed: number; p: number; t: Tokens; fill?: string; stroke?: string; width?: number}> = ({r, seed, p, t, fill, stroke, width = 2.4}) => (
	<g>
		<rect x={r.x} y={r.y} width={r.w} height={r.h} rx={0} fill={fill ?? t.card} opacity={clamp01(p)} />
		<Draw paths={rRect(r.x, r.y, r.w, r.h, seed, {roughness: 1})} p={p} color={stroke ?? t.ink} width={width} />
	</g>
);

const Head: React.FC<{x: number; y: number; dx: number; dy: number; p: number; color: string; seed: number; st: Style; size?: number}> = ({x, y, dx, dy, p, color, seed, st, size = 18}) => {
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len;
	const uy = dy / len;
	const a = (28 * Math.PI) / 180;
	const rot = (px: number, py: number, ang: number): [number, number] => [px * Math.cos(ang) - py * Math.sin(ang), px * Math.sin(ang) + py * Math.cos(ang)];
	const l1 = rot(-ux, -uy, a);
	const l2 = rot(-ux, -uy, -a);
	const w = st.skin.arrow.width;
	return st.skin.arrow.head === 'open' ? (
		<>
			<Draw paths={rLine(x, y, x + l1[0] * size, y + l1[1] * size, seed, {roughness: 0.6})} p={p} color={color} width={w} />
			<Draw paths={rLine(x, y, x + l2[0] * size, y + l2[1] * size, seed + 1, {roughness: 0.6})} p={p} color={color} width={w} />
		</>
	) : (
		<Draw paths={rPoly([[x, y], [x + l1[0] * size, y + l1[1] * size], [x + l2[0] * size, y + l2[1] * size]], seed, {fill: color, fillStyle: 'solid'})} p={p} color={color} width={w * 0.5} />
	);
};

const R = (x: number, y: number, w: number, h: number): KRect => ({x, y, w, h});

// ------------------------------------------------------------------------------------------ seq.diagram
export const SeqDiagram: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	const sk = st.skin.arrow;
	return (
		<Card item={item} frame={frame} dim={dim} kind="seq">
			{(w, h, d) => {
				const s = seqStateAt(item, frame);
				const g = seqLayout(item, w, h);
				const seed = hash(item.key);
				const cxOf = (id: string) => g.actors.find((a) => a.id === id)?.cx ?? w / 2;
				return (
					<>
						<Svg w={w} h={h}>
							{g.actors.map((a, i) => (
								<g key={a.id}>
									<line x1={a.cx} y1={SEQ_HEAD} x2={a.cx} y2={Math.max(SEQ_HEAD + 20, g.bottom + 6)} stroke={t.faint} strokeWidth={2} strokeDasharray="7 7" opacity={d} />
									<BoxShape r={a.box} seed={seed + i} p={d} t={t} fill={t.card} />
								</g>
							))}
							{s.msgs.map((m) => {
								const y = g.rowY[m.idx];
								const x1 = cxOf(m.from);
								const x2 = cxOf(m.to);
								const cur = m.idx === s.current;
								const col = cur ? t.accent : t.ink;
								const sw = cur ? sk.width + 1.4 : sk.width;
								if (m.from === m.to) {
									return (
										<g key={m.idx}>
											<Draw paths={rLine(x1, y - 12, x1 + 40, y - 12, seed + m.idx, {roughness: 0.6})} p={m.p} color={col} width={sw} />
											<Draw paths={rLine(x1 + 40, y - 12, x1 + 40, y + 14, seed + m.idx + 40, {roughness: 0.6})} p={m.p} color={col} width={sw} />
											<Draw paths={rLine(x1 + 40, y + 14, x1 + 4, y + 14, seed + m.idx + 80, {roughness: 0.6})} p={m.p} color={col} width={sw} />
											<Head x={x1 + 4} y={y + 14} dx={-1} dy={0} p={lin(m.p, 0.7, 0.3)} color={col} seed={seed + m.idx} st={st} />
										</g>
									);
								}
								const tip = lerp(x1, x2, m.p);
								const dir = Math.sign(x2 - x1) || 1;
								return (
									<g key={m.idx}>
										<Draw paths={rLine(x1, y, x2, y, seed + m.idx, {roughness: 0.7})} p={m.p} color={col} width={sw} dashed={m.reply || sk.dash} />
										<Head x={tip - dir * 2} y={y} dx={dir} dy={0} p={m.p >= 0.98 ? 1 : 0} color={col} seed={seed + 100 + m.idx} st={st} />
										{m.p < 0.98 && <circle cx={tip} cy={y} r={7} fill={col} />}
									</g>
								);
							})}
						</Svg>
						{g.actors.map((a) => (
							<Label key={a.id} r={a.box} text={a.label} color={t.ink} st={st} kel opacity={d} />
						))}
						{s.msgs.map((m) => (
							<Label key={m.idx} r={g.labels[m.idx]} text={m.label} color={m.idx === s.current ? t.accentText : t.ink} st={st} kel cur={m.idx === s.current} opacity={lin(m.p, 0.2, 0.5)} bg={t.card} />
						))}
					</>
				);
			}}
		</Card>
	);
};

// ------------------------------------------------------------------------------------------ tree
export const TreeView: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	return (
		<Card item={item} frame={frame} dim={dim} kind="tree">
			{(w, h) => {
				const s = treeStateAt(item, frame);
				const g = treeLayout(item, w, h);
				const seed = hash(item.key);
				const onPath = new Set(s.path);
				const shown = new Map(s.nodes.map((n) => [n.id, n]));
				return (
					<>
						<Svg w={w} h={h}>
							{s.nodes.map((n, i) => {
								if (!n.parent || !shown.has(n.parent)) return null;
								const a = g.boxes.get(n.parent);
								const b = g.boxes.get(n.id);
								if (!a || !b) return null;
								const hot = onPath.has(n.id) && onPath.has(n.parent);
								const col = hot ? t.accent : t.faint;
								const wd = hot ? 4 : 2.2;
								if (g.indent) {
									// file tree: elbow from the parent's gutter to the child
									const x = a.x + 16;
									return (
										<g key={n.id}>
											<Draw paths={rLine(x, a.y + a.h, x, b.y + b.h / 2, seed + i, {roughness: 0.5})} p={n.p} color={col} width={wd} />
											<Draw paths={rLine(x, b.y + b.h / 2, b.x, b.y + b.h / 2, seed + 40 + i, {roughness: 0.5})} p={n.p} color={col} width={wd} />
										</g>
									);
								}
								return <Draw key={n.id} paths={rLine(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y, seed + i, {roughness: 0.6})} p={n.p} color={col} width={wd} />;
							})}
							{s.nodes.map((n, i) => {
								const r = g.boxes.get(n.id);
								if (!r) return null;
								const cur = n.id === s.current;
								const hot = onPath.has(n.id);
								return <BoxShape key={n.id} r={r} seed={seed + 200 + i} p={n.p} t={t} fill={cur ? t.accent : hot ? t.accentTint : t.card} stroke={hot ? t.accent : t.ink} width={hot ? 3.6 : 2.4} />;
							})}
						</Svg>
						{s.nodes.map((n) => {
							const r = g.boxes.get(n.id);
							if (!r) return null;
							const cur = n.id === s.current;
							return <Label key={n.id} r={r} text={n.label} color={cur ? t.onAccent : t.ink} st={st} kel cur={cur} opacity={n.p} />;
						})}
					</>
				);
			}}
		</Card>
	);
};

// ------------------------------------------------------------------------------------------ timeline.track
const fmtT = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

export const TimelineTrack: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	return (
		<Card item={item} frame={frame} dim={dim} kind="track">
			{(w, h, d) => {
				const g = trackGeom(item, w, h);
				const s = trackStateAt(item, frame);
				const seed = hash(item.key);
				const activeSet = new Set(s.active.map((b) => b));
				const ticks = 4;
				return (
					<>
						<Svg w={w} h={h}>
							{g.lanes.map((l) => (
								<line key={l.id} x1={8} y1={l.y + l.h} x2={w - 8} y2={l.y + l.h} stroke={t.faint} strokeWidth={1.5} strokeDasharray="4 6" opacity={d} />
							))}
							<line x1={g.x0} y1={g.axisY} x2={w - 10} y2={g.axisY} stroke={t.muted} strokeWidth={2} opacity={d} />
							{Array.from({length: ticks + 1}, (_, i) => {
								const x = g.x0 + (g.W * i) / ticks;
								return <line key={i} x1={x} y1={g.axisY} x2={x} y2={g.axisY + 7} stroke={t.muted} strokeWidth={2} opacity={d} />;
							})}
							{s.blocks.map((b, i) => {
								const slide = (1 - b.p) * -46;
								const r = {...b.rect, x: b.rect.x + slide};
								const act = activeSet.has(b as never) || s.active.some((x) => x.t0 === b.t0 && x.label === b.label && x.start === b.start);
								const tone = b.tone === 'accent' ? t.accentTint : t.fill;
								return <BoxShape key={i} r={r} seed={seed + i} p={b.p} t={t} fill={act ? t.accent : tone} stroke={act ? t.accent : b.tone === 'accent' ? t.accent : t.ink} width={act ? 3.6 : 2.4} />;
							})}
							{s.playhead !== undefined && (
								<g>
									<line x1={g.X(s.playhead)} y1={4} x2={g.X(s.playhead)} y2={g.axisY + 6} stroke={t.accent} strokeWidth={4} />
									<polygon points={`${g.X(s.playhead) - 9},4 ${g.X(s.playhead) + 9},4 ${g.X(s.playhead)},18`} fill={t.accent} />
								</g>
							)}
						</Svg>
						{g.lanes.map((l) => (
							<Label key={l.id} r={R(6, l.y, g.labelW, l.h)} text={l.label} color={t.ink} st={st} kel align="left" opacity={d} />
						))}
						{s.blocks.map((b, i) => {
							const act = s.active.some((x) => x.t0 === b.t0 && x.label === b.label && x.start === b.start);
							return <Label key={i} r={{...b.rect, x: b.rect.x + (1 - b.p) * -46}} text={b.label} color={act ? t.onAccent : t.ink} st={st} kel cur={act} opacity={b.p} />;
						})}
						{[0, ticks].map((i) => (
							<div key={i} data-code style={{position: 'absolute', left: Math.min(w - 64, g.x0 + (g.W * i) / ticks - 30), top: g.axisY + 9, width: 60, textAlign: 'center', ...st.font.mono, fontSize: 16, lineHeight: '20px', color: t.muted}}>
								{fmtT(g.span[0] + ((g.span[1] - g.span[0]) * i) / ticks)}
							</div>
						))}
					</>
				);
			}}
		</Card>
	);
};

// ------------------------------------------------------------------------------------------ packet.flow
export const PacketFlow: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	return (
		<Card item={item} frame={frame} dim={dim} kind="packets">
			{(w, h, d) => {
				const g = packetGeom(item, w, h);
				const s = packetStateAt(item, frame);
				const seed = hash(item.key);
				const nx = (id: string) => g.nodes.find((n) => n.id === id)?.cx ?? w / 2;
				const stack = new Map<string, number>();
				return (
					<>
						<Svg w={w} h={h}>
							{g.nodes.slice(0, -1).map((n, i) => (
								<Draw key={n.id} paths={rLine(n.box.x + n.box.w, g.cy, g.nodes[i + 1].box.x, g.cy, seed + i, {roughness: 0.7})} p={d} color={t.faint} width={3} dashed />
							))}
							{g.nodes.map((n, i) => (
								<BoxShape key={n.id} r={n.box} seed={seed + 30 + i} p={d} t={t} fill={t.card} />
							))}
						</Svg>
						{g.nodes.map((n) => (
							<Label key={n.id} r={n.box} text={n.label} color={t.ink} st={st} kel opacity={d} />
						))}
						{s.packets.map((q) => {
							const x1 = nx(q.from);
							const x2 = nx(q.to);
							const size = 30;
							let x = lerp(x1, x2, q.pos);
							let y = g.cy - size / 2;
							const cur = q === s.current;
							let fill = t.accent;
							if (q.status === 'delivered') {
								const k = stack.get(q.to) ?? 0;
								stack.set(q.to, k + 1);
								x = x2 - size / 2 + (k % 3) * (size + 4) - (size + 4);
								y = g.cy - 34 - size - 10 - Math.floor(k / 3) * (size + 4);
								fill = t.ok;
							} else if (q.status === 'dropped') {
								y = g.cy - size / 2 + 64;
								fill = t.like;
								x = x - size / 2;
							} else x = x - size / 2;
							return (
								<div key={q.idx} data-kel="" data-kcur={cur ? '' : undefined} data-status={q.status} style={{position: 'absolute', left: x, top: y, width: size, height: size, background: fill, border: `3px solid ${t.ink}`, borderRadius: Math.min(8, st.skin.panel.radius), boxSizing: 'border-box'}}>
									{q.status === 'dropped' && (
										<svg width={size - 6} height={size - 6} viewBox="0 0 24 24" style={{position: 'absolute', left: 0, top: 0}}>
											<path d="M5 5 L19 19 M19 5 L5 19" stroke={t.onAccent === t.ink ? t.paper : t.paper} strokeWidth={3.5} />
										</svg>
									)}
								</div>
							);
						})}
						{s.current && s.current.label && <Label r={R(8, g.cy - 100, w - 16, 34)} text={`${s.current.label}${s.current.retry ? ' (retry)' : ''}${s.current.drop && s.current.status === 'dropped' ? ' lost' : ''}`} color={t.accentText} st={st} bg={t.card} />}
						<Label r={R(8, h - 64, w - 16, 40)} text={`delivered ${s.delivered} · dropped ${s.dropped}`} color={t.ink} st={st} />
					</>
				);
			}}
		</Card>
	);
};

export const PACKET_TRAVEL = PK_TRAVEL;

// ------------------------------------------------------------------------------------------ code.editor
export const CodeEditor: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	return (
		<Card item={item} frame={frame} dim={dim} kind="editor" bg={t.codeBg}>
			{(w, h, d) => {
				const {g, s, rows} = editorRowsAt(item, frame, w, h);
				const blink = Math.floor(frame / 8) % 2 === 0;
				const cw = g.fs * 0.6;
				// the cursor sits on the last visible row of the line being typed
				const curRow = rows.map((r) => r.line.idx === s.cursor?.line && r.text.length > 0).lastIndexOf(true);
				return (
					<>
						<Svg w={w} h={h}>
							<line x1={14} y1={ED_HEAD} x2={w - 14} y2={ED_HEAD} stroke={t.codeRule} strokeWidth={2} opacity={d} />
							<line x1={ED_GUTTER + 6} y1={ED_HEAD + 4} x2={ED_GUTTER + 6} y2={h - 12} stroke={t.codeRule} strokeWidth={1.5} opacity={d} />
						</Svg>
						<Label r={R(18, 4, w - 36, ED_HEAD - 8)} text={s.title || 'editor'} color={t.codeFg} st={st} mono weight={700} align="left" opacity={d} />
						{rows.map((r, i) => {
							const l = r.line;
							const y = ED_HEAD + 10 + i * g.lh;
							const cur = s.cursor?.line === l.idx;
							const bg = l.op === '+' ? alpha(t.ok, 0.28) : l.op === '-' ? alpha(t.like, 0.26) : cur ? alpha(t.accent, 0.12) : 'transparent';
							const op = l.diff ? clamp01((frame - l.t0) / 5) : 1;
							const shown = l.diff && r.first ? r.text.slice(2) : r.text;
							return (
								<div key={`${l.idx}-${r.ri}`} {...(r.first ? {'data-kel': ''} : {})} data-kcur={cur && r.first ? '' : undefined} data-op={l.op} style={{position: 'absolute', left: 8, top: y, width: w - 16, height: g.lh, background: bg, opacity: op}}>
									{r.first && (
										<div data-code style={{position: 'absolute', left: 0, top: 0, width: ED_GUTTER - 4, textAlign: 'right', ...st.font.mono, fontSize: g.fs * 0.82, lineHeight: `${g.lh}px`, color: t.termDim}}>
											{l.idx + 1}
										</div>
									)}
									<div data-code data-fit style={{position: 'absolute', left: ED_GUTTER + 14, top: 0, width: w - ED_GUTTER - 36, height: g.lh, overflow: 'hidden', whiteSpace: 'pre', ...st.font.mono, fontSize: g.fs, lineHeight: `${g.lh}px`, color: l.op === '-' ? t.like : t.codeFg, textDecoration: l.op === '-' ? 'line-through' : undefined}}>
										{l.diff && r.first && <span style={{color: l.op === '+' ? t.ok : l.op === '-' ? t.like : t.termDim}}>{(l.op === ' ' ? ' ' : l.op) + ' '}</span>}
										{shown}
										{i === curRow && blink && s.typing && <span style={{display: 'inline-block', width: cw * 0.7, height: g.fs * 1.1, background: t.accent, verticalAlign: 'text-bottom', marginLeft: 1}} />}
									</div>
								</div>
							);
						})}
					</>
				);
			}}
		</Card>
	);
};

// ------------------------------------------------------------------------------------------ chart.plot
export const ChartPlot: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	return (
		<Card item={item} frame={frame} dim={dim} kind="plot">
			{(w, h, d) => {
				const g = plotGeom(item, w, h);
				const s = plotStateAt(item, frame);
				const a = g.area;
				const ticks = 4;
				return (
					<>
						<Svg w={w} h={h}>
							<line x1={a.x} y1={a.y + a.h} x2={a.x + a.w} y2={a.y + a.h} stroke={t.muted} strokeWidth={2.4} opacity={d} />
							<line x1={a.x} y1={a.y} x2={a.x} y2={a.y + a.h} stroke={t.muted} strokeWidth={2.4} opacity={d} />
							{Array.from({length: ticks + 1}, (_, i) => (
								<g key={i} opacity={d}>
									<line x1={a.x} y1={a.y + (a.h * i) / ticks} x2={a.x + a.w} y2={a.y + (a.h * i) / ticks} stroke={t.faint} strokeWidth={1} strokeDasharray="3 8" />
								</g>
							))}
							{s.series.map((se, si) => {
								const col = t.tags[si % t.tags.length];
								const pts = se.visible.map((q) => [g.X(q.x), g.Y(q.y)] as [number, number]);
								const nxt = g.series[si].points[se.visible.length];
								if (s.kind !== 'scatter' && pts.length) {
									const tail = nxt ? [lerp(pts[pts.length - 1][0], g.X(nxt.x), se.grow), lerp(pts[pts.length - 1][1], g.Y(nxt.y), se.grow)] : undefined;
									const all = tail ? [...pts, tail as [number, number]] : pts;
									return (
										<g key={si}>
											<path d={`M ${all.map((p) => p.join(' ')).join(' L ')}`} fill="none" stroke={col} strokeWidth={4.4} strokeLinejoin="round" strokeLinecap="round" />
										</g>
									);
								}
								return null;
							})}
							{s.series.flatMap((se, si) =>
								se.visible.map((q, k) => {
									const head = se === s.series.find((x) => x.head) && k === se.visible.length - 1 && si === s.series.findIndex((x) => x.head);
									const col = t.tags[si % t.tags.length];
									const pop = prog(frame, g.series[si].points[k].t0, 6);
									return <circle key={`${si}-${k}`} data-kel="" data-kcur={head ? '' : undefined} cx={g.X(q.x)} cy={g.Y(q.y)} r={(head ? 9 : s.kind === 'scatter' ? 7 : 4.5) * (0.4 + 0.6 * pop)} fill={head ? t.accent : col} stroke={t.ink} strokeWidth={head ? 2.4 : 1.4} />;
								}),
							)}
						</Svg>
						{[0, ticks].map((i) => {
							const v = g.dom.y1 - ((g.dom.y1 - g.dom.y0) * i) / ticks;
							return (
								<div key={i} data-code style={{position: 'absolute', left: 4, top: a.y + (a.h * i) / ticks - 11, width: PLOT_L - 12, textAlign: 'right', ...st.font.mono, fontSize: 16, lineHeight: '22px', color: t.muted}}>
									{fmtT(v)}
								</div>
							);
						})}
						{[0, ticks].map((i) => (
							<div key={i} data-code style={{position: 'absolute', left: Math.min(w - 64, a.x + (a.w * i) / ticks - 30), top: a.y + a.h + 8, width: 60, textAlign: 'center', ...st.font.mono, fontSize: 16, lineHeight: '22px', color: t.muted}}>
								{fmtT(g.dom.x0 + ((g.dom.x1 - g.dom.x0) * i) / ticks)}
							</div>
						))}
						{g.xlabel && <Label r={R(a.x, h - PLOT_B + 30, a.w, 30)} text={g.xlabel} color={t.ink} st={st} opacity={d} />}
						{g.ylabel && <Label r={R(10, 6, w - 20, 32)} text={g.ylabel} color={t.ink} st={st} align="left" opacity={d} />}
						{s.series.map((se, si) =>
							se.head ? <Label key={si} r={R(Math.min(w - 230, Math.max(a.x + 6, g.X(se.head.x) - 200)), Math.max(a.y + 4, g.Y(se.head.y) - 50), 220, 34)} text={`${se.name} ${Math.round(se.head.y * 100) / 100}`} color={t.accentText} st={st} bg={t.card} align="left" /> : null,
						)}
					</>
				);
			}}
		</Card>
	);
};

export const KIT_VIEWS: Record<string, React.FC<P>> = {
	seq: SeqDiagram,
	tree: TreeView,
	track: TimelineTrack,
	packets: PacketFlow,
	editor: CodeEditor,
	plot: ChartPlot,
};

