import React from 'react';
import rough from 'roughjs';
import type {Drawable, Options} from 'roughjs/bin/core';
import {clamp01, hash} from './theme';
import {getStyle} from './styles';
import {useStyle} from './styles/context';

const gen = rough.generator();

export interface PathInfo {
	d: string;
	stroke: string;
	strokeWidth: number;
	fill: string;
	/** crisp solid fill that must keep its own colour when Draw is given a stroke colour */
	solid?: boolean;
}

const cache = new Map<string, PathInfo[]>();

/** Memoised per style, because the stroke mode (rough / clean / mono) changes the geometry. */
const toPaths = (key: string, make: () => PathInfo[]): PathInfo[] => {
	const k = `${getStyle().id}|${key}`;
	const hit = cache.get(k);
	if (hit) return hit;
	const res = make();
	cache.set(k, res);
	return res;
};

const roughPaths = (dr: Drawable): PathInfo[] =>
	gen.toPaths(dr).map((p) => ({d: p.d, stroke: p.stroke, strokeWidth: p.strokeWidth, fill: p.fill ?? 'none'}));

const base = (seed: number, o: Options = {}): Options => ({
	roughness: 1.15,
	bowing: 0.9,
	strokeWidth: 2.4,
	seed,
	...o,
});

const isRough = () => getStyle().stroke === 'rough';
const cornerR = (w: number, h: number) => (getStyle().stroke === 'clean' ? Math.min(getStyle().skin.panel.radius, w / 2, h / 2) : 0);

/** Fill + outline paths for a clean (crisp vector) or mono (square, technical) outline. */
const crisp = (d: string, o: Options, bbox?: {x: number; y: number; w: number; h: number}): PathInfo[] => {
	const out: PathInfo[] = [];
	const fill = o.fill && o.fill !== 'none' ? o.fill : undefined;
	if (fill) {
		const hatch = getStyle().stroke === 'mono' && o.fillStyle === 'hachure' && bbox && getStyle().skin.panel.hatch === 'lines';
		if (hatch) out.push(...hatchLines(bbox!, fill, o.hachureGap ?? 8, o.fillWeight ?? 1.2));
		else out.push({d, stroke: 'none', strokeWidth: 0, fill, solid: true});
	}
	if (o.stroke !== 'none') out.push({d, stroke: 'currentColor', strokeWidth: o.strokeWidth ?? 2.4, fill: 'none'});
	return out;
};

/** Diagonal hatch lines clipped to a rectangle (a technical-drawing fill). */
const hatchLines = (r: {x: number; y: number; w: number; h: number}, color: string, gap: number, weight: number): PathInfo[] => {
	let d = '';
	const g = Math.max(4, gap);
	for (let k = -r.h; k < r.w; k += g) {
		// line y = x - k (45 degrees) clipped to the rect
		const x0 = Math.max(0, k);
		const x1 = Math.min(r.w, k + r.h);
		if (x1 <= x0) continue;
		d += `M ${r.x + x0} ${r.y + x0 - k} L ${r.x + x1} ${r.y + x1 - k} `;
	}
	return d ? [{d, stroke: color, strokeWidth: weight, fill: 'none'}] : [];
};

export const rectD = (x: number, y: number, w: number, h: number, r: number) =>
	r <= 0
		? `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
		: `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;

/** Catmull-Rom spline through points as cubic beziers. */
const splineD = (pts: [number, number][]): string => {
	if (pts.length < 3) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
	let d = `M ${pts[0][0]} ${pts[0][1]}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[Math.min(pts.length - 1, i + 2)];
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
	}
	return d;
};

export const seedOf = (s: string) => hash(s);

export const rRect = (x: number, y: number, w: number, h: number, seed: number, o: Options = {}) =>
	toPaths(`r|${x}|${y}|${w}|${h}|${seed}|${JSON.stringify(o)}`, () =>
		isRough() ? roughPaths(gen.rectangle(x, y, w, h, base(seed, o))) : crisp(rectD(x, y, w, h, cornerR(w, h)), o, {x, y, w, h}),
	);

export const rLine = (x1: number, y1: number, x2: number, y2: number, seed: number, o: Options = {}) =>
	toPaths(`l|${x1}|${y1}|${x2}|${y2}|${seed}|${JSON.stringify(o)}`, () =>
		isRough()
			? roughPaths(gen.line(x1, y1, x2, y2, base(seed, o)))
			: [{d: `M ${x1} ${y1} L ${x2} ${y2}`, stroke: 'currentColor', strokeWidth: o.strokeWidth ?? 2.4, fill: 'none'}],
	);

export const rEllipse = (cx: number, cy: number, w: number, h: number, seed: number, o: Options = {}) =>
	toPaths(`e|${cx}|${cy}|${w}|${h}|${seed}|${JSON.stringify(o)}`, () =>
		isRough()
			? roughPaths(gen.ellipse(cx, cy, w, h, base(seed, o)))
			: crisp(`M ${cx - w / 2} ${cy} A ${w / 2} ${h / 2} 0 1 0 ${cx + w / 2} ${cy} A ${w / 2} ${h / 2} 0 1 0 ${cx - w / 2} ${cy} Z`, o),
	);

export const rCurve = (pts: [number, number][], seed: number, o: Options = {}) =>
	toPaths(`c|${pts.join(',')}|${seed}|${JSON.stringify(o)}`, () =>
		isRough() ? roughPaths(gen.curve(pts, base(seed, o))) : [{d: splineD(pts), stroke: 'currentColor', strokeWidth: o.strokeWidth ?? 2.4, fill: 'none'}],
	);

export const rPoly = (pts: [number, number][], seed: number, o: Options = {}) =>
	toPaths(`p|${pts.join(',')}|${seed}|${JSON.stringify(o)}`, () =>
		isRough() ? roughPaths(gen.polygon(pts, base(seed, o))) : crisp(`M ${pts.map((p) => p.join(' ')).join(' L ')} Z`, o),
	);

export const rPath = (d: string, seed: number, o: Options = {}) =>
	toPaths(`d|${d}|${seed}|${JSON.stringify(o)}`, () => (isRough() ? roughPaths(gen.path(d, base(seed, o))) : crisp(d, o)));

/** Rounded-rectangle outline as an SVG path (rough-ified). */
export const roundedRectPath = (x: number, y: number, w: number, h: number, r: number) =>
	`M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;

interface DrawProps {
	paths: PathInfo[];
	/** 0..1 draw-on progress */
	p: number;
	color?: string;
	width?: number;
	opacity?: number;
	/** override per-path fill (hachure paths keep stroke colour) */
	dashed?: boolean;
}

/** Draws roughjs paths with a stroke-dasharray "drawing on" effect. */
export const Draw: React.FC<DrawProps> = ({paths, p, color, width, opacity = 1, dashed}) => {
	const st = useStyle();
	const q = clamp01(p);
	if (q <= 0.001) return null;
	const square = st.stroke === 'mono';
	return (
		<g opacity={opacity}>
			{paths.map((pi, i) => {
				const isFill = pi.fill !== 'none';
				return (
					<path
						key={i}
						d={pi.d}
						pathLength={1}
						fill={isFill ? (pi.solid ? pi.fill : color ?? pi.fill) : 'none'}
						stroke={isFill ? 'none' : color ?? pi.stroke}
						strokeWidth={width ?? pi.strokeWidth}
						strokeLinecap={square ? 'butt' : 'round'}
						strokeLinejoin={square ? 'miter' : 'round'}
						strokeDasharray={q >= 0.999 ? (dashed ? '0.02 0.012' : undefined) : '1 1'}
						strokeDashoffset={q >= 0.999 ? undefined : 1 - q}
					/>
				);
			})}
		</g>
	);
};

/** Text that is "written": a left-to-right clip wipe. */
export const WriteOn: React.FC<{
	p: number;
	w: number;
	h: number;
	x?: number;
	y?: number;
	children: React.ReactNode;
	style?: React.CSSProperties;
}> = ({p, w, h, x = 0, y = 0, children, style}) => {
	const q = clamp01(p);
	if (q <= 0) return null;
	return (
		<div
			data-fit
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width: w,
				height: h,
				clipPath: `inset(-6px ${Math.max(0, (1 - q) * 100)}% -6px 0)`,
				...style,
			}}
		>
			{children}
		</div>
	);
};

export const Svg: React.FC<{w: number; h: number; children: React.ReactNode; style?: React.CSSProperties}> = ({
	w,
	h,
	children,
	style,
}) => (
	<svg
		width={w}
		height={h}
		viewBox={`0 0 ${w} ${h}`}
		style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', ...style}}
	>
		{children}
	</svg>
);

