import React from 'react';
import {easeOut, lin} from '../../theme';
import {alpha, mixHexRaw} from '../../styles';
import type {Style} from '../../styles';
import type {WorldViewProps} from '../types';
import {legible} from '../kit';
import {
	CARD_GAP,
	FAULT_FRAMES,
	LEFT_W,
	LOOKUP_RESULT,
	MID_Y,
	PAD,
	TITLE_H,
	memLayout,
	spaceIndex,
} from './model';
import type {CellL, Txt, MemState} from './model';

/** The colours of the memory view in a style; every text colour is legible on the backgrounds it is drawn on. */
export const memColors = (st: Style) => {
	const t = st.tokens;
	const bg = t.card;
	const lit = mixHexRaw(bg, t.accent, 0.24);
	const okBg = mixHexRaw(bg, t.ok, 0.28);
	const badBg = mixHexRaw(bg, t.like, 0.22);
	const rowBg = mixHexRaw(bg, t.fill, 0.4);
	const filled = mixHexRaw(bg, t.fill, 0.75);
	const slice = [0, 1, 2, 3, 4].map((i) => mixHexRaw(bg, t.tags[i % t.tags.length], 0.3));
	return {
		bg,
		lit,
		okBg,
		badBg,
		rowBg,
		filled,
		slice,
		line: t.faint,
		ink: t.ink,
		accent: t.accent,
		text: legible(t.ink, bg),
		dim: legible(t.muted, bg),
		ok: legible(t.ok, bg),
		bad: legible(t.like, bg),
		hot: legible(t.accentText, bg),
	};
};
export type MemColors = ReturnType<typeof memColors>;

/** every (text colour, background) pair the view draws: used by the colour test */
export const memColorPairs = (c: MemColors): [string, string, string][] => {
	const out: [string, string, string][] = [];
	const bgs: [string, string][] = [['card', c.bg], ['lit', c.lit], ['ok', c.okBg], ['bad', c.badBg], ['row', c.rowBg], ['filled', c.filled], ...c.slice.map((s, i) => [`slice${i}`, s] as [string, string])];
	for (const [bn, b] of bgs) for (const [fn, f] of [['text', c.text], ['dim', c.dim], ['ok', c.ok], ['bad', c.bad], ['hot', c.hot]] as const) out.push([`${fn} on ${bn}`, onBg(f, b), b]);
	return out;
};

/** a text colour lifted until it reads on `bg` */
export const onBg = (fg: string, bg: string) => legible(fg, bg);

const pat = (st: Style, c: MemColors, base: string): React.CSSProperties => {
	switch (st.skin.panel.hatch) {
		case 'lines':
			return {backgroundColor: base, backgroundImage: `repeating-linear-gradient(135deg, ${alpha(c.line, 0.34)} 0 1.5px, transparent 1.5px 8px)`};
		case 'rough':
			return {backgroundColor: base, backgroundImage: `repeating-linear-gradient(120deg, ${alpha(c.line, 0.3)} 0 1.4px, transparent 1.4px 10px)`};
		case 'dots':
			return {backgroundColor: base, backgroundImage: `radial-gradient(${alpha(c.line, 0.5)} 1.3px, transparent 1.6px)`, backgroundSize: '7px 7px'};
		default:
			return {backgroundColor: base};
	}
};

export const MemgridView: React.FC<WorldViewProps<MemState>> = ({state: s, rect, frame, start, style: st, dim}) => {
	if (!s.visible) return null;
	const t = st.tokens;
	const c = memColors(st);
	const sk = st.skin;
	const lay = memLayout(s, rect);
	const mono = {...st.font.mono, fontVariantLigatures: 'none' as const};
	const d = easeOut(lin(frame, start, 14));
	const radius = sk.panel.radius;
	const rr = Math.min(radius, 10);
	const rough = st.stroke === 'rough';
	const brad = rough ? '3px 8px 4px 7px' : rr;
	const bw = rough ? 2 : sk.panel.outline ? 1.5 : 1;
	const border = sk.panel.double ? `6px double ${c.line}` : rough ? `2px solid ${t.ink}` : sk.panel.outline ? `1.5px solid ${c.line}` : 'none';
	const fade = (at: number, dur: number) => (at < 0 ? 0 : 1 - lin(frame, at, dur));
	const popOf = (at: number, dur = 10) => (at < 0 ? 1 : 1 + 0.06 * (1 - lin(frame, at, dur)));
	const dimmed = dim ? 0.42 : 1;

	const Tx: React.FC<{t: Txt; color: string; bold?: boolean; shown?: number; opacity?: number; right?: boolean; ls?: number}> = ({t: x, color, bold, shown, opacity = 1, right, ls}) => (
		<div
			data-code
			style={{position: 'absolute', left: x.x, top: x.y, width: right ? x.w : undefined, textAlign: right ? 'right' : 'left', height: x.h, lineHeight: `${x.h}px`, ...mono, fontSize: x.fs, fontWeight: bold ? 700 : mono.fontWeight, color, whiteSpace: 'pre', opacity, letterSpacing: ls}}
		>
			{shown === undefined ? x.text : x.text.slice(0, shown)}
		</div>
	);
	const Box: React.FC<{x: number; y: number; w: number; h: number; bg?: string; stroke?: string; sw?: number; dash?: boolean; opacity?: number; scale?: number; fillPat?: boolean}> = ({x, y, w, h, bg, stroke, sw = bw, dash, opacity = 1, scale = 1, fillPat}) => (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width: w,
				height: h,
				boxSizing: 'border-box',
				borderRadius: brad,
				border: stroke ? `${sw}px ${dash ? 'dashed' : 'solid'} ${stroke}` : 'none',
				...(fillPat && bg ? pat(st, c, bg) : {background: bg ?? 'transparent'}),
				opacity,
				transform: scale === 1 ? undefined : `scale(${scale})`,
			}}
		/>
	);

	// ---- address block
	const a = lay.addr;
	const walk = s.walk;
	const lk = s.lookup;
	const curStep = walk && walk.doneAt < 0 && walk.stepAt.length ? walk.stepAt.length - 1 : -1;
	const scanning = lk && lk.result === null ? frame - lk.at : lk && lk.result ? frame - lk.at : -1;
	const typing = a.hex && a.typedP < 1;
	const offIdx = s.cfg.levels;
	const physGlow = s.phys ? fade(s.phys.at, 26) : 0;

	// ---- the fault banner
	const fl = s.fault;
	const bannerP = fl ? 1 - lin(frame, fl.at + FAULT_FRAMES - 10, 10) : 0;
	const bannerFlash = fl ? fade(fl.at, 14) : 0;
	const bannerText = fl ? (fl.kind === 'cow' ? '#PF write to read-only page' : `#PF at ${fl.cr2}`) : '';

	// ---- cow copy arrow
	const copyArrow = (() => {
		if (!fl || fl.kind !== 'cow' || fl.from === fl.to) return null;
		const dst = lay.cells[fl.to];
		const src = lay.cells[fl.from];
		if (!dst || !src || dst.cell.state === 'empty') return null;
		const p = lin(frame, dst.cell.from, Math.max(1, dst.cell.to - dst.cell.from));
		if (dst.cell.state !== 'alloc') {
			const k = fade(dst.cell.at, 12);
			return k > 0 ? {src, dst, p: 1, op: k} : null;
		}
		return {src, dst, p, op: 1};
	})();

	const tone = s.status.tone;
	const toneColor = tone === 'ok' ? c.ok : tone === 'bad' ? c.bad : tone === 'warn' ? c.hot : c.dim;
	const toneBg = tone === 'ok' ? c.okBg : tone === 'bad' ? c.badBg : tone === 'warn' ? c.lit : c.rowBg;

	return (
		<div data-shell data-world="memgrid" style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity: dimmed, transform: `scale(${0.96 + 0.04 * d})`, transformOrigin: '50% 40%'}}>
			<div style={{position: 'absolute', inset: 0, background: c.bg, borderRadius: radius, overflow: 'hidden', border, boxSizing: 'border-box', clipPath: `inset(0 0 ${(1 - d) * 100}% 0 round ${radius}px)`}}>
				{/* title bar */}
				<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: TITLE_H + 14, borderBottom: `1px solid ${c.line}`, background: c.rowBg, opacity: 0.7}} />
				{sk.term.chrome === 'dots' && (
					<div style={{position: 'absolute', left: PAD, top: 19, display: 'flex', gap: 8}}>
						{[t.accent, t.faint, t.muted].map((col, i) => (
							<div key={i} style={{width: 13, height: 13, borderRadius: 7, background: col}} />
						))}
					</div>
				)}
				<Tx t={lay.title} color={c.text} bold />
				<Tx t={lay.titleRight} color={c.dim} />

				{/* address */}
				{a.tag && <Tx t={a.tag} color={c.dim} />}
				{a.hex && (
					<>
						<Tx t={a.hex} color={c.text} shown={a.hexShown} bold />
						{typing && <div style={{position: 'absolute', left: a.hex.x + a.hexShown * (a.hex.w / a.hex.text.length) + 1, top: a.hex.y + 5, width: a.hex.w / a.hex.text.length, height: 22, background: c.text, opacity: 0.85}} />}
					</>
				)}
				{a.slices.map((sl) => {
					const isOff = sl.i === offIdx;
					const lookupHot = lk && !isOff && frame - lk.at < LOOKUP_RESULT + 6 ? 1 - lin(frame, lk.at + LOOKUP_RESULT - 4, 10) : 0;
					const stepHot = !isOff && curStep === sl.i ? 1 : 0;
					const offHot = isOff && s.phys ? physGlow : 0;
					const hot = Math.max(lookupHot * 0.8, stepHot, offHot);
					const sp = a.splitP;
					const tint = c.slice[sl.i % c.slice.length];
					return (
						<React.Fragment key={sl.i}>
							{sp > 0 && <Box x={sl.x} y={sl.y} w={sl.w} h={sl.h} bg={tint} stroke={hot > 0 ? c.accent : c.line} sw={hot > 0 ? bw + 1.5 : bw} opacity={sp} />}
							{hot > 0 && sp > 0 && <Box x={sl.x - 3} y={sl.y - 3} w={sl.w + 6} h={sl.h + 6} stroke={c.accent} sw={2} opacity={hot * 0.7} />}
							<Tx t={sl.bits} color={c.text} ls={sl.bits.ls} opacity={0.25 + 0.75 * a.typedP} />
							{sp > 0 && <Tx t={sl.name} color={c.dim} opacity={sp} />}
							{sp > 0 && <Tx t={sl.val} color={stepHot || hot > 0.5 ? c.hot : c.text} bold opacity={sp} />}
						</React.Fragment>
					);
				})}
				{a.brackets.map((b, i) => (
					<React.Fragment key={i}>
						<div style={{position: 'absolute', left: b.x, top: b.y - 4, width: i === 0 ? b.w : b.w - 2, height: 6, borderBottom: `2px solid ${c.line}`, borderLeft: `2px solid ${c.line}`, borderRight: `2px solid ${c.line}`, opacity: a.splitP, boxSizing: 'border-box'}} />
						<Tx t={{...b, y: b.y + 4}} color={c.dim} opacity={a.splitP} />
					</React.Fragment>
				))}

				{/* middle left: page walk or page tables */}
				<Tx t={lay.midLeftHead} color={c.dim} bold />
				{lay.midLeftHeadRight && <Tx t={lay.midLeftHeadRight} color={c.dim} />}
				{lay.cards.map((cd, i) => {
					const age = cd.lit ? frame - cd.litAt : 999;
					const isCur = i === curStep;
					const failed = cd.entry ? !cd.entry.present : false;
					const bg = !cd.lit ? c.rowBg : failed ? c.badBg : isCur ? c.lit : c.okBg;
					const strokeC = !cd.lit ? c.line : failed ? c.bad : isCur ? c.accent : c.ok;
					const col = onBg(!cd.lit ? c.dim : failed ? c.bad : c.text, bg);
					const connLit = i > 0 && lay.cards[i - 1].lit && cd.lit;
					return (
						<React.Fragment key={i}>
							{i > 0 && (
								<svg style={{position: 'absolute', left: cd.x + cd.w / 2 - 6, top: cd.y - CARD_GAP - 1, width: 12, height: CARD_GAP + 2, overflow: 'visible'}}>
									<path d={`M 6 0 V ${CARD_GAP - 1} M 2 ${CARD_GAP - 5} L 6 ${CARD_GAP} L 10 ${CARD_GAP - 5}`} stroke={connLit ? c.accent : c.line} strokeWidth={2} fill="none" />
								</svg>
							)}
							<Box x={cd.x} y={cd.y} w={cd.w} h={cd.h} bg={bg} stroke={strokeC} sw={isCur ? bw + 1 : bw} scale={cd.lit ? popOf(cd.litAt, 9) - 0.03 : 1} opacity={cd.lit ? 1 : 0.8} />
							<Tx t={cd.text} color={col} bold={cd.lit} opacity={cd.lit ? 1 : 0.85} />
							{cd.ram && <Tx t={{...cd.ram, y: cd.ram.y}} color={onBg(c.hot, bg)} bold opacity={age < 4 ? 0.5 : 1} />}
						</React.Fragment>
					);
				})}
				{lay.spaces.map((sp) => {
					const sc = s.spaces.find((x) => x.id === sp.id)!;
					const col = t.tags[spaceIndex(s, sp.id) % t.tags.length];
					const born = sc.at >= 0 ? easeOut(lin(frame, sc.at, 14)) : 1;
					const execFlash = fade(sc.execAt, 30);
					return (
						<div key={sp.id} style={{opacity: (sp.dim ? 0.5 : 1) * (0.2 + 0.8 * born), transform: `translateX(${(1 - born) * -30}px)`}}>
							<Box x={sp.x} y={sp.y} w={sp.w} h={sp.h} stroke={col} sw={bw + 0.5} bg={mixHexRaw(c.bg, col, 0.06)} />
							<div style={{position: 'absolute', left: sp.x + 10, top: sp.y + 6, width: 9, height: 9, background: col, borderRadius: rough ? 1 : 2}} />
							<Tx t={{...sp.head, x: sp.head.x + 14}} color={execFlash > 0 ? c.hot : c.dim} bold />
							{sp.rows.map((r, ri) => {
								const p = r.pte!;
								const flash = fade(p.at, 26);
								const isCurrent = s.addr && s.addr.va && lay.addr.sp?.vpn === p.vpn && (s.addr.proc === sp.id || sc.id === s.spaces.find((q) => q.id === s.addr!.proc)?.shares);
								const bgRow = !p.present ? c.badBg : p.flags === 'cow' ? c.lit : c.rowBg;
								const bgNow = flash > 0 ? mixHexRaw(bgRow, c.accent, 0.3 * flash) : bgRow;
								const rc = onBg(!p.present ? c.bad : p.flags === 'cow' ? c.hot : c.text, bgNow);
								return (
									<React.Fragment key={ri}>
										<Box x={r.x + 4} y={r.y + 1} w={r.w - 8} h={r.h - 2} bg={bgNow} stroke={isCurrent ? c.accent : undefined} sw={2} />
										{r.segs.map((sg, k) => (
											<Tx key={k} t={sg} color={k === 2 && p.present && p.flags === 'cow' ? onBg(c.hot, bgNow) : rc} bold={k === 1} />
										))}
										{r.ram && <Tx t={r.ram} color={onBg(c.hot, bgNow)} bold />}
									</React.Fragment>
								);
							})}
						</div>
					);
				})}

				{/* fault banner over the left header */}
				{fl && bannerP > 0 && (
					<div
						data-code
						style={{
							position: 'absolute',
							left: PAD,
							top: MID_Y - 2,
							width: LEFT_W,
							height: 26,
							lineHeight: '26px',
							boxSizing: 'border-box',
							padding: '0 10px',
							borderRadius: brad,
							background: mixHexRaw(c.badBg, t.like, 0.25 * bannerFlash),
							border: `${bw}px solid ${c.bad}`,
							...mono,
							fontSize: 16,
							fontWeight: 700,
							color: onBg(c.bad, c.badBg),
							whiteSpace: 'pre',
							opacity: Math.min(1, bannerP * 1.5),
						}}
					>
						{bannerText}
					</div>
				)}

				{/* TLB */}
				<Tx t={lay.tlbHead} color={c.dim} bold />
				{lay.tlbBadge && lk && (
					<Tx t={lay.tlbBadge} color={lk.result === 'hit' ? c.ok : c.bad} bold opacity={0.4 + 0.6 * lin(frame, lk.resultAt, 6)} />
				)}
				{lay.tlb.map((r) => {
					const isHit = !!lk && lk.result === 'hit' && lk.slot === r.i;
					const missFlash = lk && lk.result === 'miss' ? fade(lk.resultAt, 22) : 0;
					const scan = scanning >= 0 && lk && lk.result === null ? (Math.abs(frame - lk.at - r.i * 2) < 3 ? 1 : 0) : lk && frame - lk.at < LOOKUP_RESULT ? (Math.abs(frame - lk.at - r.i * 2) < 3 ? 1 : 0) : 0;
					const fillFlash = r.row ? fade(r.row.at, 26) : 0;
					const flushFlash = fade(s.flushAt, 14);
					const bg = isHit ? c.okBg : scan ? c.lit : missFlash > 0 ? mixHexRaw(c.rowBg, t.like, 0.28 * missFlash) : fillFlash > 0 ? mixHexRaw(c.rowBg, t.accent, 0.35 * fillFlash) : c.rowBg;
					const col = r.row ? onBg(isHit ? c.ok : c.text, bg) : onBg(c.dim, bg);
					return (
						<React.Fragment key={r.i}>
							<Box x={r.x} y={r.y + 1} w={r.w} h={r.h - 2} bg={bg} stroke={isHit ? c.ok : undefined} sw={2} opacity={r.row ? 1 : 0.8 - 0.3 * flushFlash} scale={isHit ? popOf(lk!.resultAt, 8) : 1} />
							{r.segs.map((sg, k) => (
								<Tx key={k} t={sg} color={k === r.segs.length - 2 && r.row ? onBg(c.hot, bg) : col} bold={isHit} opacity={r.row ? 1 : 0.8} />
							))}
						</React.Fragment>
					);
				})}
				<Tx t={lay.physLabel} color={c.dim} />
				{lay.physVal && s.phys && <Tx t={lay.physVal} color={c.ok} bold opacity={0.3 + 0.7 * lin(frame, s.phys.at, 8)} />}
				{s.fillAt >= 0 && s.fillSlot >= 0 && frame - s.fillAt < 18 && (
					<Box x={lay.tlb[s.fillSlot].x - 3} y={lay.tlb[s.fillSlot].y - 2} w={lay.tlb[s.fillSlot].w + 6} h={lay.tlb[s.fillSlot].h + 2} stroke={c.accent} sw={2} opacity={fade(s.fillAt, 18)} />
				)}

				{/* frames */}
				<Tx t={lay.framesHead} color={c.dim} bold />
				<Tx t={lay.framesHeadRight} color={c.dim} />
				{lay.cells.map((cl: CellL) => {
					const cell = cl.cell;
					const flash = fade(cell.at, 26);
					const hot = fade(cell.hot, 34);
					const isEmpty = cell.state === 'empty';
					const alloc = cell.state === 'alloc';
					const bgBase = isEmpty ? 'transparent' : alloc ? c.lit : hot > 0 ? c.okBg : c.filled;
					const flashBg = flash > 0 && !isEmpty && !alloc ? mixHexRaw(c.filled, c.accent, 0.35 * flash) : bgBase;
					const strokeC = alloc ? c.accent : hot > 0 ? c.ok : flash > 0 && !isEmpty ? c.accent : c.line;
					const readBg = isEmpty ? c.bg : alloc ? c.lit : hot > 0 ? c.okBg : flashBg;
					const fillP = alloc ? lin(frame, cell.from, Math.max(1, cell.to - cell.from)) : 0;
					const cow = cl.badge && /^cow/.test(cl.badge.text);
					return (
						<React.Fragment key={cl.i}>
							<Box x={cl.x} y={cl.y} w={cl.w} h={cl.h} bg={flashBg} fillPat={cell.state === 'filled' && hot <= 0 && flash <= 0.05} stroke={strokeC} sw={alloc || hot > 0 ? bw + 1 : bw} dash={isEmpty} opacity={isEmpty ? 0.85 : 1} scale={cell.at >= 0 && !isEmpty ? popOf(cell.at, 10) - 0.03 : 1} />
							{alloc && (
								<>
									<div style={{position: 'absolute', left: cl.x + 4, top: cl.y + cl.h - 9, width: cl.w - 8, height: 5, background: alpha(c.line, 0.5), borderRadius: 2}} />
									<div style={{position: 'absolute', left: cl.x + 4, top: cl.y + cl.h - 9, width: (cl.w - 8) * fillP, height: 5, background: c.accent, borderRadius: 2}} />
								</>
							)}
							<Tx t={cl.id} color={onBg(c.dim, readBg)} bold />
							{cl.badge && <Tx t={cl.badge} color={onBg(cow ? c.hot : c.dim, readBg)} bold={!!cow} />}
							<Tx t={cl.label} color={onBg(isEmpty ? c.dim : alloc ? c.hot : c.text, readBg)} bold={!isEmpty && !alloc} opacity={isEmpty ? 0.8 : 1} />
							{s.spaces.length > 1 &&
								!isEmpty &&
								cell.owners.map((o, k) => <div key={o} style={{position: 'absolute', left: cl.x + 42 + k * 13, top: cl.y + 10, width: 9, height: 9, background: t.tags[spaceIndex(s, o) % t.tags.length], borderRadius: rough ? 1 : 2}} />)}
						</React.Fragment>
					);
				})}
				{copyArrow && (
					<svg style={{position: 'absolute', left: 0, top: 0, width: lay.W, height: lay.H, overflow: 'visible', opacity: copyArrow.op, pointerEvents: 'none'}}>
						{(() => {
							const x1 = copyArrow.src.x + copyArrow.src.w / 2;
							const y1 = copyArrow.src.y + copyArrow.src.h / 2;
							const x2 = copyArrow.dst.x + copyArrow.dst.w / 2;
							const y2 = copyArrow.dst.y + copyArrow.dst.h / 2;
							const p = Math.min(1, copyArrow.p * 1.15);
							const ex = x1 + (x2 - x1) * p;
							const ey = y1 + (y2 - y1) * p;
							const ang = Math.atan2(y2 - y1, x2 - x1);
							const hx = (k: number) => ex - 11 * Math.cos(ang + k);
							const hy = (k: number) => ey - 11 * Math.sin(ang + k);
							return (
								<>
									<path d={`M ${x1} ${y1} L ${ex} ${ey}`} stroke={c.accent} strokeWidth={3.5} strokeDasharray="9 6" strokeDashoffset={-frame * 1.2} fill="none" />
									<path d={`M ${hx(0.5)} ${hy(0.5)} L ${ex} ${ey} L ${hx(-0.5)} ${hy(-0.5)}`} stroke={c.accent} strokeWidth={3.5} fill="none" />
								</>
							);
						})()}
					</svg>
				)}

				{/* counters and status */}
				{lay.chips.map((ch) => {
					const flash = fade(s.bump[ch.key], 22);
					const tint = ch.key === 'hit' ? t.ok : ch.key === 'miss' || ch.key === 'fault' ? t.like : t.accent;
					const bg = flash > 0 ? mixHexRaw(c.rowBg, tint, 0.42 * flash) : c.rowBg;
					const col = ch.key === 'hit' ? c.ok : ch.key === 'miss' || ch.key === 'fault' ? c.bad : ch.key === 'cow' ? c.hot : c.text;
					return (
						<React.Fragment key={ch.key}>
							<Box x={ch.x} y={ch.y} w={ch.w} h={ch.h} bg={bg} stroke={c.line} scale={s.bump[ch.key] >= 0 ? popOf(s.bump[ch.key], 8) - 0.03 : 1} />
							<Tx t={ch.text} color={onBg(col, bg)} bold={flash > 0 || s.c[ch.key] > 0} />
						</React.Fragment>
					);
				})}
				{s.status.text && (
					<>
						<div style={{position: 'absolute', left: PAD, top: lay.status.y, width: 4, height: 22, background: toneColor, borderRadius: 2, opacity: 0.9}} />
						<Tx t={{...lay.status, x: lay.status.x + 6}} color={onBg(toneColor === c.dim ? c.text : toneColor, mixHexRaw(c.bg, toneBg, 0.4 * fade(s.status.at, 16)))} bold={fade(s.status.at, 16) > 0.2} />
					</>
				)}

				{/* blueprint corner ticks */}
				{sk.panel.ticks &&
					[
						[8, 8, 1, 1],
						[lay.W - 8, 8, -1, 1],
						[8, lay.H - 8, 1, -1],
						[lay.W - 8, lay.H - 8, -1, -1],
					].map(([cx, cy, sx, sy], i) => (
						<svg key={i} style={{position: 'absolute', left: 0, top: 0, width: lay.W, height: lay.H, pointerEvents: 'none'}}>
							<path d={`M ${cx} ${cy + sy * 10} V ${cy} H ${cx + sx * 10}`} stroke={c.accent} strokeWidth={1.6} fill="none" />
						</svg>
					))}
			</div>
		</div>
	);
};
