import React, {useMemo} from 'react';
import type {Action} from '../schema';
import {easeInOut, lin, prog, Rect} from '../theme';
import {Panel} from './Panel';
import {useStyle} from '../styles/context';
import {alpha} from '../styles';
import {Draw, rLine, seedOf, Svg} from '../sketch';
import {
	BANNER_H,
	DbTable,
	FLY,
	hlFor,
	placementAt,
	prepareDb,
	rowTop,
	nativeHeight,
	T_COLS,
	T_HEAD,
	T_ROW,
	DATA_PX,
	HEAD_PX,
	colWidths,
	nativeWidth,
	tagColor,
} from '../dbmodel';
import {fitText} from '../text';

type Prepared = import('../dbmodel').Prepared;

const TableView: React.FC<{
	t: DbTable;
	pre: Prepared;
	frame: number;
	origin: Rect;
}> = ({t, pre, frame, origin}) => {
	const st = useStyle();
	const k = st.tokens;
	const pl = placementAt(pre, t.id, Math.max(frame, t.born));
	if (!pl || frame < t.born) return null;
	// the table is drawn scaled: size the title so it still reads >= 22 px on screen
	const minTitle = Math.min(34, Math.ceil(22 / Math.max(0.2, pl.scale)));
	const h = nativeHeight(t);
	const accent = tagColor(t.tag);
	const stroke = accent && t.kind !== 'replica' ? accent : k.ink;
	const erase = t.layoutOut !== undefined && frame >= t.layoutOut;
	if (t.died !== undefined && frame >= t.died) return null;
	const draw = erase ? 1 - lin(frame, t.layoutOut!, 8) : prog(frame, t.born, 20);
	const born = prog(frame, t.born, 14);
	const seed = seedOf(t.id);
	const T_W = nativeWidth(t);
	const colWs = colWidths(t);
	const pop = 0.94 + 0.06 * born;

	return (
		<div
			data-table={t.id}
			style={{
				position: 'absolute',
				left: pl.x - origin.x,
				top: pl.y - origin.y,
				width: T_W,
				height: h,
				transformOrigin: '0 0',
				transform: `scale(${pl.scale * pop})`,
			}}
		>
			<Svg w={T_W} h={h}>
				<Panel w={T_W} h={h} seed={seed} p={Math.min(1, draw)} hatch={false} inset={2} roughness={1.0} stroke={stroke} width={3} />
				<Draw paths={rLine(10, T_HEAD + (t.sub ? 18 : 0) + T_COLS - 2, T_W - 10, T_HEAD + (t.sub ? 18 : 0) + T_COLS - 2, seed + 1, {roughness: 0.8})} p={draw} color={k.faint} width={1.6} />
			</Svg>
			<div
			data-label
			style={{
			position: 'absolute',
			left: 14,
			top: 8,
			maxWidth: T_W - 28 - (t.badge ? 70 : 0),
			...st.font.hand,
					fontSize: fitText(t.title, 'hand', T_W - 28 - (t.badge ? 70 : 0), 30, 28, minTitle, 1.1).size,
					lineHeight: 1.1,
					color: k.ink,
					whiteSpace: 'nowrap',
					opacity: draw,
				}}
			>
				{t.title}
			</div>
			{t.badge && (
				<div
				data-data
				style={{
				position: 'absolute',
				right: 12,
				top: 10,
				padding: '1px 8px',
				border: `2px solid ${t.badge === 'primary' ? k.accent : k.muted}`,
				borderRadius: Math.min(6, st.skin.panel.radius),
				...st.font.hand,
				fontWeight: Math.min(st.font.hand.fontWeight, 500),
				fontSize: 17,
				color: t.badge === 'primary' ? k.accentText : k.muted,
						opacity: draw,
					}}
				>
					{t.badge}
				</div>
			)}
			{t.sub && (
				<div
					style={{
						position: 'absolute',
						left: 14,
						top: 36,
						...st.font.mono,
						fontSize: 15,
						color: k.muted,
						opacity: draw,
					}}
				>
					{t.sub}
				</div>
			)}
			<div
				style={{
					position: 'absolute',
					left: 12,
					top: T_HEAD + (t.sub ? 18 : 0),
					height: T_COLS - 4,
					display: 'flex',
					opacity: draw,
				}}
			>
				{t.cols.map((c, i) => (
					<div
						key={i}
						style={{
							width: colWs[i],
							paddingLeft: 6,
							...st.font.ui,
							fontSize: HEAD_PX,
							fontWeight: 600,
							letterSpacing: 0.6,
							textTransform: 'uppercase',
							color: k.muted,
							lineHeight: `${T_COLS - 4}px`,
							overflow: 'hidden',
							whiteSpace: 'nowrap',
						}}
					>
						{c}
					</div>
				))}
			</div>
			{t.rows.map((r, i) => {
				if (frame < r.born) return null;
				if (r.goneAt !== undefined && frame >= r.goneAt) return null;
				const top = rowTop(t, i);
				let dx = 0;
				let dy = 0;
				let op = 1;
				if (r.from) {
					const src = pre.model.tables.find((x) => x.id === r.from!.table)!;
					const sp = placementAt(pre, src.id, r.born - 1) ?? placementAt(pre, src.id, r.born);
					const dp = placementAt(pre, t.id, frame);
					if (sp && dp) {
						const e = easeInOut(lin(frame, r.born, FLY));
						const sx = sp.x;
						const sy = sp.y + rowTop(src, r.from.row) * sp.scale;
						const ddx = dp.x;
						const ddy = dp.y + top * dp.scale;
						dx = ((sx - ddx) * (1 - e)) / dp.scale;
						dy = ((sy - ddy) * (1 - e)) / dp.scale;
						// travelling copy is drawn at source scale
					}
					op = Math.min(1, lin(frame, r.born, 4) * 1.5 + 0.2);
				} else {
					const e = prog(frame, r.born, 12);
					dx = (1 - e) * (r.stagger ? 26 : 60);
					op = Math.min(1, e * 1.6);
				}
				const flash = r.flash ? 1 - lin(frame, r.born + 6, 40) : 0;
				const tagC = tagColor(r.tag);
				const hl = hlFor(pre, t.id, i, frame);
				const travelling = r.from ? lin(frame, r.born, FLY) < 1 : false;
				return (
					<div
						key={i}
						data-row={i}
						data-hl={hl ?? ''}
						style={{
							position: 'absolute',
							left: 12 + dx,
							top: top + dy,
							width: T_W - 24,
							height: T_ROW - 4,
							display: 'flex',
							alignItems: 'center',
							opacity: op,
							zIndex: travelling ? 5 : 1,
							background: hl === 'now' ? alpha(k.accent, 0.34) : hl === 'past' ? alpha(k.accent, 0.14) : travelling ? k.card : flash > 0 ? alpha(k.accent, 0.22 * flash) : tagC ? `${tagC}1c` : 'transparent',
							borderLeft: hl ? `6px solid ${k.accent}` : tagC ? `5px solid ${tagC}` : '5px solid transparent',
							fontWeight: hl === 'now' ? 700 : 400,
							borderBottom: `1.5px dashed ${st.stroke === 'rough' ? k.fill : k.faint}`,
							outline: travelling ? `2px solid ${tagC ?? k.accent}` : undefined,
							borderRadius: Math.min(3, st.skin.panel.radius),
						}}
					>
						{r.cells.map((c, ci) => (
							<div
							key={ci}
							data-cell
							data-fit
							style={{
								width: colWs[ci],
								boxSizing: 'border-box',
								paddingLeft: 5,
								...st.font.mono,
								fontSize: DATA_PX,
								color: k.ink,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
							}}
							>
								{c}
							</div>
						))}
					</div>
				);
			})}
		</div>
	);
};

export const DBStage: React.FC<{
	events: {frame: number; action: Action}[];
	rect: Rect;
	frame: number;
	dim?: boolean;
}> = ({events, rect, frame, dim}) => {
	const pre = useMemo(() => prepareDb(events, rect), [events, rect]);
	return (
		<div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity: dim ? 0.5 : 1}}>
			{pre.model.tables.map((t) => (
				<TableView key={t.id} t={t} pre={pre} frame={frame} origin={rect} />
			))}
			<JoinBanner pre={pre} frame={frame} rect={rect} />
		</div>
	);
};

const JoinBanner: React.FC<{pre: Prepared; frame: number; rect: Rect}> = ({pre, frame, rect}) => {
	const st = useStyle();
	const k = st.tokens;
const joins = pre.model.joins;
	let cur = -1;
	joins.forEach((j, i) => {
		if (j.frame <= frame) cur = i;
	});
	if (cur < 0) return null;
	const j = joins[cur];
	const t0 = j.frame;
	const p = prog(frame, t0, 8);
	const w = rect.w;
	const f = fitText(j.label, 'hand', w - 150, BANNER_H - 18, 34, 22, 1.1, undefined, 2);
	return (
		<div style={{position: 'absolute', left: 0, top: rect.h - BANNER_H, width: w, height: BANNER_H, opacity: p, transform: `translateY(${(1 - p) * 10}px)`}}>
			<Svg w={w} h={BANNER_H}>
				<Panel w={w} h={BANNER_H} seed={seedOf('banner')} p={prog(frame, t0, 10)} hatch={false} inset={3} roughness={1.0} stroke={k.accent} width={3} />
			</Svg>
			<div style={{position: 'absolute', left: 16, top: 0, height: BANNER_H, display: 'flex', alignItems: 'center', gap: 14, width: w - 32}}>
				<div data-label style={{...st.font.hand, fontSize: 28, color: k.onAccent, background: k.accent, borderRadius: Math.min(10, st.skin.panel.radius), padding: '2px 12px', whiteSpace: 'nowrap'}}>
					{j.i + 1}/{j.n}
				</div>
				<div data-label style={{...st.font.hand, fontSize: f.size, lineHeight: `${f.lineH}px`, color: k.ink}}>
					{f.lines.map((l, i) => (
						<div key={i}>{l}</div>
					))}
				</div>
			</div>
		</div>
	);
};
