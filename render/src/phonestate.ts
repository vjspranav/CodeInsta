import type {PhoneEvent} from './timeline';
import {clamp01, easeInOut, lerp} from './theme';

export interface PhoneState {
	skeleton: boolean;
	liked: boolean;
	likedAt: number;
	spinnerSince?: number;
	toast?: {since: number; text: string; kind: string};
	instantSince?: number;
	instantLabel?: string;
	finger?: {x: number; y: number; t: number; press: number; fade: number};
	refreshing?: number;
}

/** Native (screen-space) coordinates of tap targets inside the 336x716 screen. */
export const TARGETS: Record<string, [number, number]> = {
	heart: [26, 527],
	post: [168, 354],
	comment: [66, 527],
	refresh: [168, 76],
	tab: [168, 690],
};

/** "like", "love", "like_button"... all mean the heart. */
export const normTarget = (t: unknown): string => {
	const s = String(t ?? 'heart').toLowerCase();
	if (/heart|like|love|fav/.test(s)) return 'heart';
	if (/image|photo|post|double/.test(s)) return 'post';
	if (/comment|reply/.test(s)) return 'comment';
	if (/refresh|pull|reload/.test(s)) return 'refresh';
	if (/tab|nav|home/.test(s)) return 'tab';
	return 'heart';
};

/** Finger arrives (and the tap lands) this many frames after the event: 8 f = 267 ms < 300 ms. */
export const TAP_ARRIVE = 8;
export const TAP_TOTAL = 44;
export const TOAST_FRAMES = 96;

/** Pure: everything observable about the phone at `f`, from its events. */
export const phoneStateAt = (events: PhoneEvent[], start: number, f: number): PhoneState => {
	const st: PhoneState = {skeleton: false, liked: false, likedAt: -999};
	for (const ev of events) {
		if (ev.frame < start || ev.frame > f) continue;
		const p = ev.props;
		switch (ev.kind) {
			case 'show':
				st.skeleton = p.state === 'loading';
				st.liked = false;
				st.spinnerSince = undefined;
				st.toast = undefined;
				break;
			case 'feed':
				st.liked = false; // a (re)loaded feed starts fresh
				st.skeleton = p.state === 'loading';
				st.spinnerSince = undefined;
				st.toast = undefined;
				if (!st.skeleton) st.refreshing = ev.frame;
				break;
			case 'tap': {
				const target = normTarget(p.target);
				const arrive = ev.frame + TAP_ARRIVE;
				if (f >= arrive && (target === 'heart' || target === 'post')) {
					// double-tap on the photo always likes; the heart button toggles
					st.liked = target === 'post' ? true : !st.liked;
					st.likedAt = arrive;
				}
				const tt = f - ev.frame;
				if (tt >= 0 && tt < TAP_TOTAL) {
					const [tx, ty] = TARGETS[target] ?? TARGETS.heart;
					const e = easeInOut(clamp01(tt / TAP_ARRIVE));
					const fade = tt > TAP_TOTAL - 10 ? 1 - (tt - (TAP_TOTAL - 10)) / 10 : clamp01(tt / 4);
					const leave = tt > TAP_ARRIVE + 12 ? easeInOut(clamp01((tt - TAP_ARRIVE - 12) / 18)) : 0;
					st.finger = {
						x: lerp(tx + 110, tx, e) + leave * 60,
						y: lerp(ty + 170, ty, e) + leave * 100,
						t: tt,
						press: tt >= TAP_ARRIVE && tt < TAP_ARRIVE + 6 ? 1 : 0,
						fade,
					};
				}
				break;
			}
			case 'spinner':
				st.spinnerSince = ev.frame;
				st.toast = undefined;
				break;
			case 'toast': {
				st.spinnerSince = undefined;
				st.toast = {since: ev.frame, text: String(p.text ?? 'Something went wrong'), kind: String(p.kind ?? 'error')};
				if ((p.kind ?? 'error') === 'error') st.liked = false;
				break;
			}
			case 'instant':
				st.skeleton = false;
				st.spinnerSince = undefined;
				st.instantSince = ev.frame;
				st.instantLabel = String(p.label ?? p.ms ?? '42 ms');
				break;
		}
	}
	if (st.toast && f >= st.toast.since + TOAST_FRAMES + 9) st.toast = undefined;
	return st;
};

/** Is the heart icon drawn filled (not replaced by the spinner, not skeleton)? */
export const heartVisual = (st: PhoneState): 'filled' | 'empty' | 'spinner' | 'hidden' =>
	st.skeleton ? 'hidden' : st.spinnerSince !== undefined ? 'spinner' : st.liked ? 'filled' : 'empty';
