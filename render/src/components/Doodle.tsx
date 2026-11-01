import React from 'react';
import {hash} from '../theme';
import {useStyle} from '../styles/context';
import {Draw, rCurve, rEllipse, rLine, rPath, rPoly, rRect, Svg} from '../sketch';

/** Small rough icons for SketchBox. Drawn in a 64x64 box. */
export const DoodleIcon: React.FC<{name: string; p: number; color?: string; size?: number; seed?: number}> = ({
	name,
	p,
	color: colorProp,
	size = 56,
	seed = 3,
}) => {
	const t = useStyle().tokens;
	const color = colorProp ?? t.ink;
	const s = size / 64;
	const o = {roughness: 1.0, strokeWidth: 3};
	let body: React.ReactNode = null;
	switch (name) {
		case 'phone':
		case 'client':
			body = (
				<>
					<Draw paths={rRect(18, 4, 28, 56, seed, o)} p={p} color={color} />
					<Draw paths={rLine(28, 52, 36, 52, seed + 1, o)} p={p} color={color} />
				</>
			);
			break;
		case 'server':
		case 'service':
			body = (
				<>
					<Draw paths={rRect(8, 6, 48, 16, seed, o)} p={p} color={color} />
					<Draw paths={rRect(8, 24, 48, 16, seed + 1, o)} p={p} color={color} />
					<Draw paths={rRect(8, 42, 48, 16, seed + 2, o)} p={p} color={color} />
					<Draw paths={rEllipse(16, 14, 4, 4, seed + 3, {...o, strokeWidth: 2})} p={p} color={color} />
					<Draw paths={rEllipse(16, 32, 4, 4, seed + 4, {...o, strokeWidth: 2})} p={p} color={color} />
					<Draw paths={rEllipse(16, 50, 4, 4, seed + 5, {...o, strokeWidth: 2})} p={p} color={color} />
				</>
			);
			break;
		case 'db':
			body = (
				<>
					<Draw paths={rEllipse(32, 12, 44, 14, seed, o)} p={p} color={color} />
					<Draw paths={rLine(10, 12, 10, 50, seed + 1, o)} p={p} color={color} />
					<Draw paths={rLine(54, 12, 54, 50, seed + 2, o)} p={p} color={color} />
					<Draw paths={rCurve([[10, 50], [32, 62], [54, 50]], seed + 3, o)} p={p} color={color} />
					<Draw paths={rCurve([[10, 31], [32, 43], [54, 31]], seed + 4, {...o, strokeWidth: 2})} p={p} color={color} />
				</>
			);
			break;
		case 'cache':
			body = (
				<Draw
					paths={rPoly([[36, 3], [14, 36], [30, 36], [24, 61], [50, 26], [34, 26]], seed, {...o, fill: t.accentTint, fillStyle: 'solid', stroke: color})}
					p={p}
					color={color}
				/>
			);
			break;
		case 'cdn':
		case 'cloud':
			body = (
				<Draw
					paths={rPath('M16 46 C 4 46 4 28 18 28 C 18 12 40 10 44 26 C 58 24 62 46 48 46 Z', seed, o)}
					p={p}
					color={color}
				/>
			);
			break;
		case 'user':
			body = (
				<>
					<Draw paths={rEllipse(32, 20, 22, 22, seed, o)} p={p} color={color} />
					<Draw paths={rCurve([[8, 58], [14, 40], [32, 36], [50, 40], [56, 58]], seed + 1, o)} p={p} color={color} />
				</>
			);
			break;
		case 'queue':
			body = (
				<>
					<Draw paths={rRect(4, 22, 16, 20, seed, o)} p={p} color={color} />
					<Draw paths={rRect(24, 22, 16, 20, seed + 1, o)} p={p} color={color} />
					<Draw paths={rRect(44, 22, 16, 20, seed + 2, o)} p={p} color={color} />
				</>
			);
			break;
		default:
			return null;
	}
	return (
		<Svg w={size} h={size} style={{position: 'relative'}}>
			<g transform={`scale(${s})`}>{body}</g>
		</Svg>
	);
};

/** Tiny hand-drawn bust avatar; narrator = a pen. */
const DoodleAvatar: React.FC<{id: string; color: string; size: number; pen?: boolean; glasses?: boolean}> = ({
	id,
	color,
	size,
	pen,
	glasses,
}) => {
	const t = useStyle().tokens;
	const seed = hash(id);
	const style = seed % 4;
	const s = size / 64;
	const o = {roughness: 0.9, strokeWidth: 2.6};
	return (
		<Svg w={size} h={size} style={{position: 'relative'}}>
			<g transform={`scale(${s})`}>
				<circle cx={32} cy={32} r={30} fill={t.card} stroke={color} strokeWidth={3.2} />
				{pen ? (
					<>
						<Draw paths={rPoly([[18, 46], [22, 36], [44, 14], [50, 20], [28, 42]], seed, {...o, fill: t.fill, fillStyle: 'solid'})} p={1} color={t.ink} />
						<Draw paths={rPoly([[18, 46], [22, 36], [28, 42]], seed + 1, {...o, fill: t.ink, fillStyle: 'solid'})} p={1} color={t.ink} />
						<Draw paths={rLine(40, 18, 46, 24, seed + 2, o)} p={1} color={t.accent} width={3} />
					</>
				) : (
					<>
						<Draw paths={rCurve([[12, 62], [14, 48], [32, 44], [50, 48], [52, 62]], seed + 1, o)} p={1} color={t.ink} />
						<Draw paths={rEllipse(32, 28, 20, 22, seed, {...o, fill: t.paperDeep, fillStyle: 'solid'})} p={1} color={t.ink} />
						{style === 0 && <Draw paths={rCurve([[20, 22], [24, 12], [32, 16], [38, 10], [44, 22]], seed + 3, o)} p={1} color={t.ink} width={3} />}
						{style === 1 && (
							<>
								<Draw paths={rCurve([[21, 22], [26, 14], [38, 14], [43, 22]], seed + 3, o)} p={1} color={t.ink} width={3} />
								<Draw paths={rEllipse(32, 10, 9, 9, seed + 4, o)} p={1} color={t.ink} />
							</>
						)}
						{style === 2 && (
							<>
								<Draw paths={rCurve([[20, 24], [22, 12], [42, 12], [44, 24]], seed + 3, o)} p={1} color={t.ink} width={3} />
								<Draw paths={rLine(20, 17, 52, 17, seed + 4, o)} p={1} color={color} width={3.5} />
							</>
						)}
						{style === 3 && <Draw paths={rCurve([[19, 30], [18, 12], [46, 12], [45, 30]], seed + 3, o)} p={1} color={t.ink} width={3} />}
						<circle cx={26} cy={29} r={1.9} fill={t.ink} />
						<circle cx={38} cy={29} r={1.9} fill={t.ink} />
						<path d="M25 37 Q 32 42 39 37" stroke={t.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" />
						{glasses && (
							<>
								<circle cx={26} cy={29} r={5.5} fill="none" stroke={t.ink} strokeWidth={1.8} />
								<circle cx={38} cy={29} r={5.5} fill="none" stroke={t.ink} strokeWidth={1.8} />
								<path d="M31.5 29 H32.5" stroke={t.ink} strokeWidth={1.8} />
							</>
						)}
					</>
				)}
			</g>
		</Svg>
	);
};

const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

/** Speaker avatar, skinned by the active style (doodle bust, monogram, flat paper face). */
export const Avatar: React.FC<{id: string; name: string; color: string; size: number; pen?: boolean; glasses?: boolean}> = ({id, name, color, size, pen, glasses}) => {
	const st = useStyle();
	const t = st.tokens;
	const kind = st.skin.avatar;
	if (kind === 'doodle') return <DoodleAvatar id={id} color={color} size={size} pen={pen} glasses={glasses} />;
	const seed = hash(id);
	const label = pen ? 'N' : initialOf(name);
	if (kind === 'monogram-circle') {
		return (
			<svg width={size} height={size} viewBox="0 0 64 64" style={{position: 'relative'}}>
				<circle cx={32} cy={32} r={29} fill={t.card} stroke={color} strokeWidth={3} />
				<text x={32} y={44} textAnchor="middle" fontSize={34} fontFamily={st.font.hand.fontFamily} fontWeight={st.font.hand.fontWeight} fill={color}>
					{label}
				</text>
			</svg>
		);
	}
	if (kind === 'monogram-square') {
		return (
			<svg width={size} height={size} viewBox="0 0 64 64" style={{position: 'relative'}}>
				<rect x={4} y={4} width={56} height={56} fill={t.card} stroke={color} strokeWidth={3.4} />
				<path d="M4 16 V4 H16 M48 4 H60 V16 M60 48 V60 H48 M16 60 H4 V48" stroke={t.ink} strokeWidth={2} fill="none" />
				<text x={32} y={43} textAnchor="middle" fontSize={32} fontFamily={st.font.mono.fontFamily} fontWeight={700} fill={color}>
					{label}
				</text>
			</svg>
		);
	}
	// face-flat: coloured paper disc with a flat face
	const hair = seed % 3;
	return (
		<svg width={size} height={size} viewBox="0 0 64 64" style={{position: 'relative'}}>
			<circle cx={35} cy={36} r={29} fill={t.shadow} opacity={0.22} />
			<circle cx={32} cy={32} r={29} fill={color} />
			{pen ? (
				<>
					<path d="M18 46 L22 36 L44 14 L50 20 L28 42 Z" fill={t.card} />
					<path d="M18 46 L22 36 L28 42 Z" fill={t.ink} />
				</>
			) : (
				<>
					<circle cx={32} cy={34} r={15} fill={t.card} />
					{hair === 0 && <path d="M17 32 C 17 18 47 18 47 32 C 40 26 24 26 17 32 Z" fill={t.ink} />}
					{hair === 1 && <path d="M17 34 C 15 14 49 14 47 34 C 44 24 20 24 17 34 Z" fill={t.ink} />}
					{hair === 2 && <path d="M18 30 C 22 16 42 16 46 30 C 38 24 26 24 18 30 Z" fill={t.ink} />}
					<circle cx={26.5} cy={35} r={2.2} fill={t.ink} />
					<circle cx={37.5} cy={35} r={2.2} fill={t.ink} />
					<path d="M26 41 Q 32 46 38 41" stroke={t.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
					{glasses && (
						<g fill="none" stroke={t.ink} strokeWidth={1.9}>
							<circle cx={26.5} cy={35} r={5.5} />
							<circle cx={37.5} cy={35} r={5.5} />
						</g>
					)}
				</>
			)}
		</svg>
	);
};
