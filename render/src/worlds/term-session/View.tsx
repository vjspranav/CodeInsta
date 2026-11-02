import React from 'react';
import {easeOut, lin, prog} from '../../theme';
import {alpha, bestOn, mixHexRaw} from '../../styles';
import type {Style} from '../../styles';
import type {WorldViewProps} from '../types';
import {legible} from '../kit';
import {GUTTER, PAD_X, STATUS_H, statusText, TITLE_H, termLayout, TermState, Tone} from './model';

/** The colours of a terminal in a style, all legible on the terminal background. */
export const termColors = (st: Style) => {
	const t = st.tokens;
	const hlBg = mixHexRaw(t.termBg, t.accent, 0.22);
	const err = legible(t.like, t.termBg);
	return {
		bg: t.termBg,
		fg: t.termFg,
		dim: t.termDim,
		prompt: t.termPrompt,
		err,
		ok: legible(t.ok, t.termBg),
		warn: legible(t.termPrompt, t.termBg),
		hlBg,
		hlFg: legible(t.termFg, hlBg),
		bar: mixHexRaw(t.termBg, t.termFg, 0.08),
		rule: t.faint,
		pillFg: legible(bestOn(err, t.termBg, t.termFg), err),
	};
};

export const toneColor = (c: ReturnType<typeof termColors>, tone: Tone) =>
	tone === 'err' ? c.err : tone === 'warn' ? c.warn : tone === 'ok' ? c.ok : tone === 'dim' ? c.dim : c.dim;

const SPIN = ['|', '/', '-', '\\'];

export const TermSessionView: React.FC<WorldViewProps<TermState>> = ({state: s, rect, frame, start, style: st, dim}) => {
	if (!s.visible) return null;
	const t = st.tokens;
	const c = termColors(st);
	const sk = st.skin;
	const lay = termLayout(s, rect);
	// a terminal shows what was typed: no "->" or "--" ligatures
	const mono = {...st.font.mono, fontVariantLigatures: 'none' as const};
	const d = easeOut(lin(frame, start, 14));
	const radius = sk.term.radius;
	const border = sk.panel.double ? `6px double ${t.termDim}` : st.stroke === 'rough' ? `2px solid ${t.ink}` : sk.panel.outline ? `1.5px solid ${t.faint}` : 'none';
	const blinkOn = Math.floor(frame / 9) % 2 === 0;
	const cw = lay.cols > 0 ? lay.body.w / lay.cols : lay.fs * 0.6;
	const status = statusText(s);
	const pillIn = s.lastExit ? prog(frame, s.lastExit.frame, 8) : 0;

	// gutter bars: one per command block, spanning its rows on screen
	const spans = new Map<number, {y0: number; y1: number; failed: boolean; running: boolean; exitFrame: number}>();
	for (const v of lay.vrows) {
		const r = s.rows[v.row];
		if (r.block < 0) continue;
		const cur = spans.get(r.block);
		if (cur) cur.y1 = v.y + lay.lh;
		else spans.set(r.block, {y0: v.y, y1: v.y + lay.lh, failed: r.failed, running: r.running, exitFrame: s.lastExit?.frame ?? 0});
	}

	return (
		<div
			data-shell
			data-world="term.session"
			style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity: dim ? 0.42 : 1, transform: `scale(${0.96 + 0.04 * d})`, transformOrigin: '50% 40%'}}
		>
			<div
				style={{position: 'absolute', inset: 0, background: c.bg, borderRadius: radius, overflow: 'hidden', border, boxSizing: 'border-box', clipPath: `inset(0 0 ${(1 - d) * 100}% 0 round ${radius}px)`}}
			>
				{/* title bar */}
				<div style={{position: 'absolute', left: 0, top: 0, right: 0, height: TITLE_H, borderBottom: `1px solid ${c.rule}`, display: 'flex', alignItems: 'center', padding: '0 14px', boxSizing: 'border-box'}}>
					{sk.term.chrome === 'dots' && (
						<div style={{display: 'flex', gap: 8}}>
							{[t.accent, t.faint, t.muted].map((col, i) => (
								<div key={i} style={{width: 13, height: 13, borderRadius: 7, background: col}} />
							))}
						</div>
					)}
					<div data-data style={{position: 'absolute', left: 0, right: 0, textAlign: 'center', ...mono, fontSize: 16, color: c.dim, whiteSpace: 'pre'}}>
						{sk.term.chrome === 'prompt' ? `[ ${s.title} ]` : s.title}
					</div>
				</div>

				{/* gutter: grey while running, red after a non-zero exit (flashes once), quiet after success */}
				{[...spans.entries()].map(([b, sp]) => {
					const flash = sp.failed ? 1 - lin(frame, sp.exitFrame, 18) : 0;
					const col = sp.failed ? c.err : sp.running ? t.accent : c.rule;
					const w = sp.failed ? 5 + 4 * flash : 4;
					const op = sp.running ? 0.55 + 0.45 * Math.abs(Math.sin(frame / 6)) : 1;
					return <div key={b} style={{position: 'absolute', left: PAD_X - 2, top: sp.y0 + 3, width: w, height: Math.max(4, sp.y1 - sp.y0 - 6), borderRadius: 3, background: col, opacity: op}} />;
				})}

				{/* rows */}
				{lay.vrows.map((v, i) => {
					const r = s.rows[v.row];
					const vis = v.text.slice(0, v.shown);
					const pl = Math.min(v.promptLen, vis.length);
					const isCursorRow = r.cursor && (r.kind === 'prompt' || v.shown < v.text.length || v.sub === lastSub(lay.vrows, v.row));
					const showCursor = isCursorRow && (s.typing || blinkOn);
					const fg = r.hl ? c.hlFg : r.kind === 'out' ? toneColor(c, r.tone) : c.fg;
					const promptCol = r.afterFail ? c.err : c.prompt;
					return (
						<div key={`${v.row}.${v.sub}.${i}`} style={{position: 'absolute', left: lay.body.x - 6, top: v.y, width: lay.body.w + 12, height: lay.lh, background: r.hl ? c.hlBg : 'transparent', borderRadius: 4}}>
							<div data-code style={{position: 'absolute', left: 6 + v.indent * cw, top: 0, ...mono, fontSize: lay.fs, lineHeight: `${lay.lh}px`, whiteSpace: 'pre', color: fg}}>
								{pl > 0 && <span style={{color: promptCol}}>{vis.slice(0, pl)}</span>}
								{vis.slice(pl)}
								{showCursor && <span style={{display: 'inline-block', width: cw, height: Math.round(lay.fs * 1.15), background: c.fg, verticalAlign: 'text-bottom', opacity: 0.9}} />}
							</div>
						</div>
					);
				})}

				{/* scrollbar when the session is longer than the window */}
				{lay.total > lay.cap && (
					<div style={{position: 'absolute', right: 5, top: lay.body.y, width: 4, height: lay.body.h, borderRadius: 2, background: alpha(t.faint, 0.35)}}>
						<div style={{position: 'absolute', left: 0, width: 4, borderRadius: 2, background: c.dim, top: (lay.top / lay.total) * lay.body.h, height: Math.max(12, (lay.cap / lay.total) * lay.body.h)}} />
					</div>
				)}

				{/* status bar: directory, running spinner, last exit status */}
				<div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: STATUS_H, background: c.bar, borderTop: `1px solid ${c.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${PAD_X + GUTTER - 6}px`, boxSizing: 'border-box'}}>
					<div data-code style={{...mono, fontSize: 17, color: c.dim, whiteSpace: 'pre'}}>{status.left}</div>
					{s.running && !s.typing && (
						<div data-code style={{...mono, fontSize: 17, color: c.dim, whiteSpace: 'pre'}}>{`${SPIN[Math.floor(frame / 3) % 4]} running`}</div>
					)}
					{!s.running && status.right && (
						<div
							data-code
							style={{
								...mono,
								fontSize: 18,
								fontWeight: 700,
								whiteSpace: 'pre',
								color: status.failed ? c.pillFg : c.ok,
								background: status.failed ? c.err : 'transparent',
								border: status.failed ? 'none' : `2px solid ${c.ok}`,
								borderRadius: 6,
								padding: '1px 10px',
								transform: `scale(${0.7 + 0.3 * pillIn})`,
								transformOrigin: '100% 50%',
							}}
						>
							{status.right}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

const lastSub = (rows: {row: number; sub: number}[], row: number) => {
	let m = 0;
	for (const r of rows) if (r.row === row) m = Math.max(m, r.sub);
	return m;
};
