import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {Item} from '../timeline';
import {clamp01, hash, lin, prog, Rect} from '../theme';
import {Draw, rLine, rPoly, rRect, Svg, WriteOn} from '../sketch';
import {fitText} from '../text';
import {CODE_MIN_PX, colW, fitCode, wrapCodeLine} from '../codewrap';
import {DoodleIcon} from './Doodle';
import {Panel, Tone} from './Panel';
import {cacheEvents, COMMIT_STAGES, commitStages, propsAt, termLines} from '../state';
import {useStyle} from '../styles/context';
import type {Tokens} from '../styles';


const sv = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);

export const useBounce = (frame: number, start: number, damping = 12) => {
	const {fps} = useVideoConfig();
	return spring({frame: frame - start, fps, config: {damping, stiffness: 150, mass: 0.6}});
};

export const Shell: React.FC<{
	rect: Rect;
	frame: number;
	start: number;
	rot?: number;
	dim?: boolean;
	children: (w: number, h: number) => React.ReactNode;
}> = ({rect, frame, start, rot = 0, dim, children}) => {
	const b = useBounce(frame, start);
	if (frame < start) return null;
	return (
		<div
			data-shell
			style={{
				position: 'absolute',
				left: rect.x,
				top: rect.y,
				width: rect.w,
				height: rect.h,
				transformOrigin: '50% 50%',
				transform: `rotate(${rot}deg) scale(${0.9 + 0.1 * b})`,
				opacity: dim ? 0.42 : 1,
			}}
		>
			{children(rect.w, rect.h)}
		</div>
	);
};

type P = {item: Item; frame: number; dim?: boolean};

const toneOf = (t: string): Tone => (t === 'accent' ? 'accent' : t === 'grey' ? 'grey' : 'ink');
/** stroke colour of a tone, and the (4.5:1 safe) text colour of the same tone */
const toneStroke = (t: Tokens, tone: Tone) => (tone === 'accent' ? t.accent : tone === 'grey' ? t.muted : t.ink);
const toneText = (t: Tokens, tone: Tone) => (tone === 'accent' ? t.accentText : tone === 'grey' ? t.muted : t.ink);
/** the sketch style tilts its cards a little; crisp styles sit straight */
const tilt = (rough: boolean, deg: number) => (rough ? deg : 0);

export const SketchBox: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	const p = propsAt(item, frame);
	const tone = toneOf(sv(p.tone, 'ink'));
	const stroke = toneStroke(t, tone);
	const textColor = toneText(t, tone);
	const icon = sv(p.icon);
	const text = sv(p.text, sv(p.label));
	const sub = sv(p.sub);
	const seed = hash(item.key);
	const rough = st.stroke === 'rough';
	return (
		<Shell rect={item.rect} frame={frame} start={item.start} dim={dim} rot={tilt(rough, ((seed % 5) - 2) * 0.35)}>
			{(w, h) => {
				const iconSize = icon ? Math.min(84, h * 0.36) : 0;
				const pad = 14;
				const subH = sub ? 30 : 0;
				const textH = h - pad * 2 - iconSize - subH - (icon ? 4 : 0);
				const f = fitText(text, 'hand', w - pad * 2 - 8, textH, 52, 22, 1.12, undefined, 3);
				const outline = prog(frame, item.start, 16);
				const fill = prog(frame, item.start + 8, 16);
				const total = iconSize + (icon ? 4 : 0) + f.height + subH;
				const top = (h - total) / 2;
				return (
					<>
						<Svg w={w} h={h}>
							<Panel w={w} h={h} seed={seed} p={outline} fillP={fill} tone={tone} hatch={sv(p.fill, 'yes') !== 'no'} />
						</Svg>
						{icon && (
							<div style={{position: 'absolute', left: (w - iconSize) / 2, top, width: iconSize, height: iconSize, opacity: fill}}>
								<DoodleIcon name={icon} p={prog(frame, item.start + 4, 18)} color={stroke} size={iconSize} seed={seed} />
							</div>
						)}
						<WriteOn p={lin(frame, item.start + 8, 14)} w={w} h={f.height + 8} y={top + iconSize + (icon ? 4 : 0)} style={{textAlign: 'center'}}>
							<div data-label style={{...st.font.hand, fontSize: f.size, lineHeight: `${f.lineH}px`, color: textColor, padding: `0 ${pad}px`}}>
								{f.lines.map((l, i) => (
									<div key={i}>{l}</div>
								))}
							</div>
						</WriteOn>
						{sub && (
							<WriteOn p={lin(frame, item.start + 14, 14)} w={w} h={subH} y={top + iconSize + (icon ? 4 : 0) + f.height + 2} style={{textAlign: 'center'}}>
								<div data-label style={{...st.font.hand, fontWeight: Math.min(st.font.hand.fontWeight, 500), fontSize: 22, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: `0 ${pad}px`}}>{sub}</div>
							</WriteOn>
						)}
					</>
				);
			}}
		</Shell>
	);
};

export const SketchNote: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	const p = propsAt(item, frame);
	const text = sv(p.text);
	const seed = hash(item.key);
	const kind = st.skin.note;
	const rough = st.stroke === 'rough';
	const rot = tilt(rough || kind === 'sticky', ((seed % 7) - 3) * (rough ? 0.7 : 0.5));
	return (
		<Shell rect={item.rect} frame={frame} start={item.start} dim={dim} rot={rot}>
			{(w, h) => {
				const pad = kind === 'rule' ? 22 : 16;
				const f = fitText(text, 'hand', w - pad * 2 - 6, h - pad * 2 - 6, 42, 22, 1.15, undefined, 2);
				const d = prog(frame, item.start, 14);
				const fold = 22;
				const shape = (dx: number, dy: number) => `${6 + dx},${6 + dy} ${w - 6 + dx},${6 + dy} ${w - 6 + dx},${h - 6 - fold + dy} ${w - 6 - fold + dx},${h - 6 + dy} ${6 + dx},${h - 6 + dy}`;
				return (
					<>
						<Svg w={w} h={h}>
							{kind === 'sticky' && (
								<>
									{st.skin.panel.shadow && <polygon points={shape(st.skin.panel.shadow.dx, st.skin.panel.shadow.dy)} fill={t.shadow} opacity={st.skin.panel.shadow.opacity * d} />}
									<polygon points={shape(0, 0)} fill={t.accentTint} opacity={d} />
									<polygon points={`${w - 6},${h - 6 - fold} ${w - 6 - fold},${h - 6} ${w - 6 - fold},${h - 6 - fold}`} fill={t.fill} opacity={d} />
									{st.skin.panel.outline && (
										<Draw paths={rPoly([[6, 6], [w - 6, 6], [w - 6, h - 6 - fold], [w - 6 - fold, h - 6], [6, h - 6]], seed, {roughness: 0.9})} p={d} color={t.ink} width={2.4} />
									)}
									{rough && <rect x={w / 2 - 28} y={-6} width={56} height={18} fill={t.fill} opacity={0.85 * d} transform={`rotate(${-rot * 2} ${w / 2} 4)`} />}
								</>
							)}
							{kind === 'rule' && <Draw paths={rLine(10, 10, 10, h - 10, seed, {})} p={d} color={t.accent} width={4} />}
							{kind === 'bracket' && (
								<>
									<Draw paths={rLine(8, 8, 8, h - 8, seed, {})} p={d} color={t.accent} width={2.4} />
									<Draw paths={rLine(8, 8, 22, 8, seed + 1, {})} p={d} color={t.accent} width={2.4} />
									<Draw paths={rLine(8, h - 8, 22, h - 8, seed + 2, {})} p={d} color={t.accent} width={2.4} />
									<Draw paths={rLine(w - 8, 8, w - 8, h - 8, seed + 3, {})} p={d} color={t.accent} width={2.4} />
									<Draw paths={rLine(w - 22, 8, w - 8, 8, seed + 4, {})} p={d} color={t.accent} width={2.4} />
									<Draw paths={rLine(w - 22, h - 8, w - 8, h - 8, seed + 5, {})} p={d} color={t.accent} width={2.4} />
								</>
							)}
							{kind === 'box' && <Panel w={w} h={h} seed={seed} p={d} tone="ink" hatch={false} inset={6} />}
							{kind === 'box' && <rect x={6} y={6} width={w - 12} height={10} fill={t.accent} opacity={d} />}
						</Svg>
						<WriteOn p={lin(frame, item.start + 6, 16)} w={w} h={h} style={{display: 'flex', alignItems: 'center', justifyContent: kind === 'rule' ? 'flex-start' : 'center'}}>
							<div data-label style={{...st.font.hand, fontSize: f.size, lineHeight: `${f.lineH}px`, color: t.ink, padding: pad, paddingTop: kind === 'box' ? pad + 8 : pad, textAlign: kind === 'rule' ? 'left' : 'center', width: '100%'}}>
								{f.lines.map((l, i) => (
									<div key={i}>{l}</div>
								))}
							</div>
						</WriteOn>
					</>
				);
			}}
		</Shell>
	);
};

// ---------------- Cache ----------------
export const CacheBox: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	const seed = hash(item.key);
	const evs = cacheEvents(item);
	const cur = [...evs].reverse().find((e) => e.frame <= frame) ?? evs[0];
	const hadMiss = evs.some((e) => e.frame <= frame && e.result === 'miss');
	const stampStart = cur.frame + 14;
	const stamp = useBounce(frame, stampStart, 8);
	return (
		<Shell rect={item.rect} frame={frame} start={item.start} dim={dim}>
			{(w, h) => {
				const d = prog(frame, item.start, 16);
				const col = cur.result === 'hit' ? t.ink : t.accentText;
				const colStroke = cur.result === 'hit' ? t.ink : t.accent;
				const slotW = (w - 60) / 3;
				const shelfY = h * 0.5;
				const chipT = lin(frame, cur.frame, 14);
				const filled = cur.result === 'hit' && frame >= stampStart;
				const showHit = cur.result === 'hit';
				return (
					<>
						<Svg w={w} h={h}>
							<Panel w={w} h={h} seed={seed} p={d} hatch={false} width={3} />
							{[0, 1, 2].map((i) => {
								const x = 24 + i * (slotW + 6);
								const isTarget = i === 0;
								return (
									<g key={i}>
										<Draw
											paths={rRect(x, shelfY, slotW, h * 0.26, seed + 10 + i, {roughness: 0.9, ...(isTarget && filled ? {fill: t.fill, fillStyle: 'hachure', hachureGap: 6} : {})})}
											p={prog(frame, item.start + 6 + i * 3, 12)}
											color={isTarget && cur.result === 'miss' && frame >= stampStart ? t.accent : t.ink}
											width={2.4}
											dashed={isTarget && !showHit && !hadMiss ? false : isTarget && cur.result === 'miss'}
										/>
									</g>
								);
							})}
						</Svg>
						<div style={{position: 'absolute', left: 18, top: 10, display: 'flex', alignItems: 'center', gap: 8, opacity: d}}>
							<div data-label style={{...st.font.hand, fontSize: 26, color: t.ink}}>cache</div>
						</div>
						{/* slot labels */}
						<div data-data style={{position: 'absolute', left: 24, top: shelfY, width: slotW, height: h * 0.26, display: 'flex', alignItems: 'center', justifyContent: 'center', ...st.font.mono, fontSize: Math.min(15, slotW / 6.5), color: t.ink, opacity: filled ? 1 : 0, textAlign: 'center'}}>
							{cur.value}
						</div>
						{/* request chip */}
						{frame >= cur.frame && frame < stampStart + 40 && (
							<div
								data-data
								style={{
									position: 'absolute',
									left: lerp2(-40, 24, chipT),
									top: h * 0.2,
									padding: '3px 9px',
									border: `2px solid ${t.ink}`,
									borderRadius: Math.min(7, st.skin.panel.radius),
									background: t.card,
									...st.font.mono,
									fontSize: 14,
									color: t.ink,
									opacity: 1 - lin(frame, stampStart - 2, 5),
									whiteSpace: 'nowrap',
								}}
							>
								GET {cur.key}
							</div>
						)}
						{frame >= stampStart && (
							<div
								data-label
								style={{
									position: 'absolute',
									right: 18,
									top: h * 0.1,
									padding: '0 12px',
									border: `3.5px solid ${colStroke}`,
									borderRadius: Math.min(10, st.skin.panel.radius),
									color: col,
									...st.font.hand,
									fontSize: 36,
									transform: `rotate(${tilt(st.stroke === 'rough', -6)}deg) scale(${0.6 + 0.4 * stamp})`,
									opacity: clamp01(stamp * 2),
									lineHeight: 1.15,
									background: t.card,
								}}
							>
								{cur.result === 'hit' ? 'HIT ✓' : 'MISS ✗'}
							</div>
						)}
					</>
				);
			}}
		</Shell>
	);
};
const lerp2 = (a: number, b: number, t: number) => a + (b - a) * (1 - Math.pow(1 - t, 3));

// ---------------- Terminal ----------------
export const Terminal: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	const lines = termLines(item);
	const sk = st.skin;
	return (
		<Shell rect={item.rect} frame={frame} start={item.start} dim={dim}>
			{(w, h) => {
				const barH = 32;
				const pad = 14;
				const inner = w - pad * 2;
				let fs = 28;
				const full = (l: (typeof lines)[number]) => (l.kind === 'cmd' ? `${l.prompt} ${l.text}` : l.text);
				const wrapped = (f: number) => lines.map((l) => wrapCodeLine(full(l), inner / colW(f)));
				// shrink until the rows fit the height, but never below the 16 px code floor (long lines wrap instead)
				let ws = wrapped(fs);
				const total = () => ws.reduce((a, x) => a + x.rows.length, 0);
				while (fs > CODE_MIN_PX && total() * fs * 1.45 > h - barH - pad * 2) {
					fs -= 1;
					ws = wrapped(fs);
				}
				const rows = ws.map((x) => x.rows.length);
				const lh = fs * 1.45;
				let y = barH + pad;
				const d = prog(frame, item.start, 14);
				const lastVisible = [...lines].reverse().find((l) => frame >= l.t0);
				const border = sk.panel.double ? `6px double ${t.termDim}` : st.stroke === 'rough' ? 'none' : sk.panel.outline ? `1.5px solid ${t.faint}` : 'none';
				return (
					<div style={{position: 'absolute', inset: 0, background: t.termBg, borderRadius: sk.term.radius, overflow: 'hidden', clipPath: `inset(0 0 ${(1 - d) * 100}% 0 round ${sk.term.radius}px)`, boxShadow: 'none', border, boxSizing: 'border-box'}}>
						<div style={{height: barH, borderBottom: `1px solid ${t.faint}`, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px'}}>
							{sk.term.chrome === 'dots' &&
								[t.accent, t.faint, t.muted].map((c, i) => <div key={i} style={{width: 11, height: 11, borderRadius: 6, background: c}} />)}
							<div data-data style={{marginLeft: sk.term.chrome === 'dots' ? 8 : 0, ...st.font.mono, fontSize: 13, color: t.termDim}}>{sk.term.chrome === 'dots' ? 'zsh' : '┌─ zsh ─'}</div>
						</div>
						{lines.map((l, i) => {
							const top = y;
							y += rows[i] * lh;
							if (frame < l.t0) return null;
							const typed = l.kind === 'cmd' ? Math.floor((frame - l.t0) / l.cpf) + 1 : Infinity;
							const isCur = l === lastVisible;
							const blink = Math.floor(frame / 8) % 2 === 0;
							const promptLen = l.kind === 'cmd' ? l.prompt.length + 1 : 0;
							// characters of the full line (prompt included) revealed so far, spread over its wrapped rows
							let left = l.kind === 'cmd' ? promptLen + typed : Infinity;
							const bodies = ws[i].rows.map((row, ri) => {
								const ind = row.length - row.trimStart().length;
								const body = ri === 0 ? row : row.slice(ind);
								const take = Math.max(0, Math.min(body.length, left));
								left -= body.length + 1;
								return {ind, body, take};
							});
							const curRow = Math.max(0, bodies.map((x) => x.take > 0).lastIndexOf(true));
							const rowEls = bodies.map(({ind, body, take}, ri) => {
								const vis = body.slice(0, take);
								const pl = ri === 0 ? Math.min(promptLen, vis.length) : 0;
								return (
									<div key={ri} style={{height: lh, whiteSpace: 'pre', paddingLeft: ri === 0 ? 0 : ind * colW(fs)}}>
										{pl > 0 && <span style={{color: t.termPrompt}}>{vis.slice(0, pl)}</span>}
										{vis.slice(pl)}
										{isCur && l.kind === 'cmd' && blink && ri === curRow && <span style={{background: t.termFg, color: t.termFg}}>_</span>}
									</div>
								);
							});
							return (
								<div
									key={i}
									data-code
									style={{
										position: 'absolute',
										left: pad,
										top,
										width: inner,
										...st.font.mono,
										fontSize: fs,
										lineHeight: `${lh}px`,
										color: l.kind === 'cmd' ? t.termFg : t.termDim,
									}}
								>
									{rowEls}
								</div>
							);
						})}
					</div>
				);
			}}
		</Shell>
	);
};

// ---------------- Code card ----------------
export const CodeCard: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	const p = propsAt(item, frame);
	const raw = p.code ?? p.text ?? p.snippet ?? '';
	const codeLines: string[] = Array.isArray(raw) ? raw.map((x) => sv(x)) : sv(raw).replace(/\t/g, '  ').split('\n');
	const title = sv(p.title, sv(p.file));
	const hl = new Set<number>(Array.isArray(p.highlight) ? (p.highlight as number[]) : typeof p.highlight === 'number' ? [p.highlight] : []);
	const seed = hash(item.key);
	const rough = st.stroke === 'rough';
	return (
		<Shell rect={item.rect} frame={frame} start={item.start} dim={dim} rot={tilt(rough, -0.8)}>
			{(w, h) => {
				const pad = 18;
				const headH = title ? 44 : 14;
				const innerW = w - pad * 2 - 6;
				// long lines wrap at sensible break points; the text never drops below 16 px
				const fit = fitCode(codeLines, innerW, h - headH - pad);
				const fs = fit.fs;
				const lh = fit.lh;
				const flat = fit.rows.flatMap((rs, li) => rs.map((text) => ({li, text})));
				const d = prog(frame, item.start, 14);
				return (
					<>
						<Svg w={w} h={h}>
							{rough && <rect x={10} y={10} width={w - 6} height={h - 6} fill={t.fill} opacity={d} />}
							<Panel w={w} h={h} seed={seed} p={d} hatch={false} bg={t.codeBg} inset={3} roughness={0.9} width={2.4} />
							{flat.map((_, i) => (
								<line key={i} x1={pad - 6} x2={w - pad} y1={headH + (i + 1) * lh + 2} y2={headH + (i + 1) * lh + 2} stroke={t.codeRule} strokeWidth={1.4} opacity={d} />
							))}
							{title && <Draw paths={rLine(pad - 6, headH - 4, w - pad, headH - 4, seed + 1, {roughness: 0.8})} p={prog(frame, item.start + 4, 14)} color={t.accent} width={3} />}
						</Svg>
						{title && (
							<WriteOn p={lin(frame, item.start + 3, 12)} w={w} h={headH} x={pad} y={6}>
								<div data-label style={{...st.font.mono, fontWeight: 700, fontSize: 22, color: t.codeFg, lineHeight: `${headH - 8}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: w - pad * 2}}>{title}</div>
							</WriteOn>
						)}
						{flat.map((r, i) => {
							const t0 = item.start + 8 + r.li * 3;
							const q = lin(frame, t0, 8);
							if (q <= 0) return null;
							const marked = hl.has(r.li + 1);
							return (
								<div key={i} style={{position: 'absolute', left: pad, top: headH + i * lh + 4, width: innerW, height: lh, clipPath: `inset(0 ${(1 - q) * 100}% 0 0)`}}>
									{marked && <div style={{position: 'absolute', left: -6, right: -4, top: 2, bottom: 0, background: t.accentTint, borderLeft: `4px solid ${t.accent}`}} />}
									<div data-code style={{position: 'relative', ...st.font.mono, fontSize: fs, lineHeight: `${lh}px`, color: t.codeFg, whiteSpace: 'pre', fontWeight: marked ? 700 : 400}}>{r.text}</div>
								</div>
							);
						})}
					</>
				);
			}}
		</Shell>
	);
};

// ---------------- Commit story ----------------
export const CommitStory: React.FC<P> = ({item, frame, dim}) => {
	const st = useStyle();
	const t = st.tokens;
	const seed = hash(item.key);
	const {repo, title, text, when} = commitStages(item, frame);
	const stageStroke: Record<string, string> = {broke: t.accent, fix: t.accent, why: t.muted};
	const chipFill: Record<string, string> = {broke: t.accentTint, fix: t.accent, why: 'transparent'};
	const chipText: Record<string, string> = {broke: t.accentText, fix: t.onAccent, why: t.muted};
	const rough = st.stroke === 'rough';
	return (
		<Shell rect={item.rect} frame={frame} start={item.start} dim={dim} rot={tilt(rough, -1.1)}>
			{(w, h) => {
				const pad = 18;
				const head = title ? 82 : 52;
				const blockH = (h - head - 14) / 3;
				const d = prog(frame, item.start, 16);
				const repoFs = Math.min(22, (w - pad * 2 - 40) / Math.max(10, repo.length * 0.62));
				return (
					<>
						<Svg w={w} h={h}>
							<Panel w={w} h={h} seed={seed} p={d} hatch={false} inset={6} roughness={0.9} width={2.6} />
							{st.skin.note === 'sticky' && (
								<>
									<circle cx={w / 2} cy={8} r={9} fill={t.accent} stroke={t.ink} strokeWidth={2} opacity={d} />
									<circle cx={w / 2 - 3} cy={5} r={2.6} fill={t.onAccent} opacity={0.8 * d} />
								</>
							)}
							<Draw paths={rLine(pad, head - 8, w - pad - 6, head - 8, seed + 2, {roughness: 0.8})} p={prog(frame, item.start + 6, 14)} color={t.faint} width={1.8} />
						</Svg>
						<WriteOn p={lin(frame, item.start + 3, 14)} w={w} h={head} x={pad} y={22}>
							<div data-label style={{...st.font.mono, fontWeight: 700, fontSize: Math.max(repoFs, 13), color: t.ink, whiteSpace: 'nowrap', width: w - pad * 2}}>{repo}</div>
							{title && (
								<div data-label style={{...st.font.hand, fontWeight: Math.min(st.font.hand.fontWeight, 500), fontSize: 22, color: t.muted, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: w - pad * 2}}>
									{title}
								</div>
							)}
						</WriteOn>
						{COMMIT_STAGES.map((s, i) => {
							const t0 = when[s.key];
							if (t0 === undefined || frame < t0) return null;
							const top = head + 4 + i * blockH;
							const f = fitText(text[s.key], 'hand', w - pad * 2 - 4, blockH - 34, 36, 22, 1.14);
							return (
								<div key={s.key} style={{position: 'absolute', left: pad, top, width: w - pad * 2, height: blockH}}>
									<div style={{...st.font.hand, fontSize: 22, display: 'flex', alignItems: 'center', gap: 8, height: 28}}>
										{/* the chip is its own label: text colour is chosen against the chip's own fill (on-accent on accent) */}
										<span
											data-label
											style={{
												display: 'inline-block',
												padding: '0 10px',
												color: chipText[s.key],
												border: `2.4px solid ${stageStroke[s.key]}`,
												borderRadius: Math.min(8, st.skin.panel.radius),
												transform: `scale(${0.85 + 0.15 * prog(frame, t0, 8)})`,
												background: chipFill[s.key],
											}}
										>
											{s.label}
										</span>
										<span style={{color: t.muted, fontSize: 22}}>{i < 2 ? '↓' : '✓'}</span>
									</div>
									<WriteOn p={lin(frame, t0 + 4, 16)} w={w - pad * 2} h={blockH - 30} y={30}>
										<div data-label style={{...st.font.hand, fontSize: f.size, lineHeight: `${f.lineH}px`, color: t.ink}}>
											{f.lines.map((l, j) => (
												<div key={j}>{l}</div>
											))}
										</div>
									</WriteOn>
								</div>
							);
						})}
					</>
				);
			}}
		</Shell>
	);
};
