import React from 'react';
import type {BeatT} from '../timeline';
import type {CastMember, Story} from '../schema';
import {NARRATOR_ID} from '../schema';
import {CAPTION_AREA, lin, prog} from '../theme';
import {captionStateAt} from '../captionstate';
import {Avatar} from './Doodle';
import {Draw, rLine, Svg} from '../sketch';
import {useStyle} from '../styles/context';
import {castColor, getStyle, mixHex} from '../styles';
import type {Style} from '../styles';

/** Speaker with the colour the style gives them (script colour when it passes 4.5:1 and the style allows it). */
export const speakerInfo = (story: Story, id: string, style: Style = getStyle()): CastMember => {
	if (id === NARRATOR_ID) return {id, name: 'Narrator', role: 'narrator', color: style.tokens.muted};
	const i = story.cast.findIndex((c) => c.id === id);
	if (i < 0) return {id, name: id, role: '', color: style.tokens.muted};
	return {...story.cast[i], color: castColor(style, story.cast[i].color, i)};
};

export const wantsGlasses = (c: CastMember) => /senior|staff|lead|principal|mentor/i.test(`${c.role} ${c.name}`);

export const SpeakerTag: React.FC<{c: CastMember; size: number}> = ({c, size}) => (
	<Avatar id={c.id} name={c.name} color={c.color} size={size} pen={c.id === NARRATOR_ID} glasses={wantsGlasses(c)} />
);

export const Captions: React.FC<{beat: BeatT; story: Story; frame: number}> = ({beat, story, frame}) => {
	const st = useStyle();
	const t = st.tokens;
	const c = speakerInfo(story, beat.speaker, st);
	const cs = captionStateAt(beat, frame);
	const {fs} = cs;
	const capFont = st.font[st.skin.caption.font];
	const nameIn = prog(frame, beat.start, 8);
	const lineH = fs * 1.2;
	return (
		<div data-caption style={{position: 'absolute', left: CAPTION_AREA.x, top: CAPTION_AREA.y, width: CAPTION_AREA.w, height: CAPTION_AREA.h}}>
			<div style={{display: 'flex', alignItems: 'center', gap: 12, height: 56, opacity: nameIn, transform: `translateX(${(1 - nameIn) * -14}px)`}}>
				<div style={{width: 48, height: 48, position: 'relative'}}>
					<SpeakerTag c={c} size={48} />
				</div>
				<div data-label data-caption-name style={{...st.font.hand, fontSize: 34, color: c.color, lineHeight: 1}}>{c.name}</div>
				<div data-label style={{...st.font.hand, fontWeight: Math.min(st.font.hand.fontWeight, 500), fontSize: 22, color: t.muted, marginTop: 6, whiteSpace: 'nowrap'}}>{c.id === NARRATOR_ID ? '' : c.role}</div>
			</div>
			<div data-caption-text style={{marginTop: 14, width: '100%', textAlign: 'center', ...capFont, fontSize: fs, lineHeight: `${lineH}px`, color: t.captionFg}}>
				{cs.lines.map((_line, li) => {
					const ws = cs.words.filter((w) => w.line === li);
					return (
						<div key={li} data-line style={{height: lineH, whiteSpace: 'nowrap'}}>
							{ws.map((w, wi) => {
								const q = lin(frame, w.reveal, 5);
								const fresh = 1 - lin(frame, w.reveal + 3, 9);
								return (
									<span
										key={wi}
										data-word
										style={{
											display: 'inline-block',
											opacity: q,
											transform: `translateY(${(1 - q) * 8}px)`,
											color: fresh > 0.02 ? mixHex(t.captionFg, t.accentText, fresh) : t.captionFg,
											marginRight: wi < ws.length - 1 ? fs * 0.28 : 0,
										}}
									>
										{w.word}
									</span>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
};

/** Divider above the captions; some styles also paint a caption band behind them. */
export const CaptionRule: React.FC = () => {
	const st = useStyle();
	const t = st.tokens;
	const rule = st.skin.caption.rule;
	return (
		<>
			{st.skin.caption.band && <div data-caption-band style={{position: 'absolute', left: 0, top: 992, width: 720, height: 288, background: t.captionBg}} />}
			{rule !== 'none' && (
				<Svg w={720} h={1280}>
					<Draw paths={rLine(36, 992, 684, 992, 7, {roughness: 1.2, strokeWidth: 2})} p={1} color={st.stroke === 'rough' ? t.fill : t.faint} width={2} dashed={rule === 'dash'} />
				</Svg>
			)}
		</>
	);
};

export const SpeakerRow: React.FC<{story: Story; active?: string}> = ({story, active}) => {
	const st = useStyle();
	const t = st.tokens;
	const people: CastMember[] = [speakerInfo(story, 'narrator', st), ...story.cast.map((m) => speakerInfo(story, m.id, st))];
	const size = 50;
	return (
		<div style={{position: 'absolute', left: 36, top: 22, width: 648, height: 76, display: 'flex', gap: 22}}>
			{people.map((c) => {
				const on = active === c.id;
				const s = on ? 1.1 : 0.92;
				return (
					<div key={c.id} style={{width: 70, textAlign: 'center', opacity: on ? 1 : 0.5, transform: `scale(${s})`, transformOrigin: '50% 40%'}}>
						<div style={{width: size, height: size, margin: '0 auto', position: 'relative'}}>
							<SpeakerTag c={c} size={size} />
						</div>
						<div style={{...st.font.hand, fontWeight: Math.min(st.font.hand.fontWeight, 500), fontSize: 17, color: on ? c.color : t.muted, marginTop: 2, whiteSpace: 'nowrap', lineHeight: 1}}>{c.name}</div>
					</div>
				);
			})}
		</div>
	);
};
