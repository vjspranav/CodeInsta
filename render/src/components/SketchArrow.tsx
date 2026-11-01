import React from 'react';
import {hash, lin, prog, Rect} from '../theme';
import {Draw, rCurve, rLine, rPoly, Svg} from '../sketch';
import {useStyle} from '../styles/context';
import {fitText} from '../text';

type Pt = [number, number];

const anchor = (a: Rect, b: Rect, gap: number): {p0: Pt; p1: Pt; horizontal: boolean} => {
	const ac: Pt = [a.x + a.w / 2, a.y + a.h / 2];
	const bc: Pt = [b.x + b.w / 2, b.y + b.h / 2];
	const dx = bc[0] - ac[0];
	const dy = bc[1] - ac[1];
	const horizontal = Math.abs(dx) / (a.w / 2 + b.w / 2) > Math.abs(dy) / (a.h / 2 + b.h / 2);
	if (horizontal) {
		const s = Math.sign(dx) || 1;
		return {p0: [ac[0] + (s * a.w) / 2 + s * gap, ac[1]], p1: [bc[0] - (s * b.w) / 2 - s * gap, bc[1]], horizontal};
	}
	const s = Math.sign(dy) || 1;
	return {p0: [ac[0], ac[1] + (s * a.h) / 2 + s * gap], p1: [bc[0], bc[1] - (s * b.h) / 2 - s * gap], horizontal};
};

export const SketchArrow: React.FC<{
	from: Rect;
	to: Rect;
	start: number;
	frame: number;
	label?: string;
	bend?: number;
	seedKey: string;
	color?: string;
}> = ({from, to, start, frame, label, bend, seedKey, color: colorProp}) => {
	const st = useStyle();
	const t = st.tokens;
	const color = colorProp ?? t.ink;
	const ak = st.skin.arrow;
	if (frame < start) return null;
	const seed = hash(seedKey);
	const {p0, p1, horizontal} = anchor(from, to, 8);
	const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
	const mid: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
	const nx = -(p1[1] - p0[1]) / (len || 1);
	const ny = (p1[0] - p0[0]) / (len || 1);
	const b = (bend ?? (seed % 2 ? 0.16 : -0.16)) * len;
	const c: Pt = [mid[0] + nx * b, mid[1] + ny * b];
	const pts: Pt[] = [0, 0.25, 0.5, 0.75, 1].map((t) => [
		(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
		(1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1],
	]);
	// tangent at end
	const tx = p1[0] - c[0];
	const ty = p1[1] - c[1];
	const tl = Math.hypot(tx, ty) || 1;
	const ux = tx / tl;
	const uy = ty / tl;
	const ang = (28 * Math.PI) / 180;
	const hl = 18;
	const rot = (x: number, y: number, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
	const l1 = rot(-ux, -uy, ang);
	const l2 = rot(-ux, -uy, -ang);
	const shaft = prog(frame, start, 18);
	const head = prog(frame, start + 12, 8);
	// bounding box for the svg so strokes are not clipped
	const lw = horizontal ? Math.max(66, Math.min(184, len + 8)) : 184;
	const f = label ? fitText(label, 'hand', lw, 64, 26, 22, 1.05, undefined, 3) : null;
	return (
		<Svg w={720} h={1280} style={{pointerEvents: 'none'}}>
			<Draw paths={rCurve(pts, seed, {roughness: 1.0})} p={shaft} color={color} width={ak.width} dashed={ak.dash} />
			{ak.head === 'open' ? (
				<>
					<Draw paths={rLine(p1[0], p1[1], p1[0] + l1[0] * hl, p1[1] + l1[1] * hl, seed + 1, {roughness: 0.7})} p={head} color={color} width={ak.width} />
					<Draw paths={rLine(p1[0], p1[1], p1[0] + l2[0] * hl, p1[1] + l2[1] * hl, seed + 2, {roughness: 0.7})} p={head} color={color} width={ak.width} />
				</>
			) : (
				<Draw paths={rPoly([p1, [p1[0] + l1[0] * hl, p1[1] + l1[1] * hl], [p1[0] + l2[0] * hl, p1[1] + l2[1] * hl]], seed + 1, {fill: color, fillStyle: 'solid'})} p={head} color={color} width={ak.width * 0.5} />
			)}
			{f && lin(frame, start + 8, 10) > 0 && (
				<g opacity={lin(frame, start + 8, 10)}>
					<foreignObject
						x={horizontal ? c[0] - lw / 2 : c[0] + 14}
						y={horizontal ? Math.min(p0[1], p1[1]) - f.height - 12 : c[1] - f.height / 2}
						width={lw}
						height={f.height + 6}
					>
						<div
						data-label
						style={{
						...st.font.hand,
								fontSize: f.size,
								lineHeight: `${f.lineH}px`,
								color: color === t.ink ? t.muted : color,
								textAlign: horizontal ? 'center' : 'left',
								background: t.paper,
								borderRadius: Math.min(6, st.skin.panel.radius),
							}}
						>
							{f.lines.map((l, i) => (
								<div key={i}>{l}</div>
							))}
						</div>
					</foreignObject>
				</g>
			)}
		</Svg>
	);
};
