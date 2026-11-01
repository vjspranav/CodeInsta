import React from 'react';
import {H, W} from '../theme';
import {useStyle} from '../styles/context';

/** Background texture of the active style: paper grain, blueprint grid, halftone dots, scanlines. */
export const Texture: React.FC<{layer: 'over' | 'under'}> = ({layer}) => {
	const st = useStyle();
	const tx = st.texture;
	if (tx.kind === 'none' || tx.layer !== layer) return null;
	const base: React.CSSProperties = {position: 'absolute', left: 0, top: 0, pointerEvents: 'none'};
	if (tx.kind === 'grain') {
		return (
			<svg width={W} height={H} style={{...base, mixBlendMode: 'multiply'}}>
				<filter id="paper-grain" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={11} stitchTiles="stitch" />
					<feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.40  0 0 0 0 0.30  0 0 0 0.9 -0.34" />
				</filter>
				<rect width={W} height={H} filter="url(#paper-grain)" opacity={tx.opacity} />
			</svg>
		);
	}
	if (tx.kind === 'grid') {
		const g = tx.size;
		return (
			<svg width={W} height={H} style={base}>
				<defs>
					<pattern id="bp-minor" width={g} height={g} patternUnits="userSpaceOnUse">
						<path d={`M ${g} 0 H 0 V ${g}`} fill="none" stroke={tx.color} strokeWidth={1} opacity={tx.opacity * 0.55} />
					</pattern>
					<pattern id="bp-major" width={g * 5} height={g * 5} patternUnits="userSpaceOnUse">
						<path d={`M ${g * 5} 0 H 0 V ${g * 5}`} fill="none" stroke={tx.color} strokeWidth={1.4} opacity={tx.opacity} />
					</pattern>
				</defs>
				<rect width={W} height={H} fill="url(#bp-minor)" />
				<rect width={W} height={H} fill="url(#bp-major)" />
			</svg>
		);
	}
	if (tx.kind === 'halftone') {
		const g = tx.size;
		return (
			<svg width={W} height={H} style={base}>
				<defs>
					<pattern id="halftone" width={g} height={g} patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
						<circle cx={g / 2} cy={g / 2} r={g * 0.22} fill={tx.color} opacity={tx.opacity} />
					</pattern>
				</defs>
				<rect width={W} height={H} fill="url(#halftone)" />
			</svg>
		);
	}
	// scanlines
	const g = tx.size;
	return (
		<svg width={W} height={H} style={base}>
			<defs>
				<pattern id="scan" width={W} height={g} patternUnits="userSpaceOnUse">
					<rect width={W} height={g / 2} fill={tx.color} opacity={tx.opacity} />
				</pattern>
			</defs>
			<rect width={W} height={H} fill="url(#scan)" />
		</svg>
	);
};
