import React from 'react';
import {spring, useVideoConfig} from 'remotion';
import type {PhoneEvent} from '../timeline';
import {phoneStateAt, TAP_ARRIVE, TOAST_FRAMES} from '../phonestate';
import type {PhoneState} from '../phonestate';
import {clamp01, lin, prog, Rect} from '../theme';
import {Draw, rPath, roundedRectPath, Svg} from '../sketch';
import {useStyle} from '../styles/context';
import {bestOn} from '../styles';

const NW = 360;
const NH = 740;
const SX = 12;
const SY = 12;
const SW = 336;
const SH = 716;

const HEART_PATH =
	'M12 21.2 C 5 15.4 2 12 2 8.2 C 2 5 4.4 3 7 3 C 9 3 10.8 4.1 12 5.9 C 13.2 4.1 15 3 17 3 C 19.6 3 22 5 22 8.2 C 22 12 19 15.4 12 21.2 Z';

const Heart: React.FC<{size: number; fill?: string; stroke?: string; sw?: number}> = ({size, fill = 'none', stroke, sw = 2}) => {
	const k = useStyle().tokens;
	return (
		<svg width={size} height={size} viewBox="0 0 24 24">
			<path d={HEART_PATH} fill={fill} stroke={stroke ?? k.ink} strokeWidth={sw} strokeLinejoin="round" />
		</svg>
	);
};

const Icon: React.FC<{d: string; size?: number}> = ({d, size = 26}) => {
	const k = useStyle().tokens;
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={k.ink} strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round">
			<path d={d} />
		</svg>
	);
};

const Skel: React.FC<{x: number; y: number; w: number; h: number; r?: number; frame: number}> = ({x, y, w, h, r = 6, frame}) => {
	const k = useStyle().tokens;
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width: w,
				height: h,
				borderRadius: r,
				background: k.soft,
				opacity: 0.7 + 0.3 * Math.sin(frame / 7),
			}}
		/>
	);
};

const Spinner: React.FC<{size: number; frame: number; slow?: boolean}> = ({size, frame}) => {
	const k = useStyle().tokens;
	const rot = (frame * 11) % 360;
	return (
		<svg data-spinner width={size} height={size} viewBox="0 0 24 24" style={{transform: `rotate(${rot}deg)`}}>
			<circle cx={12} cy={12} r={9} fill="none" stroke={k.faint} strokeWidth={3} />
			<path d="M12 3 A9 9 0 0 1 21 12" fill="none" stroke={k.ink} strokeWidth={3} strokeLinecap="round" />
		</svg>
	);
};

const Finger: React.FC<{x: number; y: number; press: number; fade: number}> = ({x, y, press, fade}) => {
	const k = useStyle().tokens;
	return (
	<svg
		width={46}
		height={62}
		viewBox="0 0 23 31"
		style={{position: 'absolute', left: x - 20, top: y - 2, opacity: fade, transform: `scale(${press ? 0.92 : 1})`, transformOrigin: '20px 2px', zIndex: 30}}
	>
		<path
			d="M8 2.2 C 8 1 9 0.5 10 0.5 C 11 0.5 12 1 12 2.2 L 12 11 C 12.6 10.4 13.6 10.2 14.3 10.5 C 15 10.8 15.4 11.2 15.4 11.2 C 16 10.7 17 10.7 17.6 11.1 C 18.2 11.5 18.4 12 18.4 12 C 19.4 11.8 20.6 12.4 20.8 13.8 L 21 20 C 21 25 18.5 29.5 14 29.5 L 11.6 29.5 C 9 29.5 7.8 28.4 6.4 26.6 L 2.4 20.6 C 1.6 19.4 2.6 18 4 18.4 L 8 20.4 Z"
			fill={k.finger}
			stroke={k.fingerEdge}
			strokeWidth={1.4}
			strokeLinejoin="round"
		/>
		<path d="M12.3 14 L12.3 19 M15.4 13.4 L15.4 19 M18.4 14 L18.4 19" stroke={k.fingerEdge} strokeWidth={0.9} strokeLinecap="round" fill="none" />
	</svg>
	);
};

const POSTS = [
	{user: 'maya.codes', caption: 'shipping on a friday what could go wrong', likes: '1,204'},
	{user: 'trail_notes', caption: 'sunrise ridge, worth the 5am alarm', likes: '3,871'},
];

const FeedPost: React.FC<{
	st: PhoneState;
	frame: number;
	top: number;
	post: (typeof POSTS)[number];
	interactive: boolean;
	pop: number;
}> = ({st, frame, top, post, interactive}) => {
	const sty = useStyle();
	const k = sty.tokens;
	const sinceLike = frame - st.likedAt;
	const likedNow = interactive && st.liked;
	const heartScale = likedNow && sinceLike < 22 ? 1 + 0.45 * Math.sin(Math.min(1, sinceLike / 14) * Math.PI) + (sinceLike < 5 ? -0.2 * (sinceLike / 5) : 0) : 1;
	const spin = interactive && st.spinnerSince !== undefined;
	const count = post.likes === '1,204' ? (likedNow ? '1,205' : '1,204') : post.likes;
	const rf = st.refreshing !== undefined ? prog(frame, st.refreshing, 12) : 1;
	return (
		<div style={{position: 'absolute', left: 0, top: top + (1 - rf) * -14, width: SW, opacity: 0.4 + 0.6 * rf}}>
			<div style={{display: 'flex', alignItems: 'center', height: 44, padding: '0 12px'}}>
				<div style={{width: 30, height: 30, borderRadius: 15, background: k.fill, border: `2px solid ${k.accent}`, boxSizing: 'border-box'}} />
				<div style={{marginLeft: 9, ...sty.font.ui, fontWeight: 700, fontSize: 13, color: k.ink}}>{post.user}</div>
				<div style={{marginLeft: 'auto', ...sty.font.ui, fontWeight: 800, color: k.ink, letterSpacing: 2}}>···</div>
			</div>
			<div style={{position: 'relative', width: SW, height: 300, background: k.soft, overflow: 'hidden'}}>
				<svg width={SW} height={300} viewBox={`0 0 ${SW} 300`}>
					<circle cx={236} cy={86} r={30} fill={k.fill} />
					<path d="M0 262 L84 150 L140 216 L196 128 L296 262 Z" fill={k.fill} stroke={k.faint} strokeWidth={2} strokeLinejoin="round" />
					<path d="M0 262 H336" stroke={k.faint} strokeWidth={2} />
				</svg>
				{interactive && st.liked && st.likedAt + 0 <= frame && sinceLike >= 0 && sinceLike < 26 && (
					<div style={{position: 'absolute', left: 124, top: 94, transform: `scale(${0.4 + 1.1 * spring({frame: sinceLike, fps: 30, config: {damping: 9, stiffness: 160, mass: 0.6}})})`, opacity: 1 - lin(sinceLike, 12, 14)}}>
						<Heart size={88} fill={k.like} stroke={k.like} />
					</div>
				)}
			</div>
			<div style={{display: 'flex', alignItems: 'center', height: 46, padding: '0 12px', gap: 16}}>
				<div data-heart data-heart-state={spin ? 'spinner' : likedNow ? 'filled' : 'empty'} style={{width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${heartScale})`}}>
					{spin ? (
						<Spinner size={24} frame={frame - (st.spinnerSince ?? 0)} />
					) : (
						<Heart size={28} fill={likedNow ? k.like : 'none'} stroke={likedNow ? k.like : k.ink} sw={2.1} />
					)}
				</div>
				<Icon d="M21 11.5 C 21 16 17 19.5 12 19.5 C 10.6 19.5 9.3 19.2 8.2 18.7 L 3.5 20 L 4.9 15.9 C 3.7 14.7 3 13.2 3 11.5 C 3 7.4 7 4 12 4 C 17 4 21 7.4 21 11.5 Z" size={27} />
				<Icon d="M21 3 L10 14 M21 3 L14 21 L10 14 L3 10 Z" size={26} />
				<div style={{marginLeft: 'auto'}}>
					<Icon d="M6 3 H18 V21 L12 16.5 L6 21 Z" size={26} />
				</div>
			</div>
			<div style={{padding: '0 12px', ...sty.font.ui, fontSize: 13, fontWeight: 700, color: k.ink}}>
				{spin ? 'Liking…' : `${count} likes`}
			</div>
			<div style={{padding: '3px 12px', ...sty.font.ui, fontSize: 13, color: k.ink, lineHeight: 1.3}}>
				<b>{post.user}</b> {post.caption}
			</div>
		</div>
	);
};

export const PhoneMock: React.FC<{
	events: PhoneEvent[];
	start: number;
	frame: number;
	body: Rect;
	scale: number;
}> = ({events, start, frame, body, scale}) => {
	const sty = useStyle();
	const k = sty.tokens;
	const pk = sty.skin.phone;
	const {fps} = useVideoConfig();
	const t = frame - start;
	if (t < 0) return null;
	const draw = prog(frame, start, 8);
	const screen = prog(frame, start + 1, 7);
	const st = phoneStateAt(events, start, frame);
	const pop = spring({frame: t, fps, config: {damping: 13, stiffness: 120, mass: 0.7}});
	const toastP = st.toast ? prog(frame, st.toast.since, 9) * (1 - prog(frame, st.toast.since + TOAST_FRAMES, 9)) : 0;
	const instP = st.instantSince !== undefined ? prog(frame, st.instantSince, 10) : 0;
	const instGone = st.instantSince !== undefined ? lin(frame, st.instantSince + 120, 12) : 0;
	const slowT = st.spinnerSince !== undefined ? frame - st.spinnerSince : 0;

	return (
		<div
			data-phone
			style={{
				position: 'absolute',
				left: body.x,
				top: body.y,
				width: NW,
				height: NH,
				transformOrigin: '0 0',
				transform: `scale(${scale * (0.95 + 0.05 * pop)})`,
			}}
		>
			<Svg w={NW} h={NH}>
				{sty.skin.panel.shadow && <rect x={4 + sty.skin.panel.shadow.dx} y={4 + sty.skin.panel.shadow.dy} width={NW - 8} height={NH - 8} rx={pk.radius} fill={k.shadow} opacity={sty.skin.panel.shadow.opacity * clamp01(draw * 2)} />}
				<rect x={4} y={4} width={NW - 8} height={NH - 8} rx={pk.radius} fill={k.bezel} opacity={clamp01(draw * 2)} />
				<Draw paths={rPath(roundedRectPath(3, 3, NW - 6, NH - 6, pk.radius), 11, {roughness: 0.9, strokeWidth: 3})} p={draw} color={k.bezelEdge} width={pk.bezel === 'rough' ? 3.5 : pk.bezel === 'outline' ? 3 : 2} />
			</Svg>
			<div
				style={{
					position: 'absolute',
					left: SX,
					top: SY,
					width: SW,
					height: SH,
					borderRadius: pk.screenRadius,
					background: k.screen,
					overflow: 'hidden',
					clipPath: `inset(0 0 ${(1 - screen) * 100}% 0 round ${pk.screenRadius}px)`,
					...sty.font.ui,
				}}
			>
				{/* status bar */}
				<div style={{position: 'absolute', top: 0, left: 0, width: SW, height: 40}}>
					<div style={{position: 'absolute', left: 26, top: 12, fontSize: 14, fontWeight: 700, color: k.ink}}>9:41</div>
					<div style={{position: 'absolute', left: 124, top: 8, width: 88, height: 24, borderRadius: 12, background: k.bezel, border: `1px solid ${k.bezelEdge}`, boxSizing: 'border-box'}} />
					<div style={{position: 'absolute', right: 24, top: 14, width: 24, height: 12, border: `1.8px solid ${k.ink}`, borderRadius: 4}}>
						<div style={{width: 14, height: 6, margin: 1.5, background: k.ink, borderRadius: 1.5}} />
					</div>
				</div>
				{/* app header */}
				<div style={{position: 'absolute', top: 42, left: 0, width: SW, height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: `1px solid ${k.soft}`}}>
					<div style={{fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: k.ink, fontStyle: 'italic'}}>Gramly</div>
					<div style={{marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center'}}>
						<Heart size={24} />
						<Icon d="M21 3 L10 14 M21 3 L14 21 L10 14 L3 10 Z" size={24} />
					</div>
				</div>
				{/* stories */}
				<div style={{position: 'absolute', top: 90, left: 0, width: SW, height: 70, display: 'flex', gap: 12, padding: '8px 12px'}}>
					{[0, 1, 2, 3, 4].map((i) =>
						st.skeleton ? (
							<div key={i} style={{width: 50, height: 50, borderRadius: 25, background: k.soft, opacity: 0.7 + 0.3 * Math.sin(frame / 7 + i)}} />
						) : (
							<div key={i} style={{width: 50, height: 50, borderRadius: 25, border: `2.5px solid ${i < 2 ? k.accent : k.faint}`, padding: 3, boxSizing: 'border-box'}}>
								<div style={{width: '100%', height: '100%', borderRadius: '50%', background: k.fill}} />
							</div>
						),
					)}
				</div>
				{/* feed */}
				<div style={{position: 'absolute', top: 160, left: 0, width: SW, height: 500, overflow: 'hidden'}}>
					{st.skeleton ? (
						<>
							<Skel x={12} y={6} w={30} h={30} r={15} frame={frame} />
							<Skel x={50} y={14} w={110} h={14} frame={frame} />
							<Skel x={0} y={46} w={SW} h={300} r={0} frame={frame} />
							<Skel x={12} y={360} w={90} h={14} frame={frame} />
							<Skel x={12} y={384} w={230} h={12} frame={frame} />
							<Skel x={12} y={406} w={170} h={12} frame={frame} />
						</>
					) : (
						<FeedPost st={st} frame={frame} top={0} post={POSTS[0]} interactive pop={pop} />
					)}
				</div>
				{/* tab bar */}
				<div style={{position: 'absolute', bottom: 0, left: 0, width: SW, height: 56, background: k.screen, borderTop: `1px solid ${k.soft}`, display: 'flex', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 6}}>
					<Icon d="M3 11 L12 3 L21 11 V21 H15 V14 H9 V21 H3 Z" />
					<Icon d="M11 4 a7 7 0 1 0 0.01 0 M16 16 L21 21" />
					<Icon d="M4 4 H20 V20 H4 Z M12 8 V16 M8 12 H16" />
					<Heart size={26} />
					<div style={{width: 26, height: 26, borderRadius: 13, background: k.fill, border: `2px solid ${k.ink}`, boxSizing: 'border-box'}} />
				</div>
				{/* hanging hint */}
				{st.spinnerSince !== undefined && slowT > 40 && (
					<div style={{position: 'absolute', left: 12, top: 612, fontSize: 12, color: k.muted, ...sty.font.ui, opacity: prog(frame, st.spinnerSince + 40, 10)}}>
						still trying… {(slowT / 30).toFixed(1)}s
					</div>
				)}
				{/* instant badge */}
				{st.instantSince !== undefined && (
					<div
						style={{
							position: 'absolute',
							right: 14,
							top: 98,
							padding: '4px 10px',
							borderRadius: 14,
							background: k.accent,
							color: k.onAccent,
							fontSize: 14,
							fontWeight: 800,
							opacity: instP * (1 - instGone),
							transform: `translateY(${(1 - instP) * -10}px) scale(${0.9 + 0.1 * instP})`,
						}}
					>
						{st.instantLabel}
					</div>
				)}
				{/* toast */}
				{st.toast && toastP > 0 && (
					<div
						data-toast
						data-text={st.toast.text}
						style={{
							position: 'absolute',
							left: 20,
							right: 20,
							bottom: 70,
							transform: `translateY(${(1 - toastP) * 60}px)`,
							opacity: Math.min(1, toastP * 2),
							background: k.toastBg,
							color: k.toastFg,
							borderRadius: 14,
							padding: '12px 14px',
							fontSize: 14,
							fontWeight: 600,
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							lineHeight: 1.25,
						}}
					>
						<div style={{width: 22, height: 22, borderRadius: 11, background: st.toast.kind === 'error' ? k.accent : k.ok, color: bestOn(st.toast.kind === 'error' ? k.accent : k.ok, k.toastFg, k.toastBg), fontWeight: 800, textAlign: 'center', lineHeight: '22px', flex: '0 0 22px'}}>
							{st.toast.kind === 'error' ? (
								'!'
							) : (
								<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" style={{display: 'block'}}>
									<path d="M6 12.5 L10.5 17 L18 7.5" />
								</svg>
							)}
						</div>
						<div>{st.toast.text}</div>
					</div>
				)}
				{st.finger && (
					<>
						{st.finger.t >= TAP_ARRIVE && st.finger.t < TAP_ARRIVE + 16 && (
							<div
								style={{
									position: 'absolute',
									left: st.finger.x - 24,
									top: st.finger.y - 24,
									width: 48,
									height: 48,
									borderRadius: 24,
									border: `3px solid ${k.accent}`,
									boxSizing: 'border-box',
									opacity: 1 - lin(st.finger.t, TAP_ARRIVE, 16),
									transform: `scale(${0.4 + 1.2 * lin(st.finger.t, TAP_ARRIVE, 16)})`,
								}}
							/>
						)}
						<Finger x={st.finger.x} y={st.finger.y} press={st.finger.press} fade={st.finger.fade} />
					</>
				)}
			</div>
		</div>
	);
};
