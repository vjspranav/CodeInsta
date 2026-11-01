import type {BeatT} from './timeline';
import {lin} from './theme';
import {measure, wrap} from './text';
import {getStyle} from './styles';
import {estimateWordTimes} from './sync';

export interface Chunk {
	lines: string[];
	chars: number;
	f0: number; // fraction of the beat
	f1: number;
}
export interface Chunked {
	fs: number;
	chunks: Chunk[];
}

export const TEXT_W = 536;
const cache = new Map<string, Chunked>();

/** Split a line into chunks of at most 2 rendered lines; larger font first. */
export const chunkText = (text: string): Chunked => {
	const st = getStyle();
	const font = st.skin.caption.font;
	const key = `${st.id}|${text}`;
	const hit = cache.get(key);
	if (hit) return hit;
	let fs = 50;
	let lines: string[] = [];
	let single = false;
	for (const size of [52, 48, 44, 40, 37]) {
		lines = wrap(text, font, size, TEXT_W);
		fs = size;
		if (lines.length <= 2) {
			single = true;
			break;
		}
	}
	let chunks: Chunk[];
	if (single) {
		chunks = [{lines, chars: text.length, f0: 0, f1: 1}];
	} else {
		// an unbreakable word (a path, an identifier) must fit the width too: shrink until it does
		for (const size of [44, 40, 37, 34]) {
			fs = size;
			lines = wrap(text, font, fs, TEXT_W);
			if (lines.every((l) => measure(l, font, size) <= TEXT_W)) break;
		}
		const groups: string[][] = [];
		for (let i = 0; i < lines.length; i += 2) groups.push(lines.slice(i, i + 2));
		// avoid an orphan last chunk with a single short line: merge balance
		const total = lines.join(' ').length;
		let acc = 0;
		chunks = groups.map((g) => {
			const chars = g.join(' ').length;
			const c = {lines: g, chars, f0: acc / total, f1: (acc + chars) / total};
			acc += chars + 1;
			return c;
		});
		chunks[chunks.length - 1].f1 = 1;
	}
	const res = {fs, chunks};
	cache.set(key, res);
	return res;
};


export interface CaptionWord {
	word: string;
	line: number;
	reveal: number;
}

export interface CaptionState {
	fs: number;
	chunk: number;
	chunks: number;
	lines: string[];
	words: CaptionWord[];
	/** words with opacity>0.5 at the frame (what the viewer can read) */
	visible: string[];
	text: string;
}

/**
 * Pure: the caption chunk shown at `frame`, with per-word reveal frames from the estimated word times
 * (src/sync.ts estimateWordTimes: weighted by spoken length, punctuation pauses), not from character positions.
 */
export const captionStateAt = (beat: BeatT, frame: number): CaptionState => {
	const {fs, chunks} = chunkText(beat.text);
	const times = estimateWordTimes(beat.text, (beat.dur / 30) * 1000);
	const toFrame = (ms: number) => beat.start + (ms / 1000) * 30;
	// index of the first word of each chunk
	const firstWord: number[] = [];
	let n = 0;
	for (const ch of chunks) {
		firstWord.push(n);
		n += ch.lines.join(' ').split(' ').filter(Boolean).length;
	}
	let ci = 0;
	chunks.forEach((_, i) => {
		const w = times[Math.min(firstWord[i], times.length - 1)];
		if (i === 0 || frame >= toFrame(w.start_ms) - 0.0001) ci = i;
	});
	const ch = chunks[ci];
	let k = firstWord[ci];
	const words: CaptionWord[] = [];
	ch.lines.forEach((line, li) => {
		for (const w of line.split(' ').filter(Boolean)) {
			const wt = times[Math.min(k, times.length - 1)];
			words.push({word: w, line: li, reveal: toFrame(wt.start_ms) - 1});
			k++;
		}
	});
	const visible = words.filter((w) => lin(frame, w.reveal, 5) > 0.5).map((w) => w.word);
	return {fs, chunk: ci, chunks: chunks.length, lines: ch.lines, words, visible, text: ch.lines.join(' ')};
};
