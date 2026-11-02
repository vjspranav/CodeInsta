import React from 'react';
import {easeOut, lerp, lin, prog} from '../../theme';
import {alpha, bestOn, contrast, luminance, mixHexRaw} from '../../styles';
import type {Style} from '../../styles';
import type {WorldViewProps} from '../types';
import {legible} from '../kit';
import {
	CON_FS,
	CON_LH,
	CTL_H,
	DbgState,
	DbgVar,
	FLASH_FRAMES,
	MOVE_FRAMES,
	PANEL_FS,
	PANEL_HEAD,
	PANEL_LH,
	TITLE_H,
	codeTop,
	dbgLayout,
	tokensOf,
	Ctl,
	Tone,
} from './model';
import type {Cls} from './syntax';

/** `fg` moved toward white (dark `base`) or black (light `base`) just far enough to reach 4.5:1 on every background in `bgs`. */
const lift = (fg: string, bgs: string[], base: string): string => {
	const target = luminance(base) < 0.4 ? '#ffffff' : '#000000';
	for (let i = 0; i <= 20; i++) {
		const c = i === 0 ? fg : mixHexRaw(fg, target, i / 20);
		if (bgs.every((b) => contrast(c, b) >= 4.5)) return c;
	}
	return target;
};

/** The colours of the debugger in a style. Every text colour is lifted to 4.5:1 on every background it can sit on. */
export const dbgColors = (st: Style) => {
	const t = st.tokens;
	const bg = t.codeBg;
	const fg = t.codeFg;
	const panel = mixHexRaw(bg, fg, 0.07);
	const bar = mixHexRaw(bg, fg, 0.11);
	const band = mixHexRaw(bg, t.accent, 0.2);
	const bandHit = mixHexRaw(bg, t.accent, 0.42);
	const crash = mixHexRaw(bg, t.like, 0.28);
	const bad = mixHexRaw(panel, t.like, 0.22);
	const flash = mixHexRaw(panel, t.accent, 0.4);
	const edit = mixHexRaw(bg, t.ok, 0.3);
	const bgs = [bg, panel, bar, band, bandHit, crash, bad, flash, edit];
	const ens = (c: string) => lift(c, bgs, bg);
	const tb = t.termBg;
	const conBgs = [tb, mixHexRaw(tb, t.termFg, 0.08)];
	const ensCon = (c: string) => lift(c, conBgs, tb);
	return {
		bg,
		fg: ens(fg),
		panel,
		bar,
		band,
		bandHit,
		crash,
		bad,
		flash,
		edit,
		rule: t.codeRule,
		dim: ens(t.muted),
		accent: ens(t.accent),
		err: ens(t.like),
		ok: ens(t.ok),
		warn: ens(t.termPrompt),
		// source colouring
		syn: {kw: ens(t.accent), type: ens(mixHexRaw(t.accent, fg, 0.45)), str: ens(t.ok), num: ens(t.termPrompt), com: ens(t.muted), pre: ens(t.muted), fn: ens(fg), id: ens(fg), op: ens(mixHexRaw(fg, bg, 0.25))} as Record<Cls, string>,
		// status pill
		pillStep: {bg: t.accent, fg: legible(bestOn(t.accent, '#ffffff', '#000000'), t.accent)},
		pillCrash: {bg: t.like, fg: legible(bestOn(t.like, '#ffffff', '#000000'), t.like)},
		pillQuiet: {bg: bar, fg: ens(t.muted)},
		// console (a dark terminal in every style)
		con: {
			bg: tb,
			fg: ensCon(t.termFg),
			dim: ensCon(t.termDim),
			prompt: ensCon(t.termPrompt),
			err: ensCon(t.like),
			ok: ensCon(t.ok),
			warn: ensCon(t.termPrompt),
			bar: conBgs[1],
		},
	};
};
export type DbgColors = ReturnType<typeof dbgColors>;

const toneColor = (c: DbgColors['con'], tone: Tone) => (tone === 'err' ? c.err : tone === 'warn' ? c.warn : tone === 'ok' ? c.ok : tone === 'dim' ? c.dim : c.fg);

const Icon: React.FC<{kind: Ctl | 'pause'; color: string}> = ({kind, color}) => {
	const common = {fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
	return (
		<svg width={24} height={24} viewBox="0 0 24 24">
			{kind === 'continue' && (
				<>
					<path d="M7 5 L19 12 L7 19 Z" {...common} fill={color} />
					<path d="M3.5 5 V19" {...common} />
				</>
			)}
			{kind === 'pause' && <path d="M8 5 V19 M16 5 V19" {...common} />}
			{kind === 'over' && (
				<>
					<path d="M3.5 13 A8.5 8.5 0 0 1 20.5 13" {...common} />
					<path d="M17 9.5 L20.5 13 L24 9.5" {...common} transform="translate(-2 0)" />
					<circle cx="12" cy="19" r="2.2" fill={color} />
				</>
			)}
			{kind === 'into' && (
				<>
					<path d="M12 3 V13" {...common} />
					<path d="M7.5 9 L12 13.5 L16.5 9" {...common} />
					<circle cx="12" cy="19" r="2.2" fill={color} />
				</>
			)}
			{kind === 'out' && (
				<>
					<path d="M12 14 V4" {...common} />
					<path d="M7.5 8.5 L12 4 L16.5 8.5" {...common} />
					<circle cx="12" cy="19" r="2.2" fill={color} />
				</>
			)}
		</svg>
	);
};

export const DebuggerView: React.FC<WorldViewProps<DbgState>> = ({state: s, rect, frame, start, style: st, dim}) => {
	if (!s.visible) return null;
	const t = st.tokens;
	const c = dbgColors(st);
	const sk = st.skin;
	const lay = dbgLayout(s, rect);
	const mono = {...st.font.mono, fontVariantLigatures: 'none' as const};
	const d = easeOut(lin(frame, start, 14));
	const radius = sk.term.radius;
	const border = sk.panel.double ? `6px double ${t.termDim}` : st.stroke === 'rough' ? `2px solid ${t.ink}` : sk.panel.outline ? `1.5px solid ${t.faint}` : 'none';
	const blinkOn = Math.floor(frame / 9) % 2 === 0;
	const running = s.status === 'running';
	const crashed = s.status === 'crashed';
	const cur = s.cur;
	const W = rect.w;

	// ---- source scroll: paged, eased between the old and the new page
	const total = Math.max(1, s.code.length);
	const topNow = codeTop(cur ? cur.line : null, s.first, total, lay.cap);
	let topVis = topNow;
	if (cur && cur.prev !== null) {
		const topPrev = codeTop(cur.prev, s.first, total, lay.cap);
		topVis = lerp(topPrev, topNow, easeOut(lin(frame, cur.movedAt, MOVE_FRAMES + 4)));
	}
	// a marked line may move the page a little so that it is in view too
	if (s.mark.line !== null) topVis = lerp(topVis, lay.top, easeOut(lin(frame, s.mark.at, 8)));
	const rowY = (i: number) => lay.code.y + 4 + (i - topVis) * lay.lh;
	// the stepping highlight slides from the old line to the new one
	let bandY: number | null = null;
	if (cur) {
		const to = rowY(cur.line - s.first);
		bandY = cur.prev !== null ? lerp(rowY(cur.prev - s.first), to, easeOut(lin(frame, cur.movedAt, MOVE_FRAMES))) : to;
	}
	const hitP = cur ? 1 - lin(frame, cur.movedAt, FLASH_FRAMES) : 0;
	const bandBg = crashed ? c.crash : mixHexRaw(c.band, c.bandHit, cur && cur.reason !== 'step' ? hitP : 0);
	const firstRow = Math.max(0, Math.floor(topVis) - 1);
	const lastRow = Math.min(s.code.length - 1, Math.ceil(topVis) + lay.cap);
	const toks = tokensOf(s.code, s.lang);
	const pill = crashed ? c.pillCrash : s.status === 'paused' ? c.pillStep : c.pillQuiet;
	const pillIn = prog(frame, s.statusAt, 9);
	const shake = crashed ? Math.sin((frame - s.statusAt) * 1.7) * 5 * (1 - lin(frame, s.statusAt, 14)) : 0;
	const nameCol = c.accent;

	const ctlKinds: (Ctl | 'pause')[] = ['continue', 'over', 'into', 'out'];
	const press = (k: Ctl | 'pause') => (s.ctl && s.ctl.kind === k ? 1 - lin(frame, s.ctl.at, 12) : 0);

	const row = (v: DbgVar, i: number) => {
		const y = lay.vars.y + PANEL_HEAD + i * PANEL_LH;
		const fl = 1 - lin(frame, v.changedAt, FLASH_FRAMES);
		const born = prog(frame, v.addedAt, 8);
		const bad = v.tone === 'bad';
		const ok = v.tone === 'ok';
		const bg = bad ? mixHexRaw(c.bad, c.flash, fl * 0.7) : mixHexRaw(c.panel, c.flash, fl);
		const marked = s.mark.name === v.name;
		const valCol = bad ? c.err : ok ? c.ok : c.fg;
		return (
			<div key={`v.${v.name}`} style={{position: 'absolute', left: 6, top: y, width: lay.vars.w - 12, height: PANEL_LH, background: fl > 0.01 || bad ? bg : 'transparent', borderRadius: 4, opacity: born, transform: `translateX(${(1 - born) * -10}px)`}}>
				{(bad || ok) && <div style={{position: 'absolute', left: 0, top: 3, width: 4, height: PANEL_LH - 6, borderRadius: 2, background: bad ? c.err : c.ok}} />}
				<div data-code style={{position: 'absolute', left: 10, top: 0, ...mono, fontSize: PANEL_FS, lineHeight: `${PANEL_LH}px`, whiteSpace: 'pre', color: valCol, fontWeight: bad ? 700 : 400}}>
					<span style={{color: bad ? c.err : nameCol}}>{v.name}</span>
					<span style={{color: c.dim, fontWeight: 400}}>{' = '}</span>
					<span>{v.value}</span>
				</div>
				{marked && <Ring color={c.accent} frame={frame} at={s.mark.at} w={lay.vars.w - 12} h={PANEL_LH} />}
			</div>
		);
	};

	return (
		<div data-shell data-world="debugger" style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity: dim ? 0.42 : 1, transform: `scale(${0.96 + 0.04 * d})`, transformOrigin: '50% 40%'}}>
			<div style={{position: 'absolute', inset: 0, background: c.bg, borderRadius: radius, overflow: 'hidden', border, boxSizing: 'border-box', clipPath: `inset(0 0 ${(1 - d) * 100}% 0 round ${radius}px)`}}>
				{/* title bar: window dots, the debugger, the file and line */}
				<div style={{position: 'absolute', left: 0, top: 0, width: W, height: TITLE_H, background: c.bar, borderBottom: `1px solid ${c.rule}`, boxSizing: 'border-box'}}>
					{sk.term.chrome === 'dots' && (
						<div style={{position: 'absolute', left: 14, top: 10, display: 'flex', gap: 8}}>
							{[t.accent, t.faint, t.muted].map((col, i) => (
								<div key={i} style={{width: 13, height: 13, borderRadius: 7, background: col}} />
							))}
						</div>
					)}
					<div data-code style={{position: 'absolute', left: sk.term.chrome === 'dots' ? 80 : 14, top: 0, ...mono, fontSize: 16, lineHeight: `${TITLE_H}px`, color: c.dim, whiteSpace: 'pre'}}>{s.title}</div>
					<div data-code style={{position: 'absolute', right: 14, top: 0, ...mono, fontSize: 16, lineHeight: `${TITLE_H}px`, color: c.fg, whiteSpace: 'pre'}}>{s.cur ? `${s.file}:${s.cur.line}` : s.file}</div>
				</div>

				{/* debug controls and status */}
				<div style={{position: 'absolute', left: 0, top: TITLE_H, width: W, height: CTL_H, background: c.panel, borderBottom: `1px solid ${c.rule}`, boxSizing: 'border-box'}}>
					{ctlKinds.map((k, i) => {
						const pr = press(k);
						const live = k === 'continue' && running;
						const dis = running && k !== 'continue';
						return (
							<div key={k} style={{position: 'absolute', left: 12 + i * 42, top: 6, width: 36, height: 34, borderRadius: 7, background: pr > 0 ? c.pillStep.bg : live ? alpha(t.accent, 0.25) : c.bar, border: live ? `2px solid ${c.accent}` : 'none', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 - 0.1 * pr})`, opacity: dis ? 0.4 : 1}}>
								<Icon kind={live ? 'pause' : k} color={pr > 0 ? c.pillStep.fg : k === 'continue' ? c.ok : c.fg} />
							</div>
						);
					})}
					<div
						data-code
						style={{
							position: 'absolute',
							right: 12,
							top: 7,
							height: 32,
							padding: '0 14px',
							...mono,
							fontSize: 17,
							fontWeight: 700,
							lineHeight: '32px',
							whiteSpace: 'pre',
							borderRadius: 7,
							color: running ? c.ok : pill.fg,
							background: running ? 'transparent' : pill.bg,
							border: running ? `2px solid ${c.ok}` : 'none',
							boxSizing: 'border-box',
							transform: `translateX(${shake}px) scale(${0.8 + 0.2 * pillIn})`,
							transformOrigin: '100% 50%',
						}}
					>
						{running ? `${['|', '/', '-', '\\'][Math.floor(frame / 3) % 4]} ${s.pill}` : s.pill}
					</div>
				</div>

				{/* source pane */}
				<div style={{position: 'absolute', left: 0, top: lay.code.y, width: W, height: lay.code.h, overflow: 'hidden', background: c.bg}}>
					<div style={{position: 'absolute', left: 0, top: 0, width: lay.textX - 8, height: lay.code.h, background: c.panel}} />
				</div>
				<div style={{position: 'absolute', left: 0, top: lay.code.y, width: W, height: lay.code.h, overflow: 'hidden'}}>
					{/* stepping highlight */}
					{cur && bandY !== null && (
						<>
							<div style={{position: 'absolute', left: 0, top: bandY - lay.code.y, width: W, height: lay.lh, background: bandBg, borderTop: crashed ? `2px solid ${c.err}` : 'none', borderBottom: crashed ? `2px solid ${c.err}` : 'none', boxSizing: 'border-box'}} />
							<div style={{position: 'absolute', left: 0, top: bandY - lay.code.y, width: crashed ? 6 + 4 * hitP : 4, height: lay.lh, background: crashed ? c.err : c.accent}} />
							{!s.breakpoints.some((b) => b.line === cur.line) && <div style={{position: 'absolute', left: 8, top: bandY - lay.code.y + lay.lh / 2 - 7, width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: `11px solid ${crashed ? c.err : c.accent}`, transform: `translateX(${(1 - prog(frame, cur.movedAt, MOVE_FRAMES)) * -8}px)`}} />}
						</>
					)}
					{/* rows */}
					{s.code.slice(firstRow, lastRow + 1).map((_, k) => {
						const i = firstRow + k;
						const ln = s.first + i;
						const y = rowY(i) - lay.code.y;
						const isCur = !!cur && cur.line === ln;
						const edit = s.edits.find((e) => e.line === ln);
						const ef = edit ? 1 - lin(frame, edit.at, FLASH_FRAMES) : 0;
						const bp = s.breakpoints.find((b) => b.line === ln);
						const bpIn = bp ? prog(frame, bp.setAt, 8) : 0;
						const pulse = bp && bp.hitAt !== null ? lin(frame, bp.hitAt, FLASH_FRAMES) : 1;
						return (
							<React.Fragment key={`r.${i}`}>
								{edit && ef > 0.01 && <div style={{position: 'absolute', left: lay.textX - 6, top: y, width: W - lay.textX + 6, height: lay.lh, background: mixHexRaw(c.bg, c.edit, ef)}} />}
								{bp && (
									<>
										{pulse < 1 && <div style={{position: 'absolute', left: 6 + 7 - (7 + 16 * pulse), top: y + lay.lh / 2 - (7 + 16 * pulse), width: 14 + 32 * pulse, height: 14 + 32 * pulse, borderRadius: '50%', border: `2px solid ${c.err}`, opacity: 1 - pulse, boxSizing: 'border-box'}} />}
										<div style={{position: 'absolute', left: 6, top: y + lay.lh / 2 - 7, width: 14, height: 14, borderRadius: '50%', background: t.like, transform: `scale(${bpIn + Math.sin(bpIn * Math.PI) * 0.25})`}} />
									</>
								)}
								<div data-code style={{position: 'absolute', left: lay.numX, top: y, width: lay.numW, textAlign: 'right', ...mono, fontSize: lay.fs, lineHeight: `${lay.lh}px`, color: isCur ? c.fg : c.dim, fontWeight: isCur ? 700 : 400, whiteSpace: 'pre', opacity: running ? 0.7 : 1}}>{ln}</div>
								<div data-code style={{position: 'absolute', left: lay.textX, top: y, ...mono, fontSize: lay.fs, lineHeight: `${lay.lh}px`, whiteSpace: 'pre', color: c.fg, opacity: running ? 0.72 : 1}}>
									{(toks[i] ?? []).map((tk, j) => (
										<span key={j} style={{color: c.syn[tk.cls], fontWeight: tk.cls === 'kw' ? 700 : 400}}>{tk.text}</span>
									))}
								</div>
								{s.mark.line === ln && <MarkRing color={c.accent} frame={frame} at={s.mark.at} x={lay.textX - 8} y={y} w={W - lay.textX - 2} h={lay.lh} />}
							</React.Fragment>
						);
					})}
				</div>

				{/* variables */}
				<Panel x={lay.vars.x} y={lay.vars.y} w={lay.vars.w} h={lay.vars.h} bg={c.panel} rule={c.rule} />
				<div data-code style={{position: 'absolute', left: lay.vars.x + 12, top: lay.vars.y, ...mono, fontSize: 16, lineHeight: `${PANEL_HEAD}px`, color: c.dim, whiteSpace: 'pre', letterSpacing: sk.label.upper ? 1 : 0, textTransform: 'none'}}>{s.varsTitle}</div>
				{s.vars.slice(0, lay.varCap).map(row)}

				{/* call stack */}
				<Panel x={lay.stack.x} y={lay.stack.y} w={lay.stack.w} h={lay.stack.h} bg={c.panel} rule={c.rule} />
				<div data-code style={{position: 'absolute', left: lay.stack.x + 12, top: lay.stack.y, ...mono, fontSize: 16, lineHeight: `${PANEL_HEAD}px`, color: c.dim, whiteSpace: 'pre'}}>{s.stackTitle}</div>
				{s.stack.slice(lay.stackTop, lay.stackTop + lay.stackCap).map((f, k) => {
					const i = lay.stackTop + k;
					const y = lay.stack.y + PANEL_HEAD + k * PANEL_LH;
					const born = prog(frame, f.addedAt, 9);
					const sel = i === s.sel;
					const fl = 1 - lin(frame, f.addedAt, FLASH_FRAMES);
					const bg = sel ? alpha(t.accent, 0.2) : fl > 0.01 ? mixHexRaw(c.panel, c.flash, fl) : 'transparent';
					return (
						<div key={`f.${i}.${f.fn}`} style={{position: 'absolute', left: lay.stack.x + 6, top: y, width: lay.stack.w - 12, height: PANEL_LH, background: bg, borderRadius: 4, opacity: born, transform: `translateX(${(1 - born) * -26}px)`}}>
							{sel && <div style={{position: 'absolute', left: 0, top: 3, width: 4, height: PANEL_LH - 6, borderRadius: 2, background: c.accent}} />}
							<div data-code style={{position: 'absolute', left: 10, top: 0, ...mono, fontSize: PANEL_FS, lineHeight: `${PANEL_LH}px`, whiteSpace: 'pre', color: c.fg, fontWeight: sel ? 700 : 400}}>
								<span style={{color: c.dim, fontWeight: 400}}>{`#${i} `}</span>
								<span>{f.fn}</span>
								{f.at ? <span style={{color: c.dim, fontWeight: 400}}>{` ${f.at}`}</span> : null}
							</div>
							{s.mark.frame === i && <Ring color={c.accent} frame={frame} at={s.mark.at} w={lay.stack.w - 12} h={PANEL_LH} />}
						</div>
					);
				})}

				{/* debug console */}
				<div style={{position: 'absolute', left: lay.con.x, top: lay.con.y, width: lay.con.w, height: lay.con.h, background: c.con.bg, borderTop: `1px solid ${c.rule}`, boxSizing: 'border-box'}} />
				{lay.conRows.map((v, i) => {
					const r = s.con[v.row];
					const vis = v.text.slice(0, v.shown);
					const pl = Math.min(v.promptLen, vis.length);
					const showCursor = r.cursor && (r.kind === 'prompt' || v.shown < v.text.length || v.sub === lastSub(lay.conRows, v.row)) && (s.typing || blinkOn);
					const cwC = CON_FS * 0.6;
					return (
						<div key={`c.${v.row}.${v.sub}.${i}`} style={{position: 'absolute', left: 14 + v.indent * cwC, top: v.y, height: CON_LH}}>
							<div data-code style={{...mono, fontSize: CON_FS, lineHeight: `${CON_LH}px`, whiteSpace: 'pre', color: r.kind === 'out' ? toneColor(c.con, r.tone) : c.con.fg}}>
								{pl > 0 && <span style={{color: c.con.prompt}}>{vis.slice(0, pl)}</span>}
								{vis.slice(pl)}
								{showCursor && <span style={{display: 'inline-block', width: cwC, height: Math.round(CON_FS * 1.1), background: c.con.fg, verticalAlign: 'text-bottom', opacity: 0.9}} />}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

const lastSub = (rows: {row: number; sub: number}[], row: number) => {
	let m = 0;
	for (const r of rows) if (r.row === row) m = Math.max(m, r.sub);
	return m;
};

const Panel: React.FC<{x: number; y: number; w: number; h: number; bg: string; rule: string}> = ({x, y, w, h, bg, rule}) => (
	<div style={{position: 'absolute', left: x, top: y, width: w, height: h, background: bg, borderTop: `1px solid ${rule}`, boxSizing: 'border-box'}} />
);

/** A dashed ring that settles around a variable or a stack frame. */
const Ring: React.FC<{color: string; frame: number; at: number; w: number; h: number}> = ({color, frame, at, w, h}) => {
	const p = prog(frame, at, 8);
	return <div style={{position: 'absolute', left: -2, top: -1, width: w + 4, height: h + 2, border: `2px dashed ${color}`, borderRadius: 6, boxSizing: 'border-box', opacity: p, transform: `scale(${1 + (1 - p) * 0.06})`}} />;
};
const MarkRing: React.FC<{color: string; frame: number; at: number; x: number; y: number; w: number; h: number}> = ({color, frame, at, x, y, w, h}) => {
	const p = prog(frame, at, 8);
	return <div style={{position: 'absolute', left: x, top: y, width: w, height: h, border: `2px dashed ${color}`, borderRadius: 6, boxSizing: 'border-box', opacity: p, transform: `scale(${1 + (1 - p) * 0.04})`}} />;
};
