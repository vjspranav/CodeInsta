import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {resetMeasureCache} from './text';

export const FACES = [
	{family: 'Excalifont', file: 'fonts/Excalifont-Regular.woff2', weight: '400'},
	{family: 'Inter', file: 'fonts/Inter-Variable.woff2', weight: '100 900'},
	{family: 'JetBrains Mono', file: 'fonts/JetBrainsMono-Regular.woff2', weight: '400'},
	{family: 'JetBrains Mono', file: 'fonts/JetBrainsMono-Bold.woff2', weight: '700'},
	{family: 'Fraunces', file: 'fonts/Fraunces-Regular.woff2', weight: '400'},
	{family: 'Fraunces', file: 'fonts/Fraunces-Medium.woff2', weight: '500'},
	{family: 'Oswald', file: 'fonts/Oswald-Medium.woff2', weight: '500'},
	{family: 'Fredoka', file: 'fonts/Fredoka-Medium.woff2', weight: '500'},
	{family: 'Fredoka', file: 'fonts/Fredoka-SemiBold.woff2', weight: '600'},
	{family: 'Space Mono', file: 'fonts/SpaceMono-Regular.woff2', weight: '400'},
	{family: 'Space Mono', file: 'fonts/SpaceMono-Bold.woff2', weight: '700'},
];

const loading = new Map<string, Promise<void>>();

/** Registers the bundled faces of `families` once, then drops text widths measured with a fallback font. */
export const loadFaces = (families: string[]): Promise<void> => {
	const key = [...families].sort().join('|');
	let hit = loading.get(key);
	if (!hit) {
		hit = Promise.all(
			FACES.filter((f) => families.includes(f.family)).map(async (f) => {
				const face = new FontFace(f.family, `url(${staticFile(f.file)})`, {weight: f.weight});
				await face.load();
				document.fonts.add(face);
			}),
		).then(() => resetMeasureCache());
		loading.set(key, hit);
	}
	return hit;
};

/** Loads the bundled fonts the active style needs and holds the render until they are ready. */
export const useFontsReady = (families: string[]): boolean => {
	const [ready, setReady] = useState(false);
	const [handle] = useState(() => delayRender('Loading fonts'));
	useEffect(() => {
		let alive = true;
		loadFaces(families)
			.then(() => {
				if (!alive) return;
				setReady(true);
				continueRender(handle);
			})
			.catch((e) => cancelRender(e));
		return () => {
			alive = false;
		};
	}, [handle, families.join('|')]);
	return ready;
};
