import React from 'react';
import type {Scene, Timeline} from '../timeline';
import {easeOut, lin, Rect} from '../theme';
import {useStyle} from '../styles/context';
import {Draw, rRect, seedOf, Svg} from '../sketch';
import {CacheBox, CodeCard, CommitStory, SketchBox, SketchNote, Terminal} from './Items';
import {DBStage} from './DBTable';
import {PhoneMock} from './PhoneMock';
import {SketchArrow} from './SketchArrow';
import {KIT_VIEWS} from './Kits';

const FOCUS_DIM = 0.4;

export const SceneView: React.FC<{scene: Scene; tl: Timeline; frame: number}> = ({scene, tl, frame}) => {
	const t = useStyle().tokens;
	// current focus
	let focus: {frame: number; id?: string} | undefined;
	for (const f of scene.focus) if (f.frame <= frame) focus = f;
	const focusId = focus?.id;
	const keyOf = (id: string) => scene.items.find((i) => i.id === id || i.key === id);
	const focusItem = focusId ? keyOf(focusId) : undefined;
	const focusPhone = focusId === 'phone';
	const anyFocus = !!(focusItem || focusPhone);

	const rectOf = (id: string): Rect | undefined => {
		if (id === 'phone') return scene.phone?.body;
		return keyOf(id)?.rect;
	};

	return (
		<>
			{scene.phone && (
				<div style={{opacity: anyFocus && !focusPhone ? FOCUS_DIM : 1}}>
					<PhoneMock events={tl.phoneEvents} start={scene.phone.start} frame={frame} body={scene.phone.body} scale={scene.phone.scale} />
				</div>
			)}
			{scene.items.map((it) => {
				if (frame < it.start) return null;
				const dim = anyFocus && focusItem !== it;
				switch (it.kind) {
					case 'box':
						return <SketchBox key={it.key} item={it} frame={frame} dim={dim} />;
					case 'note':
						return <SketchNote key={it.key} item={it} frame={frame} dim={dim} />;
					case 'cache':
						return <CacheBox key={it.key} item={it} frame={frame} dim={dim} />;
					case 'term':
						return <Terminal key={it.key} item={it} frame={frame} dim={dim} />;
					case 'code':
						return <CodeCard key={it.key} item={it} frame={frame} dim={dim} />;
					case 'commit':
						return <CommitStory key={it.key} item={it} frame={frame} dim={dim} />;
					case 'seq':
					case 'tree':
					case 'track':
					case 'packets':
					case 'editor':
					case 'plot': {
						const View = KIT_VIEWS[it.kind];
						return <View key={it.key} item={it} frame={frame} dim={dim} />;
					}
					case 'db':
						return (
							<DBStage
								key={it.key}
								events={it.props.events as {frame: number; action: import('../schema').Action}[]}
								rect={it.rect}
								frame={frame}
								dim={dim}
							/>
						);
				}
			})}
			{scene.arrows.map((ar, i) => {
				const a = rectOf(ar.from);
				const b = rectOf(ar.to);
				if (!a || !b) return null;
				const ia = keyOf(ar.from);
				const ib = keyOf(ar.to);
				const start = Math.max(ar.start, ia?.start ?? 0, ib?.start ?? 0);
				return <SketchArrow key={i} from={a} to={b} start={start} frame={frame} label={ar.label} bend={ar.bend} seedKey={`${scene.index}-${i}`} color={t.ink} />;
			})}
			{focus && (focusItem || focusPhone) && <FocusRing rect={(focusPhone ? scene.phone!.body : focusItem!.rect)} start={focus.frame} frame={frame} />}
		</>
	);
};

const FocusRing: React.FC<{rect: Rect; start: number; frame: number}> = ({rect, start, frame}) => {
	const t = useStyle().tokens;
	const p = easeOut(lin(frame, start, 14));
	const pad = 10;
	return (
		<Svg w={720} h={1280} style={{pointerEvents: 'none'}}>
			<Draw
				paths={rRect(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2, seedOf(`focus${start}${rect.x}`), {roughness: 1.4})}
				p={p}
				color={t.accent}
								width={4}
			/>
		</Svg>
	);
};
