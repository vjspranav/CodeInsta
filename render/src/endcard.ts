import type {Story} from './schema';
import {measure, wrap} from './text';
import {FPS} from './theme';

/** End card: the WHOLE glossary (paginated when it does not fit) plus up to 3 key points. Never read aloud. */
export const END_TOP = 150;
export const END_BOTTOM = 1130; // bottomMeta zone starts at 1140
export const END_X = 60;
export const END_W = 530; // text runs x 60..590, left of the rightRail zone (x 610)
export const END_HEAD = 90;
const ns = (fs: number) => Math.max(22, fs * 0.66);
export const endNoteSize = ns;

export interface EndBlock {
	kind: 'g' | 'p';
	term?: string;
	lines: string[];
	note: string[];
	h: number;
}
export interface EndPage {
	fs: number;
	blocks: EndBlock[];
	frames: number;
	/** "Word list (2/3)" style suffix when the glossary spans pages */
	suffix: string;
}

/** "TERM · Full form"; just the term when the full form is the same words (the glossary note explains it). */
export const endLabel = (term: string, full: string): string => (!full || full.trim().toLowerCase() === term.trim().toLowerCase() ? term : `${term} · ${full}`);

const blocksAt = (story: Story, fs: number): EndBlock[] => {
	const out: EndBlock[] = [];
	for (const g of story.glossary) {
		const lines = wrap(endLabel(g.term, g.full), 'hand', fs, END_W - 8);
		const note = g.note ? wrap(g.note, 'hand', ns(fs), END_W) : [];
		out.push({kind: 'g', term: g.term, lines, note, h: lines.length * fs * 1.15 + note.length * ns(fs) * 1.15 + 16});
	}
	for (const p of (story.key_points ?? []).slice(0, 3)) {
		const lines = wrap(p, 'hand', fs, END_W - 8);
		out.push({kind: 'p', lines, note: [], h: lines.length * fs * 1.15 + 16});
	}
	return out;
};

/** true when a line cannot be wrapped narrower than the card (a long path or identifier): the font must shrink */
const tooWide = (bs: EndBlock[], fs: number) => bs.some((b) => b.lines.some((l) => measure(l, 'hand', fs) > END_W - 8) || b.note.some((l) => measure(l, 'hand', ns(fs)) > END_W));

const heads = (bs: EndBlock[]) => (bs.some((b) => b.kind === 'g') ? END_HEAD : 0) + (bs.some((b) => b.kind === 'p') ? END_HEAD : 0);
const total = (bs: EndBlock[]) => bs.reduce((a, b) => a + b.h, 0) + heads(bs);
const pageFrames = (n: number) => Math.min(8 * FPS, Math.round(2.6 * FPS + n * 0.55 * FPS));

export const endPages = (story: Story): EndPage[] => {
	if (!story.glossary.length && !(story.key_points ?? []).length) return [];
	const room = END_BOTTOM - END_TOP;
	for (let fs = 38; fs >= 22; fs--) {
		const bs = blocksAt(story, fs);
		if (total(bs) <= room && !tooWide(bs, fs)) return [{fs, blocks: bs, frames: pageFrames(bs.length), suffix: ''}];
	}
	// does not fit at 22 px: paginate at a comfortable size
	let fs = 26;
	while (fs > 22 && tooWide(blocksAt(story, fs), fs)) fs--;
	const bs = blocksAt(story, fs);
	const pages: EndBlock[][] = [[]];
	for (const b of bs) {
		const cur = pages[pages.length - 1];
		if (cur.length && total([...cur, b]) > room) pages.push([b]);
		else cur.push(b);
	}
	const gPages = pages.filter((p) => p.some((b) => b.kind === 'g')).length;
	let gi = 0;
	return pages.map((blocks) => {
		const hasG = blocks.some((b) => b.kind === 'g');
		if (hasG) gi++;
		return {fs, blocks, frames: pageFrames(blocks.length), suffix: hasG && gPages > 1 ? ` (${gi}/${gPages})` : ''};
	});
};

export const endFrames = (story: Story): number => endPages(story).reduce((a, p) => a + p.frames, 0);
