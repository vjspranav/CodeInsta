import React from 'react';
import {Composition} from 'remotion';
import {Story} from './Story';
import {loadFaces} from './Fonts';
import {setActiveStyle} from './styles';
import {buildTimeline} from './timeline';
import {validateStory, StoryProps} from './schema';
import {FPS, H, W} from './theme';
import demo from '../fixtures/demo.json';
import demoManifest from '../fixtures/demo.manifest.json';

const defaults = (() => {
	const v = validateStory(demo);
	if (!v.ok) throw new Error(v.errors.join('\n'));
	return {script: v.story, audio: demoManifest} as StoryProps;
})();

export const Root: React.FC = () => (
	<Composition
		id="Story"
		component={Story as unknown as React.FC<Record<string, unknown>>}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={FPS * 30}
		defaultProps={defaults as unknown as Record<string, unknown>}
		calculateMetadata={async ({props}) => {
			const p = props as unknown as StoryProps;
			// measure with the real faces of the reel's style, like the renderer does
			const st = setActiveStyle(p.script.style);
			await loadFaces(st.families);
			return {durationInFrames: buildTimeline(p.script, p.audio).total};
		}}
	/>
);
