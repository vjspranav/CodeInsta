import React from 'react';
import {Draw, rectD, rRect} from '../sketch';
import {useStyle} from '../styles/context';

export type Tone = 'ink' | 'accent' | 'grey';

export const toneStroke = (t: {ink: string; accent: string; muted: string}, tone: Tone) => (tone === 'accent' ? t.accent : tone === 'grey' ? t.muted : t.ink);

/**
 * The shared panel skin: offset shadow, card body, fill (hatch / flat / halftone dots / none) and outline
 * (rough, crisp, double box-drawing, corner ticks), all decided by the active style. Render inside an <Svg>.
 */
export const Panel: React.FC<{
	w: number;
	h: number;
	seed: number;
	p: number; // outline draw-on 0..1
	fillP?: number; // fill draw-on 0..1 (defaults to p)
	tone?: Tone;
	hatch?: boolean;
	bg?: string;
	inset?: number;
	roughness?: number;
	stroke?: string;
	width?: number;
}> = ({w, h, seed, p, fillP, tone = 'ink', hatch = true, bg, inset = 4, roughness, stroke, width}) => {
	const st = useStyle();
	const t = st.tokens;
	const sk = st.skin.panel;
	const fp = fillP ?? p;
	const r = st.stroke === 'clean' ? Math.min(sk.radius, (w - inset * 2) / 2, (h - inset * 2) / 2) : 0;
	const color = stroke ?? toneStroke(t, tone);
	const ro = roughness !== undefined ? {roughness} : {};
	const tint = tone === 'accent' ? t.accentTint : tone === 'grey' ? t.soft : t.fill;
	const body = rectD(inset, inset, w - inset * 2, h - inset * 2, r);
	const dotId = `dots-${seed}`;
	const dotColor = tone === 'accent' ? t.accent : t.faint;
	const ow = width ?? sk.width;
	return (
		<>
			{sk.shadow && <path d={rectD(inset + sk.shadow.dx, inset + sk.shadow.dy, w - inset * 2, h - inset * 2, r)} fill={t.shadow} opacity={sk.shadow.opacity * p} />}
			<path d={body} fill={bg ?? t.card} opacity={p} />
			{hatch && sk.hatch === 'solid' && <path d={rectD(inset + 1, inset + 1, w - inset * 2 - 2, h - inset * 2 - 2, Math.max(0, r - 1))} fill={tint} opacity={0.85 * fp} />}
			{hatch && sk.hatch === 'dots' && (
				<>
					<defs>
						<pattern id={dotId} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
							<circle cx={3.5} cy={3.5} r={tone === 'accent' ? 1.9 : 1.4} fill={dotColor} />
						</pattern>
					</defs>
					<rect x={inset + 2} y={inset + 2} width={w - inset * 2 - 4} height={h - inset * 2 - 4} fill={`url(#${dotId})`} opacity={0.55 * fp} />
				</>
			)}
			{hatch && (sk.hatch === 'rough' || sk.hatch === 'lines') && (
				<Draw
					paths={rRect(inset + 3, inset + 3, w - inset * 2 - 6, h - inset * 2 - 6, seed + 5, {stroke: 'none', fill: tint, fillStyle: 'hachure', hachureGap: sk.hatch === 'lines' ? 7 : 9, fillWeight: sk.hatch === 'lines' ? 1.1 : 1.4})}
					p={fp}
					opacity={0.8}
				/>
			)}
			{sk.outline && <Draw paths={rRect(inset, inset, w - inset * 2, h - inset * 2, seed, ro)} p={p} color={color} width={ow} />}
			{sk.outline && sk.double && <Draw paths={rRect(inset + 6, inset + 6, w - inset * 2 - 12, h - inset * 2 - 12, seed + 1, ro)} p={p} color={color} width={Math.max(1.2, ow * 0.6)} />}
			{sk.ticks && (
				<g opacity={p}>
					{[
						[inset, inset, -1, -1],
						[w - inset, inset, 1, -1],
						[inset, h - inset, -1, 1],
						[w - inset, h - inset, 1, 1],
					].map(([cx, cy, sx, sy], i) => (
						<path key={i} d={`M ${cx + sx * 8} ${cy} H ${cx - sx * 4} M ${cx} ${cy + sy * 8} V ${cy - sy * 4}`} stroke={color} strokeWidth={1.6} fill="none" />
					))}
				</g>
			)}
		</>
	);
};
