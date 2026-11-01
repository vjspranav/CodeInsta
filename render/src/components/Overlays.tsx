import React from 'react';
import type {DefineT} from '../timeline';
import {END_TOP, END_W, endLabel, endNoteSize, endPages} from '../endcard';
import type {Story} from '../schema';
import {clamp01, easeOut, LOWER_THIRD, lin, prog} from '../theme';
import {Draw, rLine, Svg, WriteOn} from '../sketch';
import {Panel} from './Panel';
import {Texture} from './Texture';
import {useStyle} from '../styles/context';
import {wrap} from '../text';

export interface DefineBox {
	label: string;
	size: number;
	lines: string[];
	noteLines: string[];
	noteSize: number;
	height: number;
	/** true when every word of the label and note is rendered (never truncated) */
	complete: boolean;
}

/** Pure layout of the lower-third: wraps (never truncates), shrinking to fit LOWER_THIRD. */
export const defineBox = (d: {term: string; full: string; note?: string}): DefineBox => {
	const label = endLabel(d.term, d.full);
	// 6 px of slack: the DOM must never be a hair wider than the measured line
	const textW = LOWER_THIRD.w - 56 - 6;
	const noteSize = 22;
	const noteLines = d.note ? wrap(d.note, 'hand', noteSize, textW).slice(0, 2) : [];
	const noteH = noteLines.length * noteSize * 1.15;
	let size = 36;
	let lines = wrap(label, 'hand', size, textW);
	for (; size >= 22; size--) {
		lines = wrap(label, 'hand', size, textW);
		if (lines.length <= 2 && lines.length * size * 1.1 + noteH + 26 <= LOWER_THIRD.h) break;
	}
	if (size < 22) {
		size = 22;
		lines = wrap(label, 'hand', size, textW);
	}
	const height = Math.min(LOWER_THIRD.h, lines.length * size * 1.1 + noteH + 26);
	const full = (arr: string[], src: string) => arr.join(' ').replace(/-\s/g, '') .replace(/\s+/g, ' ').length >= src.replace(/\s+/g, ' ').length - 2;
	const complete = full(lines, label) && (!d.note || (wrap(d.note, 'hand', noteSize, textW).length <= 2));
	return {label, size, lines, noteLines, noteSize, height, complete};
};

export const DefineLowerThird: React.FC<{d: DefineT; frame: number}> = ({d, frame}) => {
	const st = useStyle();
	const k = st.tokens;
	const t = frame - d.frame;
	if (t < 0 || t >= d.frames) return null;
	const inP = prog(frame, d.frame, 12);
	const outP = lin(frame, d.frame + d.frames - 10, 10);
	const w = LOWER_THIRD.w;
	const box = defineBox(d);
	const top = LOWER_THIRD.y + LOWER_THIRD.h - box.height;
	return (
		<div
			data-define
			style={{
				position: 'absolute',
				left: LOWER_THIRD.x,
				top,
				width: w,
				height: box.height,
				transform: `translateX(${(1 - inP) * -50 - outP * 60}px)`,
				opacity: 1 - outP,
			}}
		>
			<Svg w={w} h={box.height}>
				<Panel w={w} h={box.height} seed={31} p={inP} hatch={false} inset={4} roughness={1.0} width={2.6} />
				<rect x={4} y={4} width={10} height={box.height - 8} fill={k.accent} opacity={inP} />
			</Svg>
			<WriteOn p={lin(frame, d.frame + 3, 14)} w={w} h={box.height} x={30} y={13}>
				<div data-define-text data-label style={{...st.font.hand, fontSize: box.size, lineHeight: 1.1, color: k.ink, width: w - 56}}>
					{box.lines.map((l, i) => (
						<div key={i} data-define-line style={{whiteSpace: 'nowrap'}}>
							{i === 0 ? <span style={{color: k.accentText}}>{l.slice(0, d.term.length)}</span> : null}
							{i === 0 ? l.slice(d.term.length) : l}
						</div>
					))}
				</div>
				{box.noteLines.length > 0 && (
					<div data-label style={{...st.font.hand, fontWeight: Math.min(st.font.hand.fontWeight, 500), fontSize: box.noteSize, lineHeight: 1.15, color: k.muted, marginTop: 2, width: w - 56}}>
						{box.noteLines.map((l, i) => (
							<div key={i} style={{whiteSpace: 'nowrap'}}>{l}</div>
						))}
					</div>
				)}
			</WriteOn>
		</div>
	);
};

export const EndCard: React.FC<{story: Story; start: number; frame: number}> = ({story, start: start0, frame}) => {
	const st = useStyle();
	const k = st.tokens;
	const pages = endPages(story);
	const W = END_W;
	const top = END_TOP;
	// which page is up (the whole glossary is shown, a page after another)
	let pi = 0;
	let start = start0;
	for (; pi < pages.length - 1 && frame >= start + pages[pi].frames; pi++) start += pages[pi].frames;
	const page = pages[pi] ?? {fs: 38, blocks: [], frames: 0, suffix: ''};
	const fs = page.fs;
	const ns = endNoteSize;
	const lay = {blocks: page.blocks};
	let y = top;
	let n = 0;
	const out: React.ReactNode[] = [];
	const heading = (label: string, seed: number, t0: number) => {
		const yy = y;
		y += 90;
		out.push(
			<div key={`h-${label}`}>
				<WriteOn p={lin(frame, t0, 14)} w={W + 60} h={82} x={50} y={yy}>
					<div data-label style={{...st.font.hand, fontSize: 56, color: k.ink, lineHeight: 1.1}}>{label}</div>
				</WriteOn>
				<Svg w={720} h={1280}>
					<Draw paths={rLine(50, yy + 82, 50 + 300, yy + 84, seed, {roughness: 1.3})} p={prog(frame, t0 + 6, 16)} color={k.accent} width={4} />
					</Svg>
					</div>,
		);
	};
	lay.blocks.forEach((b, i) => {
		const isFirstP = b.kind === 'p' && lay.blocks.findIndex((x) => x.kind === 'p') === i;
		if (i === 0 && b.kind === 'g') heading(`Word list${page.suffix}`, 5, start + 2);
		if (isFirstP) {
			y += 6;
			heading('Remember', 9, start + 8 + n * 9);
		}
		const t0 = start + 12 + n * 9;
		n++;
		const yy = y;
		y += b.h;
		out.push(
			<div key={i}>
				<Svg w={720} h={1280}>
					{b.kind === 'g' ? (
						<circle cx={62} cy={yy + fs * 0.6} r={6} fill={k.accent} opacity={lin(frame, t0, 6)} />
					) : (
						<Draw paths={rLine(54, yy + fs * 0.62, 62, yy + fs * 0.85, 40 + i, {roughness: 0.5})} p={prog(frame, t0, 8)} color={k.accent} width={4} />
						)}
					{b.kind === 'p' && <Draw paths={rLine(62, yy + fs * 0.85, 76, yy + fs * 0.3, 80 + i, {roughness: 0.5})} p={prog(frame, t0 + 3, 8)} color={k.accent} width={4} />}
				</Svg>
				<WriteOn p={lin(frame, t0 + 2, 16)} w={W + 40} h={b.h} x={90} y={yy}>
					<div data-label style={{...st.font.hand, fontSize: fs, lineHeight: 1.15, color: k.ink}}>
						{b.lines.map((l, li) => (
							<div key={li}>
								{b.kind === 'g' && li === 0 && b.term && l.startsWith(b.term) ? (
									<>
										<span style={{color: k.accentText}}>{b.term}</span>
										{l.slice(b.term.length)}
									</>
								) : (
									l
								)}
							</div>
						))}
					</div>
					{b.note.length > 0 && (
						<div data-label style={{...st.font.hand, fontWeight: Math.min(st.font.hand.fontWeight, 500), fontSize: ns(fs), lineHeight: 1.15, color: k.muted}}>
							{b.note.map((l, li) => (
								<div key={li}>{l}</div>
							))}
						</div>
					)}
				</WriteOn>
			</div>,
		);
	});
	const fade = clamp01(easeOut(lin(frame, start, 6)));
	return (
	<div style={{position: 'absolute', inset: 0, background: k.paper, opacity: fade}}>
	<Texture layer="under" />
	{out}
	</div>
	);
};
