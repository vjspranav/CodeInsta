import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import type {StoryProps} from './schema';
import {buildTimeline, speakerAt} from './timeline';
import {beatAt} from './state';
import {useFontsReady} from './Fonts';
import {SceneView} from './components/SceneView';
import {CaptionRule, Captions, SpeakerRow} from './components/Captions';
import {DefineLowerThird, EndCard} from './components/Overlays';
import {Probe} from './components/Probe';
import {Texture} from './components/Texture';
import {StyleProvider, useStyle} from './styles/context';
import {setActiveStyle} from './styles';

const resolveSrc = (src: string) =>
	/^(https?:|data:|blob:)/.test(src) ? src : staticFile(src.replace(/^\.?\//, ''));

const Body: React.FC<StoryProps> = ({script, audio, probe}) => {
	const frame = useCurrentFrame();
	const st = useStyle();
	const ready = useFontsReady(st.families);
	const tl = useMemo(() => buildTimeline(script, audio), [script, audio, st.id, ready]);

	if (!ready) return <AbsoluteFill style={{background: st.tokens.paper}} />;

	const inEnd = tl.endCard.frames > 0 && frame >= tl.endCard.start;
	const scene = tl.scenes.find((s) => frame >= s.start && frame < s.end);
	const beat = beatAt(tl, frame);
	const lastBeat = speakerAt(tl, frame);

	return (
		<AbsoluteFill style={{background: st.tokens.paper, overflow: 'hidden', hyphens: 'none', wordBreak: 'normal', overflowWrap: 'normal'}}>
			<Texture layer="under" />
			{tl.beats.map((b) => (
				<Sequence key={b.index} from={b.start} durationInFrames={b.dur + 2} layout="none">
					<Audio src={resolveSrc(b.src)} />
				</Sequence>
			))}
			{!inEnd && (
				<>
					<SpeakerRow story={script} active={lastBeat?.speaker} />
					{scene && <SceneView scene={scene} tl={tl} frame={frame} />}
					{tl.defines.map((d, i) => (
						<DefineLowerThird key={i} d={d} frame={frame} />
					))}
					<CaptionRule />
					{beat && <Captions beat={beat} story={script} frame={frame} />}
				</>
			)}
			{inEnd && <EndCard story={script} start={tl.endCard.start} frame={frame} />}
			<Texture layer="over" />
			{probe && <Probe frame={frame} />}
		</AbsoluteFill>
	);
};

export const Story: React.FC<StoryProps> = (props) => {
	// set before any child renders so pure helpers (text measuring, caption chunking) see the same style
	setActiveStyle(props.script.style);
	return (
		<StyleProvider id={props.script.style}>
			<Body {...props} />
		</StyleProvider>
	);
};
