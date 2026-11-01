/**
 * In node there is no canvas, so text.ts falls back to a hook that measures with the real
 * bundled fonts (fontkit). That keeps the pure caption/lower-third layout identical to the browser's.
 */
import * as fontkit from 'fontkit';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** family -> static faces (weight, file); the nearest weight wins, like the browser's font matching */
const FILES: Record<string, {w: number; file: string}[]> = {
	Excalifont: [{w: 400, file: 'Excalifont-Regular.woff2'}],
	Inter: [{w: 400, file: 'Inter-Variable.woff2'}],
	'JetBrains Mono': [{w: 400, file: 'JetBrainsMono-Regular.woff2'}, {w: 700, file: 'JetBrainsMono-Bold.woff2'}],
	Fraunces: [{w: 400, file: 'Fraunces-Regular.woff2'}, {w: 500, file: 'Fraunces-Medium.woff2'}],
	Oswald: [{w: 500, file: 'Oswald-Medium.woff2'}],
	Fredoka: [{w: 500, file: 'Fredoka-Medium.woff2'}, {w: 600, file: 'Fredoka-SemiBold.woff2'}],
	'Space Mono': [{w: 400, file: 'SpaceMono-Regular.woff2'}, {w: 700, file: 'SpaceMono-Bold.woff2'}],
};

const cache = new Map<string, fontkit.Font>();
const load = (file: string): fontkit.Font => {
	let f = cache.get(file);
	if (f) return f;
	const raw = fontkit.openSync(path.join(here, 'public', 'fonts', file));
	f = 'fonts' in raw ? (raw as unknown as {fonts: fontkit.Font[]}).fonts[0] : (raw as fontkit.Font);
	cache.set(file, f);
	return f;
};

export const installNodeMeasure = () => {
	(globalThis as Record<string, unknown>).__measureText = (text: string, family: string, size: number, weight: number) => {
		const faces = FILES[family] ?? FILES.Inter;
		const face = faces.reduce((best, x) => (Math.abs(x.w - weight) < Math.abs(best.w - weight) ? x : best));
		const f = load(face.file);
		return (f.layout(text).advanceWidth / f.unitsPerEm) * size;
	};
};
