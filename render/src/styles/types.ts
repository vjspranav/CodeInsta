/** Style registry types. Every colour, font and skin choice of the renderer lives in a Style. */

export type StrokeMode = 'rough' | 'clean' | 'mono';
export type TextureKind = 'grain' | 'grid' | 'halftone' | 'scanlines' | 'none';
export type FontKey = 'hand' | 'ui' | 'mono';

export interface Tokens {
	paper: string; // background
	paperDeep: string;
	card: string; // panels / cards
	ink: string; // primary text + linework
	muted: string; // secondary text
	faint: string; // secondary strokes
	fill: string; // default panel fill (hatch)
	soft: string; // soft panels (skeletons, photos)
	accent: string; // strokes, highlights
	accentText: string; // accent used as text (>= 4.5:1 on paper and card)
	accentTint: string; // tinted panel fill for tone "accent"
	onAccent: string; // text on accent
	like: string; // the like heart
	ok: string; // success tick
	tags: string[]; // series colours (shards, feeds): strokes and tints only, never text
	cast: string[]; // cast palette (names, avatars)
	captionBg: string;
	captionFg: string;
	termBg: string;
	termFg: string;
	termDim: string;
	termPrompt: string;
	codeBg: string;
	codeFg: string;
	codeRule: string;
	bezel: string; // phone body
	bezelEdge: string;
	screen: string; // phone screen
	finger: string;
	fingerEdge: string;
	toastBg: string;
	toastFg: string;
	shadow: string; // offset shadow colour (only used by skins that cast one)
}

export interface FontFace {
	fontFamily: string;
	fontWeight: number;
}

export interface Skin {
	panel: {
		outline: boolean;
		width: number;
		radius: number;
		shadow: {dx: number; dy: number; opacity: number} | null;
		hatch: 'rough' | 'solid' | 'lines' | 'dots' | 'none';
		double: boolean; // box-drawing double border
		ticks: boolean; // blueprint corner marks
	};
	note: 'sticky' | 'rule' | 'bracket' | 'box';
	phone: {radius: number; screenRadius: number; bezel: 'rough' | 'solid' | 'outline'};
	caption: {band: boolean; font: FontKey; rule: 'dash' | 'line' | 'none'};
	term: {chrome: 'dots' | 'prompt' | 'none'; radius: number};
	arrow: {head: 'open' | 'filled'; dash: boolean; width: number};
	avatar: 'doodle' | 'monogram-circle' | 'monogram-square' | 'face-flat';
	/** how hard captions and labels are tracked / cased */
	label: {upper: boolean; tracking: number};
}

export interface Texture {
	kind: TextureKind;
	layer: 'over' | 'under';
	color: string;
	opacity: number;
	size: number;
}

export interface Style {
	id: string;
	label: string;
	tokens: Tokens;
	font: Record<FontKey, FontFace>;
	/** font families (see Fonts.tsx FACES) this style needs loaded */
	families: string[];
	stroke: StrokeMode;
	texture: Texture;
	skin: Skin;
	/** true: use the colours the script gives its cast when they pass 4.5:1; else the palette */
	castFromScript: boolean;
}
