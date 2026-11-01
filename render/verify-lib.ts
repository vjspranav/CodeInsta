/**
 * Reel QA gate engine. Derives a list of checkable expectations from the script
 * (plus its explicit `expect` entries) and checks each one two ways:
 *   (a) "pure":  the components' pure state functions (src/state.ts, phonestate.ts, dbmodel.ts, captionstate.ts)
 *   (b) "still": a rendered frame (renderStill) -> DOM probe (bounding boxes, overflow) + pixel/colour check
 */
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {PNG} from 'pngjs';
import type {AudioManifest, Story} from './src/schema';
import {buildTimeline, revealTokens, scenesOfItem} from './src/timeline';
import type {BuildOpts, Timeline} from './src/timeline';
import {lineTokens, matchToken, SYNC_MIN_MS} from './src/sync';
import {END_BOTTOM, END_TOP, END_W, END_X, endPages} from './src/endcard';
import {beatAt, defineAt, layoutProblems, sceneAt, termStateAt, visibleAt} from './src/state';
import {heartVisual, normTarget, phoneStateAt, TAP_ARRIVE, TAP_TOTAL} from './src/phonestate';
import {captionStateAt, chunkText} from './src/captionstate';
import {dbStateAt, prepareDb} from './src/dbmodel';
import {isKitKind, kitSnap} from './src/kits';
import type {Prepared} from './src/dbmodel';
import {defineBox} from './src/components/Overlays';
import {CAPTION_AREA, CONTENT, LOWER_THIRD, Rect, SPEAKER_ROW} from './src/theme';
import {castColor, contrast, contrastRgb, setActiveStyle, styleProblems, toRgb} from './src/styles';
import type {Style} from './src/styles';
import {zoneHit, zoneProblems} from './src/zones';
import {emojiProblems} from './src/noemoji';
import type {ZoneBox} from './src/zones';
import {installNodeMeasure} from './measure-node';

installNodeMeasure();
import type {Action} from './src/schema';

// ---------------------------------------------------------------- types
interface ProbeRep {
	frame: number;
	caption: {rect: Rect; textRect: Rect; lineCount: number; visible: string[]; maxLineWidth: number} | null;
		splits: string[];
			fonts: {kind: 'label' | 'data' | 'cell' | 'code'; text: string; size: number; opacity: number; color: string; rect: Rect}[];
		captionFont: number | null;
	define: {rect: Rect; lines: string[]} | null;
	toast: {rect: Rect; text: string} | null;
	heart: {rect: Rect; state: string | null} | null;
	spinner: Rect | null;
	tables: {id: string; rect: Rect; rows: number; now: number[]; past: number[]}[];
	kits: {kind: string; key: string; rect: Rect; els: number; cur: number}[];
	text: string;
	problems: string[];
	zoneBoxes: ZoneBox[];
}

interface Img {
	w: number;
	h: number;
	data: Buffer;
}

interface StillCtx {
	probe: ProbeRep;
	img: Img;
}

export interface Check {
	group: string;
	beat: number;
	frame: number;
	desc: string;
	pure: () => string | null;
	still?: (c: StillCtx) => string | null;
}

export interface Result {
	n: number;
	group: string;
	beat: number;
	frame: number;
	desc: string;
	pure: 'PASS' | 'FAIL';
	still: 'PASS' | 'FAIL' | '-';
	detail: string;
	ok: boolean;
}

export interface TimingStats {
	silenceRatio: number; // silent gaps between lines / speech span (lead-in and outro excluded)
	silenceRatioTotal: number; // silence / whole video, end card included (informational)
	longestGapMs: number;
	longestGapAfterBeat: number;
	minVisualMs: number;
	minVisualWhat: string;
	speechMs: number;
	totalMs: number;
}

export interface Report {
	timing?: TimingStats;
	style?: string;
	results: Result[];
	total: number;
	passed: number;
	failed: number;
	ok: boolean;
	contactSheet: string;
	automatedStills: number;
}

// ---------------------------------------------------------------- pixel helpers
const px = (img: Img, x: number, y: number): [number, number, number] => {
	const i = (img.w * y + x) * 4;
	return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (c: number[], hex: string, tol: number) => {
	const t = toRgb(hex);
	return Math.hypot(c[0] - t[0], c[1] - t[1], c[2] - t[2]) < tol;
};
/** "something is drawn here": clearly different from the background colour (faint textures stay below this) */
const nonBg = (hex: string, thr = 110) => {
	const t = toRgb(hex);
	return ([r, g, b]: number[]) => Math.abs(r - t[0]) + Math.abs(g - t[1]) + Math.abs(b - t[2]) > thr;
};

/** Contrast of the text drawn in `r`: background = the commonest colour, text = a near-extreme pixel (97th percentile). */
export const sampleContrast = (img: Img, r: Rect): {ratio: number; bg: number[]; fg: number[]} | null => {
	const x0 = Math.max(0, Math.floor(r.x));
	const y0 = Math.max(0, Math.floor(r.y));
	const x1 = Math.min(img.w, Math.ceil(r.x + r.w));
	const y1 = Math.min(img.h, Math.ceil(r.y + r.h));
	if ((x1 - x0) * (y1 - y0) < 60) return null;
	const bins = new Map<number, {n: number; c: number[]}>();
	const pixels: number[][] = [];
	for (let y = y0; y < y1; y++)
		for (let x = x0; x < x1; x++) {
			const p = px(img, x, y);
			pixels.push(p);
			const key = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
			const b = bins.get(key) ?? {n: 0, c: [0, 0, 0]};
			b.n++;
			b.c[0] += p[0];
			b.c[1] += p[1];
			b.c[2] += p[2];
			bins.set(key, b);
		}
	let best = {n: 0, c: [0, 0, 0]};
	for (const b of bins.values()) if (b.n > best.n) best = b;
	const bg = best.c.map((v) => v / best.n);
	const scored = pixels.map((p) => ({p, c: contrastRgb(p, bg)})).sort((a, b) => a.c - b.c);
	const pick = scored[Math.min(scored.length - 1, Math.floor(scored.length * 0.97))];
	return {ratio: pick.c, bg, fg: pick.p};
};
/** sampled ratios lose a little to anti-aliasing and texture; the token ratio itself must be >= 4.5 */
export const SAMPLED_MIN = 4.5 * 0.9;
export const MIN_CAPTION_PX = 34;
export const MIN_LABEL_PX = 22;
export const MIN_DATA_PX = 22; // table data
export const MIN_CODE_PX = 16; // code and terminal text

const fraction = (img: Img, r: Rect, pred: (p: number[]) => boolean): number => {
	const x0 = Math.max(0, Math.floor(r.x));
	const y0 = Math.max(0, Math.floor(r.y));
	const x1 = Math.min(img.w, Math.ceil(r.x + r.w));
	const y1 = Math.min(img.h, Math.ceil(r.y + r.h));
	let n = 0;
	let hit = 0;
	for (let y = y0; y < y1; y++)
		for (let x = x0; x < x1; x++) {
			n++;
			if (pred(px(img, x, y))) hit++;
		}
	return n ? hit / n : 0;
};

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---------------------------------------------------------------- timing (from the timeline only)
export const MAX_SILENCE_RATIO = 0.1;
export const MAX_GAP_MS = 1500;
export const MIN_VISUAL_ON_SCREEN_MS = 1200;

export const timingStats = (tl: Timeline): TimingStats => {
	const f2ms = (f: number) => (f / 30) * 1000;
	let sil = 0;
	let longest = 0;
	let longestAfter = 0;
	for (let i = 0; i + 1 < tl.beats.length; i++) {
		const g = tl.beats[i + 1].start - tl.beats[i].end;
		sil += g;
		if (g > longest) {
			longest = g;
			longestAfter = i;
		}
	}
	const first = tl.beats[0];
	const last = tl.beats[tl.beats.length - 1];
	const span = Math.max(1, last.end - first.start);
	const speech = tl.beats.reduce((n, b) => n + b.dur, 0);
	let minV = Infinity;
	let what = '';
	const note = (frames: number, label: string) => {
		if (frames < minV) {
			minV = frames;
			what = label;
		}
	};
	for (const sc of tl.scenes) {
		for (const it of sc.items) note(sc.end - it.start, `${it.kind} ${it.id ?? it.key} (scene ${sc.index})`);
		if (sc.phone) note(sc.end - sc.phone.start, `phone (scene ${sc.index})`);
	}
	for (const d of tl.defines) note(d.frames, `define ${d.term}`);
	return {
		silenceRatio: sil / span,
		silenceRatioTotal: Math.max(0, tl.total - speech) / tl.total,
		longestGapMs: f2ms(longest),
		longestGapAfterBeat: longestAfter,
		minVisualMs: Number.isFinite(minV) ? f2ms(minV) : Infinity,
		minVisualWhat: what,
		speechMs: f2ms(speech),
		totalMs: f2ms(tl.total),
	};
};

/** Middle of the caption chunk nearest the middle of the line (a chunk boundary would show no word yet). */
const midFraction = (text: string): number => {
	const {chunks} = chunkText(text);
	let best = 0.5;
	let bd = Infinity;
	for (const c of chunks) {
		const mid = (c.f0 + c.f1) / 2;
		if (Math.abs(mid - 0.5) < bd) {
			bd = Math.abs(mid - 0.5);
			best = mid;
		}
	}
	return best;
};


interface SyncFinding {
	tokText: string;
	what: string;
	visibleMs: number;
	spokenMs: number;
}

/** Every visual token of an element on screen in beat `bi`'s scene that the line names, with both times (ms). */
export const syncFindings = (tl: Timeline, bi: number, line: ReturnType<typeof lineTokens>): SyncFinding[] => {
	const b = tl.beats[bi];
	const f2ms = (f: number) => (f / 30) * 1000;
	const out: SyncFinding[] = [];
	const seen = new Set<string>();
	for (const r of tl.reveals) {
		if (r.beat > bi) continue;
		for (const v of revealTokens(r)) {
			const m = matchToken(v, line);
			if (!m) continue;
			const spokenMs = f2ms(b.start) + m.startMs;
			const sf = Math.round((spokenMs / 1000) * 30);
			const sc = sceneAt(tl, Math.min(sf, tl.beatsEnd));
			// only elements that are part of the scene the word is spoken in
			if (r.item) {
				if (!sc || !scenesOfItem(tl.scenes, r.item).includes(sc.index)) continue;
			} else if (r.do.startsWith('phone.')) {
				const rs = sceneAt(tl, r.frame + 1);
				if (!rs || !sc || rs.index !== sc.index) continue;
			}
			const key = `${r.beat}.${r.action}.${v.text}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({tokText: v.text, what: `${r.do}${r.a.id ? ' ' + r.a.id : ''} from beat ${r.beat}`, visibleMs: f2ms(v.frame), spokenMs});
		}
	}
	return out;
};

// ---------------------------------------------------------------- derivation
export const deriveChecks = (story: Story, audio: AudioManifest, buildOpts: BuildOpts = {}): {checks: Check[]; tl: Timeline} => {
	const S: Style = setActiveStyle(story.style);
	const T = S.tokens;
	const isLike = (c: number[]) => near(c, T.like, 75);
	const notPaper = nonBg(T.paper);
	const nonScreen = nonBg(T.screen, 60);
	const nearToast = (c: number[]) => near(c, T.toastBg, 60);
	const tl = buildTimeline(story, audio, buildOpts);
	const checks: Check[] = [];
	const add = (c: Check) => checks.push(c);
	const beatOf = (f: number) => {
		let b = 0;
		for (const x of tl.beats) if (x.start <= f) b = x.index;
		return b;
	};
	const dbPre = new Map<string, Prepared>();
	const preFor = (key: string, item: {props: Record<string, unknown>; rect: Rect}) => {
		let p = dbPre.get(key);
		if (!p) {
			p = prepareDb(item.props.events as {frame: number; action: Action}[], item.rect);
			dbPre.set(key, p);
		}
		return p;
	};
	const phoneAt = (f: number) => {
		const sc = sceneAt(tl, f);
		return sc?.phone ? phoneStateAt(tl.phoneEvents, sc.phone.start, f) : undefined;
	};
	const dbAt = (f: number) => {
		const sc = sceneAt(tl, f);
		const item = sc?.items.find((i) => i.kind === 'db' && f >= i.start);
		return item ? dbStateAt(preFor(item.key, item), f) : undefined;
	};
	const rowsIn = (f: number, id: string) => dbAt(f)?.tables.find((t) => t.id === id)?.rows.length;
	const nextPhoneEvent = (f: number, scEnd: number) => Math.min(scEnd, ...tl.phoneEvents.filter((e) => e.frame > f).map((e) => e.frame));
	const frameOfExpect = (beat: number, at: unknown): number => {
		const b = tl.beats[beat];
		if (at === 'start') return b.start + 2;
		if (at === 'end') return b.end - 2;
		if (typeof at === 'number') return b.start + Math.round(at * b.dur);
		return b.start + Math.round(0.9 * b.dur);
	};

	// --- style tokens: every text pair >= 4.5:1 (computed), and the story's cast colours as resolved in this style
	add({
	group: 'style',
	beat: 0,
	frame: 0,
	desc: `style ${S.id}: caption / label / cast text contrast >= 4.5:1 from the tokens`,
	pure: () => {
	const probs = styleProblems(S);
	story.cast.forEach((m, i) => {
	const col = castColor(S, m.color, i);
	for (const bg of [T.paper, T.captionBg]) if (contrast(col, bg) < 4.5) probs.push(`cast ${m.id} ${col} on ${bg} is ${contrast(col, bg).toFixed(2)}:1`);
	});
	return probs.join('; ') || null;
	},
	});

	// --- no emojis or pictographs anywhere in the script
	add({
		group: 'no.emoji',
		beat: 0,
		frame: 0,
		desc: 'no emoji or pictograph in any text of the script (title, beats, say, visuals, glossary, key points)',
		pure: () => emojiProblems(story).slice(0, 5).join('; ') || null,
	});

	// --- every beat: >=1 visible visual + current caption
	for (const b of tl.beats) {
		const f = b.end - 3;
		add({
			group: 'beat.visual',
			beat: b.index,
			frame: f,
			desc: `beat ${b.index} shows at least one visual`,
			pure: () => (visibleAt(tl, f).length > 0 ? null : 'nothing visible on screen'),
			still: ({img}) => {
				const fr = fraction(img, CONTENT, notPaper);
				return fr > 0.004 ? null : `content area is blank (${pct(fr)} ink)`;
			},
		});
		for (const [label, f2, all] of [
			['mid', b.start + Math.round(b.dur * midFraction(b.text)), false],
			['end', b.end - 1, true],
		] as const) {
			add({
				group: 'caption',
				beat: b.index,
				frame: f2,
				desc: `caption (${label}) shows the current line, max 2 lines`,
				pure: () => {
					const cs = captionStateAt(b, f2);
					if (cs.lines.length > 2) return `${cs.lines.length} lines`;
					if (cs.fs < MIN_CAPTION_PX) return `caption font ${cs.fs}px < ${MIN_CAPTION_PX}px`;
					if (!b.text.includes(cs.text)) return `chunk "${cs.text}" is not part of the line`;
					if (cs.visible.length === 0) return 'no word revealed yet';
					if (all) {
						if (cs.visible.join(' ') !== cs.text) return `only "${cs.visible.join(' ')}" revealed at the end`;
						if (!b.text.trim().endsWith(cs.text.trim())) return 'last chunk is not the end of the line';
					}
					return null;
				},
				still: ({probe, img}) => {
				const c = probe.caption;
				if (!c) return 'no caption in the DOM';
					if (c.lineCount > 2) return `${c.lineCount} rendered lines`;
					if (c.maxLineWidth > CAPTION_AREA.w + 2) return `line is ${c.maxLineWidth}px wide (> ${CAPTION_AREA.w})`;
					const want = captionStateAt(b, f2).visible.join(' ');
					if (c.visible.join(' ') !== want) return `rendered "${c.visible.join(' ')}" != state "${want}"`;
					if (c.rect.y < CAPTION_AREA.y - 2 || c.rect.y + c.rect.h > 1280) return 'caption outside the bottom area';
					if (probe.splits.length) return `split words: ${probe.splits.join(', ')}`;
					if (probe.captionFont !== null && probe.captionFont < MIN_CAPTION_PX - 0.5) return `caption font ${probe.captionFont.toFixed(1)} px < ${MIN_CAPTION_PX}`;
					if (!all) {
					const sc = sampleContrast(img, c.textRect);
					if (sc && sc.ratio < SAMPLED_MIN) return `sampled caption contrast ${sc.ratio.toFixed(2)}:1 < ${SAMPLED_MIN.toFixed(2)}:1`;
					}
					return null;
				},
			});
		}
	}

	// --- sync: the voice never runs ahead of the screen (decisions.md, "Owner approved Parts 1/2")
	for (const b of tl.beats) {
		const line = lineTokens(story.beats[b.index].say ?? story.beats[b.index].text, (b.dur / 30) * 1000);
		const found = syncFindings(tl, b.index, line);
		if (!found.length) continue;
		const names = [...new Set(found.map((x) => `${x.tokText}`))].slice(0, 6).join(', ');
		const f = b.end - 3;
		add({
			group: 'sync.voice-after-visual',
			beat: b.index,
			frame: f,
			desc: `beat ${b.index}: visuals showing [${names}] are up >= ${SYNC_MIN_MS} ms before the word is spoken (${found.length} token${found.length > 1 ? 's' : ''})`,
			pure: () => {
				const bad = found.filter((x) => x.visibleMs > x.spokenMs - SYNC_MIN_MS);
				return bad.length
					? bad
							.map((x) => `"${x.tokText}" (${x.what}) is visible at ${(x.visibleMs / 1000).toFixed(2)} s but spoken at ${(x.spokenMs / 1000).toFixed(2)} s (${Math.round(x.spokenMs - x.visibleMs)} ms ahead, need ${SYNC_MIN_MS})`)
							.join('; ')
					: null;
			},
		});
	}

	// --- V3: a question is never on screen together with its answer
	for (const b of tl.beats) {
		const next = tl.beats[b.index + 1];
		if (!next || !/[?\uFF1F]["')\]]?\s*$/.test(b.text.trim())) continue;
		const ownLine = lineTokens(story.beats[b.index].say ?? b.text, (b.dur / 30) * 1000);
		const answer = lineTokens(story.beats[next.index].say ?? next.text, (next.dur / 30) * 1000);
		const early = tl.reveals
			.filter((r) => r.beat === b.index)
			.flatMap((r) => revealTokens(r).filter((v) => v.kind === 'num' && (v.value ?? 0) >= 10 && matchToken(v, answer) && !matchToken(v, ownLine)).map((v) => `${v.text} (${r.do}${r.a.id ? ' ' + r.a.id : ''})`));
		add({
			group: 'answer.early',
			beat: b.index,
			frame: b.end - 3,
			desc: `beat ${b.index} asks a question: nothing on screen yet shows what beat ${next.index} answers`,
			pure: () => (early.length ? `the answer is on screen while it is asked: ${early.join(', ')}` : null),
		});
	}

	// --- persistence: a beat with no new visuals keeps the previous scene exactly
	story.beats.forEach((sb, i) => {
		if (i === 0) return;
		const showsNew = (sb.visuals as Record<string, unknown>[]).some((a) => {
			const k = String(a.do);
			return !(k === 'layout' || k === 'clear' || k === 'focus' || k === 'define');
		});
		if (showsNew) return;
		const b = tl.beats[i];
		const keys = (f: number) =>
			visibleAt(tl, f)
				.map((v) => v.key)
				.sort()
				.join(',');
		const before = b.start - 1;
		add({
			group: 'scene.persist',
			beat: i,
			frame: b.end - 3,
			desc: `beat ${i} has no new visuals: it shows the same elements as the end of beat ${i - 1}`,
			pure: () => {
				const k0 = keys(before);
				if (!k0) return `beat ${i - 1} ended with an empty scene`;
				for (const [label, f] of [['start', b.start + 2], ['end', b.end - 2]] as const) {
					const k1 = keys(f);
					if (k1 !== k0) return `at the ${label} of the line the scene shows [${k1 || 'nothing'}] instead of [${k0}]`;
				}
				return null;
			},
		});
	});

	// --- scenes: layout (overlap / safe area) + DOM overflow
	for (const sc of tl.scenes) {
		const f = Math.max(sc.start + 1, sc.end - 2);
		if (sc.items.length === 0 && !sc.phone) continue;
		add({
			group: 'layout',
			beat: beatOf(f),
			frame: f,
			desc: `scene ${sc.index} (${sc.layout}): no overlaps, inside safe area, no text overflow`,
			pure: () => layoutProblems(sc).join('; ') || null,
			still: ({probe}) => probe.problems.join('; ') || null,
			});
			// overlay zones (packages/shared/overlay-zones.json): no text box or key visual intersects one
			add({
			group: 'zones.clear',
			beat: beatOf(f),
			frame: f,
			desc: `scene ${sc.index}: no text or key visual inside an overlay zone (topControls, rightRail, bottomMeta)`,
			pure: () => layoutProblems(sc).filter((p) => /overlay zone/.test(p)).join('; ') || null,
			still: ({probe}) => zoneProblems(probe.zoneBoxes ?? []).join('; ') || null,
			});
			add({
			group: 'text.nosplit',
			beat: beatOf(f),
			frame: f,
			desc: `scene ${sc.index}: no word is split across lines`,
			pure: () => null,
			still: ({probe}) => (probe.splits.length ? `split words: ${probe.splits.join(', ')}` : null),
			});
			add({
			group: 'label.size',
			beat: beatOf(f),
			frame: f,
			desc: `scene ${sc.index}: every label >= ${MIN_LABEL_PX} px at 720x1280`,
			pure: () => null,
			still: ({probe}) => {
			const bad = probe.fonts.filter((x) => x.kind === 'label' && x.opacity > 0.5 && x.size < MIN_LABEL_PX - 0.5);
			return bad.length ? bad.map((x) => `"${x.text}" ${x.size.toFixed(1)} px`).join('; ') : null;
			},
			});
			add({
			group: 'data.size',
			beat: beatOf(f),
			frame: f,
			desc: `scene ${sc.index}: table data >= ${MIN_DATA_PX} px, code / terminal >= ${MIN_CODE_PX} px, nothing clipped`,
			pure: () => null,
			still: ({probe}) => {
			const bad = probe.fonts.filter((x) => x.opacity > 0.5 && ((x.kind === 'cell' && x.size < MIN_DATA_PX - 0.5) || (x.kind === 'code' && x.size < MIN_CODE_PX - 0.5)));
			const clip = probe.problems.filter((p) => p.startsWith('overflow:'));
			return [...bad.map((x) => `${x.kind} "${x.text}" ${x.size.toFixed(1)} px`), ...clip].join('; ') || null;
			},
			});
			add({
			group: 'label.contrast',
			beat: beatOf(f),
			frame: f,
			desc: `scene ${sc.index}: sampled label contrast >= ${SAMPLED_MIN.toFixed(1)}:1`,
			pure: () => null,
			still: ({probe, img}) => {
			const bad: string[] = [];
			for (const x of probe.fonts) {
			if (x.kind !== 'label' || x.opacity < 0.95 || x.rect.w < 30 || x.rect.h < 14) continue;
			const s = sampleContrast(img, x.rect);
			if (s && s.ratio < SAMPLED_MIN) bad.push(`"${x.text}" ${s.ratio.toFixed(2)}:1`);
			}
			return bad.length ? bad.join('; ') : null;
			},
			});
			}

	// --- overlay zones: the fixed areas (speaker row, lower third, captions, end card) and every lower third on screen
	add({
		group: 'zones.clear',
		beat: 0,
		frame: 0,
		desc: 'fixed areas (speaker row, content, lower third, captions, end card) are outside the overlay zones',
		pure: () => {
			const areas: [string, Rect][] = [
				['speaker row', SPEAKER_ROW],
				['content', CONTENT],
				['lower third', LOWER_THIRD],
				['caption area', CAPTION_AREA],
				['end card', {x: END_X, y: END_TOP, w: END_W, h: END_BOTTOM - END_TOP}],
			];
			return areas.flatMap(([n, r]) => (zoneHit(r) ? [`${n} is inside the ${zoneHit(r)} overlay zone`] : [])).join('; ') || null;
		},
	});
	for (const d of tl.defines) {
		const f = d.frame + 40;
		add({
			group: 'zones.clear',
			beat: beatOf(f),
			frame: f,
			desc: `lower third "${d.term}": outside the overlay zones`,
			pure: () => null,
			still: ({probe}) => zoneProblems(probe.zoneBoxes ?? []).join('; ') || null,
		});
	}

	// --- phone
	const evs = tl.phoneEvents;
	for (const ev of evs) {
		const sc = sceneAt(tl, ev.frame + 1);
		const scEnd = sc ? sc.end : ev.frame + 200;
		const nextEv = nextPhoneEvent(ev.frame, scEnd);
		const beat = beatOf(ev.frame);
		if (ev.kind === 'tap') {
			const target = normTarget(ev.props.target);
			const T = ev.frame;
			if (target === 'heart' || target === 'post') {
				const f1 = Math.min(T + TAP_ARRIVE + 1, nextEv - 1);
				const f2 = Math.min(T + TAP_TOTAL + 6, nextEv - 1);
				add({
					group: 'phone.tap',
					beat,
					frame: f1,
					desc: `tap(${target}) -> heart in the like colour within 300 ms`,
					pure: () => {
						if (!sc?.phone) return 'no phone on screen';
						if (f1 < T + TAP_ARRIVE) return `next phone event only ${(((nextEv - T) / 30) * 1000).toFixed(0)} ms after the tap`;
						const v = heartVisual(phoneAt(f1)!);
						return v === 'filled' ? null : `heart is "${v}" at +${(((f1 - T) / 30) * 1000).toFixed(0)} ms`;
					},
					still: ({probe, img}) => {
						if (!probe.heart) return 'heart not in DOM';
						const fr = fraction(img, probe.heart.rect, isLike);
						return fr >= 0.1 ? null : `heart region only ${pct(fr)} red (state ${probe.heart.state})`;
					},
				});
				if (f2 > f1 + 4) {
					add({
						group: 'phone.tap',
						beat,
						frame: f2,
						desc: `tap(${target}) -> heart stays in the like colour until the next phone state`,
						pure: () => {
							const v = heartVisual(phoneAt(f2)!);
							return v === 'filled' ? null : `heart is "${v}"`;
						},
						still: ({probe, img}) => {
							if (!probe.heart) return 'heart not in DOM';
							const fr = fraction(img, probe.heart.rect, isLike);
							return fr >= (f2 >= T + TAP_TOTAL ? 0.25 : 0.1) ? null : `heart region only ${pct(fr)} red`;
						},
					});
				}
			} else {
				add({
					group: 'phone.tap',
					beat,
					frame: T + 4,
					desc: `tap(${target}) -> finger visible, like state unchanged`,
					pure: () => {
						const st = phoneAt(T + 4);
						if (!st) return 'no phone on screen';
						if (!st.finger) return 'no finger';
						return null;
					},
				});
			}
		}
		if (ev.kind === 'spinner') {
			const S = ev.frame;
			const fa = S + 4;
			const fb = Math.min(nextEv - 1, S + 150);
			for (const f of fb > fa + 3 ? [fa, fb] : [fa]) {
				add({
					group: 'phone.spinner',
					beat: beatOf(f),
					frame: f,
					desc: `spinner visible until the next phone state (${f === fa ? 'start' : 'end'})`,
					pure: () => {
						const st = phoneAt(f);
						if (!st) return 'no phone on screen';
						const v = heartVisual(st);
						return v === 'spinner' ? null : `heart slot shows "${v}"`;
					},
					still: ({probe, img}) => {
						if (!probe.spinner) return 'spinner not in DOM';
						const dk = fraction(img, probe.spinner, nonScreen);
						return dk >= 0.08 ? null : `spinner region looks empty (${pct(dk)} ink)`;
					},
				});
			}
		}
		if (ev.kind === 'toast') {
			const text = String(ev.props.text ?? 'Something went wrong');
			const T = ev.frame;
			const f = T + 24;
			add({
				group: 'phone.toast',
				beat,
				frame: f,
				desc: `toast "${text}" visible for >= 1.2 s`,
				pure: () => {
					if (!sc?.phone) return 'no phone on screen';
					if (nextEv - T < 36) return `toast replaced after ${(((nextEv - T) / 30) * 1000).toFixed(0)} ms (< 1200 ms)`;
					if (scEnd - T < 36) return 'scene ends before 1.2 s';
					for (let k = 2; k <= 36; k++) {
						const t = phoneAt(T + k)?.toast;
						if (!t || t.text !== text) return `toast missing or wrong at +${k} frames`;
					}
					return null;
				},
				still: ({probe, img}) => {
					if (!probe.toast) return 'toast not in DOM';
					if (probe.toast.text.trim() !== text) return `toast text "${probe.toast.text.trim()}"`;
					const r = probe.toast.rect;
					const inner = {x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16};
					const dk = fraction(img, inner, nearToast);
					return dk >= 0.45 ? null : `toast body not the toast colour (${pct(dk)})`;
				},
			});
		}
	}

	// --- db
	for (const sc of tl.scenes) {
		const item = sc.items.find((i) => i.kind === 'db');
		if (!item) continue;
		const pre = preFor(item.key, item);
		const dbEvents = item.props.events as {frame: number; action: Action}[];
		const acts = dbEvents.filter((e) => ['db.table', 'db.insert', 'db.shard', 'db.replicate', 'db.fanout', 'db.result'].includes(e.action.do));
		acts.forEach((e, idx) => {
			const nextAct = acts[idx + 1]?.frame ?? Infinity;
			const touched = pre.model.tables.filter((t) => t.born >= e.frame && t.born <= e.frame + 40);
			const rowBorn = Math.max(e.frame + 20, ...pre.model.tables.flatMap((t) => t.rows.filter((r) => r.born >= e.frame && r.born < nextAct).map((r) => r.born + 30)));
			const f = Math.min(rowBorn + 4, nextAct - 1, sc.end - 2);
			const a = e.action as Record<string, unknown>;
			const expectCount = (): {id: string; count: number}[] => {
				const rows = (x: unknown) => (Array.isArray(x) ? x.length : 0);
				const before = (id: string) => dbAt(Math.max(item.start, e.frame - 1))?.tables.find((t) => t.id === id)?.rows.length ?? 0;
				switch (e.action.do) {
					case 'db.table': {
						const id = String(a.id ?? touched[0]?.id);
						return [{id, count: rows(a.rows)}];
					}
					case 'db.result':
						return [{id: String(a.id ?? touched[0]?.id), count: rows(a.rows)}];
					case 'db.insert': {
						const id = String(a.table ?? a.into ?? pre.model.tables[pre.model.tables.length - 1].id);
						return [{id, count: before(id) + (Array.isArray(a.row) ? 1 : rows(a.rows))}];
					}
					default:
						return [];
				}
			};
			add({
				group: e.action.do,
				beat: beatOf(f),
				frame: f,
				desc: `${e.action.do}${a.id ? ' ' + a.id : a.table ? ' ' + a.table : ''}: row counts after the step`,
				pure: () => {
					const st = dbAt(f);
					if (!st) return 'db stage not visible';
					const msgs: string[] = [];
					for (const x of expectCount()) {
						const got = st.tables.find((t) => t.id === x.id)?.rows.length;
						if (got !== x.count) msgs.push(`${x.id}: ${got ?? 'missing'} rows, want ${x.count}`);
					}
					if (e.action.do === 'db.shard') {
						const src = pre.model.tables.find((t) => t.id === String(a.table ?? ''));
						const srcRows = src ? src.rows.filter((r) => r.born <= e.frame + 40).length : 0;
						const shards = st.tables.filter((t) => t.kind === 'shard' && t.id.startsWith(String(a.table) + '#'));
						const total = shards.reduce((n, t) => n + t.rows.length, 0);
						if (total !== srcRows) msgs.push(`shards hold ${total} rows, source had ${srcRows}`);
						if (shards.length !== (typeof a.n === 'number' ? Math.max(2, Math.min(4, a.n)) : 2)) msgs.push(`${shards.length} shards`);
						if (st.tables.some((t) => t.id === String(a.table))) msgs.push('source table still on screen');
					}
					if (e.action.do === 'db.replicate') {
						const reps = st.tables.filter((t) => t.kind === 'replica');
						const src = st.tables.find((t) => t.id === String(a.table));
						const n = typeof a.n === 'number' ? Math.max(1, Math.min(3, a.n)) : 2;
						if (reps.length < n) msgs.push(`${reps.length} replicas, want ${n}`);
						for (const r of reps) if (src && r.rows.length !== src.rows.length) msgs.push(`${r.id}: ${r.rows.length} rows vs source ${src.rows.length}`);
					}
					if (e.action.do === 'db.fanout') {
						const feeds = st.tables.filter((t) => t.kind === 'feed');
						const fl = a.followers;
						const n = Array.isArray(fl) ? Math.min(6, fl.length) : Math.max(2, Math.min(6, typeof fl === 'number' ? fl : 4));
						if (feeds.length !== n) msgs.push(`${feeds.length} feed tables, want ${n}`);
						for (const t of feeds) if (t.rows.length !== 1) msgs.push(`${t.id}: ${t.rows.length} rows, want 1`);
					}
					return msgs.join('; ') || null;
				},
				still: ({probe}) => {
					const st = dbAt(f);
					if (!st) return null;
					const msgs: string[] = [];
					for (const t of st.tables) {
						const dom = probe.tables.find((x) => x.id === t.id);
						if (!dom) msgs.push(`${t.id} not in DOM`);
						else if (dom.rows !== t.rows.length) msgs.push(`${t.id}: DOM ${dom.rows} rows vs state ${t.rows.length}`);
					}
					if (probe.tables.length !== st.tables.length) msgs.push(`DOM has ${probe.tables.length} tables, state ${st.tables.length}`);
					return msgs.join('; ') || null;
				},
			});
		});
		// joins: each step
		pre.model.joins.forEach((j) => {
			const f = Math.min(j.frame + 5, sc.end - 2);
			add({
				group: 'db.join',
				beat: beatOf(f),
				frame: f,
				desc: `db.join step ${j.i + 1}/${j.n} "${j.label}": exactly rows [${j.rows}] of ${j.table} highlighted`,
				pure: () => {
					const st = dbAt(f);
					if (!st) return 'db stage not visible';
					const msgs: string[] = [];
					for (const t of st.tables) {
						const want = t.id === j.table ? j.rows : [];
						if (!same(t.highlighted.now, [...want].sort((a, b) => a - b))) msgs.push(`${t.id} highlighted [${t.highlighted.now}] want [${want}]`);
					}
					if (!st.tables.some((t) => t.id === j.table)) msgs.push(`table ${j.table} missing`);
					if (st.joinStep?.label !== j.label) msgs.push(`label "${st.joinStep?.label}"`);
					const t = st.tables.find((x) => x.id === j.table);
					if (t) for (const r of j.rows) if (r >= t.rows.length) msgs.push(`row ${r} not on screen (table has ${t.rows.length})`);
					return msgs.join('; ') || null;
				},
				still: ({probe}) => {
					const msgs: string[] = [];
					for (const t of probe.tables) {
						const want = t.id === j.table ? j.rows : [];
						if (!same([...t.now].sort((a, b) => a - b), [...want].sort((a, b) => a - b))) msgs.push(`DOM ${t.id} highlight [${t.now}] want [${want}]`);
					}
					if (!probe.text.replace(/\s+/g, ' ').includes(j.label)) msgs.push('step label not visible');
					return msgs.join('; ') || null;
				},
			});
		});
	}

	// --- visualization kits (seq.diagram, tree, timeline.track, packet.flow, code.editor, chart.plot)
	for (const sc of tl.scenes) {
		for (const item of sc.items) {
			if (!isKitKind(item.kind)) continue;
			const kind = item.kind;
			const snap0 = kitSnap(item, item.start + 1, item.rect.w, item.rect.h)!;
			const settle = Math.min(Math.max(snap0.settle, item.start + 6), sc.end - 2);
			const mid = Math.min(settle - 10, sc.end - 2);
			const domAgrees = (f: number) => ({probe}: StillCtx) => {
				const snap = kitSnap(item, f, item.rect.w, item.rect.h)!;
				const dom = probe.kits.find((k) => k.kind === kind && Math.abs(k.rect.x - item.rect.x) < 3 && Math.abs(k.rect.y - item.rect.y) < 3);
				if (!dom) return `${kind} not in the DOM`;
				const msgs: string[] = [];
				if (dom.els !== snap.els) msgs.push(`DOM shows ${dom.els} elements, state says ${snap.els}`);
				if (dom.cur !== snap.cur) msgs.push(`DOM highlights ${dom.cur} current elements, state says ${snap.cur}`);
				const flat = probe.text.replace(/\s+/g, ' ');
				for (const tx of snap.texts.map((x) => x.replace(/\s+/g, ' ').trim())) if (tx && !flat.includes(tx)) msgs.push(`"${tx}" not on screen`);
				return msgs.join('; ') || null;
			};
			add({
				group: `kit.${kind}`,
				beat: beatOf(settle),
				frame: settle,
				desc: `${kind} ${item.id ?? item.key}: everything declared is revealed, one current step highlighted, geometry inside its slot`,
				pure: () => {
					const snap = kitSnap(item, settle, item.rect.w, item.rect.h)!;
					const msgs = [...snap.problems];
					if (snap.els === 0) msgs.push('nothing revealed');
					if (snap.wantsCur && snap.cur < 1) msgs.push('no current step is highlighted');
					return msgs.join('; ') || null;
				},
				still: domAgrees(settle),
			});
			if (mid > item.start + 4 && mid < settle - 2) {
				add({
					group: `kit.${kind}`,
					beat: beatOf(mid),
					frame: mid,
					desc: `${kind} ${item.id ?? item.key}: mid-animation state matches the DOM`,
					pure: () => {
						const snap = kitSnap(item, mid, item.rect.w, item.rect.h)!;
						return snap.els > 0 ? null : 'nothing revealed mid-animation';
					},
					still: domAgrees(mid),
				});
			}
		}
	}

	// --- define (lower-third)
	for (const d of tl.defines) {
		const f = d.frame + Math.min(24, d.frames - 2);
		add({
			group: 'define',
			beat: beatOf(f),
			frame: f,
			desc: `define "${d.term}": lower-third fully visible, wrapped not truncated`,
			pure: () => {
			if (!d.full) return `"${d.term}" has no definition (not in glossary)`;
			if (defineBox(d).lines.join(' ').includes('- ')) return 'a word is hyphen-split';
				if (!defineAt(tl, f)) return 'not visible';
				const b = defineBox(d);
				if (b.lines.length > 2) return `${b.lines.length} lines`;
				if (!b.complete) return 'text does not fit';
				return null;
			},
			still: ({probe}) => {
				const dd = probe.define;
				if (!dd) return 'lower-third not in DOM';
				const want = defineBox(d).lines.join(' ');
				if (dd.lines.join(' ').replace(/\s+/g, ' ') !== want.replace(/\s+/g, ' ')) return `rendered "${dd.lines.join(' ')}"`;
				if (dd.rect.y + dd.rect.h > LOWER_THIRD.y + LOWER_THIRD.h + 2 || dd.rect.y < LOWER_THIRD.y - 2) return 'lower-third outside its band';
				if (probe.splits.length) return `split words: ${probe.splits.join(', ')}`;
				return probe.problems.filter((p) => p.startsWith('lower-third')).join('; ') || null;
			},
		});
	}

	// --- explicit expect entries
	(story.expect ?? []).forEach((x, i) => {
		const f = frameOfExpect(x.beat, x.at);
		const base = {beat: x.beat, frame: f};
		const label = `expect[${i}] ${x.kind}${x.target ? ' ' + x.target : ''}${x.text ? ` "${x.text}"` : ''}`;
		switch (x.kind) {
			case 'heart.filled':
			case 'heart.empty': {
				const want = x.kind === 'heart.filled';
				add({
					group: 'expect',
					...base,
					desc: label,
					pure: () => {
						const st = phoneAt(f);
						if (!st) return 'no phone on screen';
						const v = heartVisual(st);
						return (v === 'filled') === want && (want || v === 'empty') ? null : `heart is "${v}"`;
					},
					still: ({probe, img}) => {
						if (!probe.heart) return 'heart not in DOM';
						const fr = fraction(img, probe.heart.rect, isLike);
						return want ? (fr >= 0.1 ? null : `only ${pct(fr)} red`) : fr < 0.04 ? null : `${pct(fr)} red`;
					},
				});
				break;
			}
			case 'spinner.visible':
				add({
					group: 'expect',
					...base,
					desc: label,
					pure: () => (phoneAt(f) && heartVisual(phoneAt(f)!) === 'spinner' ? null : 'spinner not visible'),
					still: ({probe, img}) => (probe.spinner && fraction(img, probe.spinner, nonScreen) >= 0.08 ? null : 'spinner not drawn'),
				});
				break;
			case 'toast.visible':
				add({
					group: 'expect',
					...base,
					desc: label,
					pure: () => {
						const t = phoneAt(f)?.toast;
						if (!t) return 'no toast';
						return x.text && t.text !== x.text ? `toast text "${t.text}"` : null;
					},
					still: ({probe}) => (probe.toast && (!x.text || probe.toast.text.trim() === x.text) ? null : 'toast not rendered as expected'),
				});
				break;
			case 'table.rows':
				add({
					group: 'expect',
					...base,
					desc: `${label} = ${x.count}`,
					pure: () => (rowsIn(f, x.target ?? '') === x.count ? null : `${rowsIn(f, x.target ?? '') ?? 'missing'} rows`),
					still: ({probe}) => {
						const t = probe.tables.find((y) => y.id === x.target);
						return t && t.rows === x.count ? null : `DOM ${t ? t.rows : 'missing'} rows`;
					},
				});
				break;
			case 'join.highlight':
				add({
					group: 'expect',
					...base,
					desc: `${label} rows [${x.rows}]`,
					pure: () => {
						const t = dbAt(f)?.tables.find((y) => y.id === x.target);
						return t && same(t.highlighted.now, [...(x.rows ?? [])].sort((a, b) => a - b)) ? null : `highlighted [${t?.highlighted.now}]`;
					},
					still: ({probe}) => {
						const t = probe.tables.find((y) => y.id === x.target);
						return t && same([...t.now].sort((a, b) => a - b), [...(x.rows ?? [])].sort((a, b) => a - b)) ? null : `DOM highlighted [${t?.now}]`;
					},
				});
				break;
			case 'define.visible':
				add({
					group: 'expect',
					...base,
					desc: label,
					pure: () => (defineAt(tl, f)?.term.toLowerCase() === (x.target ?? '').toLowerCase() ? null : 'define not visible'),
					still: ({probe}) => (probe.define ? null : 'lower-third not in DOM'),
				});
				break;
			case 'scene.visible':
				add({group: 'expect', ...base, desc: label, pure: () => (visibleAt(tl, f).length ? null : 'empty scene'), still: ({img}) => (fraction(img, CONTENT, notPaper) > 0.004 ? null : 'blank')});
				break;
			case 'text.visible':
				add({
					group: 'expect',
					...base,
					desc: label,
					pure: () => {
						const t = (x.text ?? '').toLowerCase();
						const b = beatAt(tl, f) ?? tl.beats[x.beat];
						const texts = [b.text, ...captionStateAt(b, f).visible, ...visibleAt(tl, f).flatMap((v) => {
							const it = sceneAt(tl, f)?.items.find((i) => i.key === v.key);
							return it ? [String(it.props.text ?? ''), String(it.props.sub ?? ''), ...termStateAt(it, f).lines] : [];
						})];
						return texts.join(' ').toLowerCase().includes(t) ? null : 'text not found in state';
					},
					still: ({probe}) => (probe.text.replace(/\s+/g, ' ').toLowerCase().includes((x.text ?? '').replace(/\s+/g, ' ').toLowerCase()) ? null : 'text not on screen'),
				});
				break;
		}
	});

	// --- timing: silence ratio, longest silent stretch, minimum on-screen time of every visual
	const ts = timingStats(tl);
	add({
		group: 'timing',
		beat: 0,
		frame: 0,
		desc: `silence ratio <= ${MAX_SILENCE_RATIO * 100}% (no voice line playing / speech span)`,
		pure: () => (ts.silenceRatio <= MAX_SILENCE_RATIO ? null : `${(ts.silenceRatio * 100).toFixed(1)}% silent`),
	});
	add({
		group: 'timing',
		beat: ts.longestGapAfterBeat,
		frame: 0,
		desc: `longest silent stretch <= ${MAX_GAP_MS / 1000} s (lead-in and outro excluded)`,
		pure: () => (ts.longestGapMs <= MAX_GAP_MS ? null : `${(ts.longestGapMs / 1000).toFixed(2)} s after beat ${ts.longestGapAfterBeat}`),
	});
	add({
		group: 'timing',
		beat: 0,
		frame: 0,
		desc: `every visual stays on screen >= ${MIN_VISUAL_ON_SCREEN_MS / 1000} s`,
		pure: () => (ts.minVisualMs >= MIN_VISUAL_ON_SCREEN_MS - 1 ? null : `${ts.minVisualWhat} only ${(ts.minVisualMs / 1000).toFixed(2)} s`),
	});

	add({
		group: 'timing',
		beat: 0,
		frame: 0,
		desc: `whole-video silence incl. lead-in and end card: ${(ts.silenceRatioTotal * 100).toFixed(1)}% (reported, not gated)`,
		pure: () => null,
	});

	// --- transition frames: the first frames of every scene (the page turn / new layout)
	for (const sc of tl.scenes) {
		if (sc.index === 0 || sc.end - sc.start < 8 || (sc.items.length === 0 && !sc.phone)) continue;
		const f = sc.start + 4;
		add({
			group: 'transition',
			beat: beatOf(f),
			frame: f,
			desc: `scene ${sc.index} first frames (${sc.layout}): layout sound, no overflow or split words`,
			pure: () => layoutProblems(sc).join('; ') || null,
			still: ({probe}) => [...probe.problems, ...probe.splits.map((w) => `split word ${w}`)].join('; ') || null,
		});
	}

	// --- end card: the whole glossary is on it (paginated), nothing clipped, labels legible
	const pages = endPages(story);
	let pageStart = tl.endCard.start;
	const shownTerms = new Set(pages.flatMap((p) => p.blocks.filter((b) => b.kind === 'g').map((b) => b.term)));
	pages.forEach((pg, pi) => {
		const f = Math.min(pageStart + pg.frames - 2, pageStart + 12 + 9 * pg.blocks.length + 26); // everything written
		add({
			group: 'endcard',
			beat: tl.beats.length - 1,
			frame: f,
			desc: `end card page ${pi + 1}/${pages.length}: complete, fits, legible`,
			pure: () => {
				const room = END_BOTTOM - END_TOP;
				const used = pg.blocks.reduce((a, b) => a + b.h, 0) + (pg.blocks.some((b) => b.kind === 'g') ? 90 : 0) + (pg.blocks.some((b) => b.kind === 'p') ? 90 : 0);
				if (used > room + 1) return `page content ${Math.round(used)} px > ${room} px`;
				if (pg.fs < 22) return `font ${pg.fs} px`;
				if (pi === pages.length - 1) {
					const missing = story.glossary.filter((g) => !shownTerms.has(g.term)).map((g) => g.term);
					if (missing.length) return `glossary entries not on the end card: ${missing.join(', ')}`;
				}
				return null;
			},
			still: ({probe, img}) => {
				const probs = [...probe.problems, ...probe.splits.map((w) => `split word ${w}`)];
				for (const x of probe.fonts) {
					if (x.kind === 'label' && x.opacity > 0.5 && x.size < MIN_LABEL_PX - 0.5) probs.push(`"${x.text}" ${x.size.toFixed(1)} px`);
					if (x.kind === 'label' && x.opacity > 0.95 && x.rect.w >= 30 && x.rect.h >= 14) {
						const sc2 = sampleContrast(img, x.rect);
						if (sc2 && sc2.ratio < SAMPLED_MIN) probs.push(`"${x.text}" contrast ${sc2.ratio.toFixed(2)}:1`);
					}
				}
				return probs.join('; ') || null;
			},
		});
		add({
			group: 'zones.clear',
			beat: tl.beats.length - 1,
			frame: f,
			desc: `end card page ${pi + 1}/${pages.length}: no text inside an overlay zone`,
			pure: () => null,
			still: ({probe}) => zoneProblems(probe.zoneBoxes ?? []).join('; ') || null,
		});
		pageStart += pg.frames;
	});

	checks.sort((a, b) => a.frame - b.frame);
	return {checks, tl};
};

// ---------------------------------------------------------------- running
const pool = async <T,>(n: number, items: T[], fn: (x: T) => Promise<void>) => {
	let i = 0;
	await Promise.all(
		Array.from({length: n}, async () => {
			while (i < items.length) {
				const x = items[i++];
				await fn(x);
			}
		}),
	);
};

export interface VerifyOptions {
	story: Story;
	audio: AudioManifest;
	serveUrl: string;
	outDir: string;
	stills?: boolean;
	/** run the gate in this registry style instead of the script's own */
	style?: string;
	/** false: gate the unscheduled timeline (debugging: shows what the reveal scheduler fixes) */
	autoReveal?: boolean;
	}

export const verifyStory = async (opts: VerifyOptions): Promise<Report> => {
	const {audio, serveUrl, outDir} = opts;
	const story: Story = {...opts.story, style: (opts.style ?? opts.story.style ?? 'sketch') as Story['style']};
	const useStills = opts.stills !== false;
	const {checks, tl} = deriveChecks(story, audio, {autoReveal: opts.autoReveal});
	fs.mkdirSync(path.join(outDir, 'stills'), {recursive: true});

	const frames = [...new Set(checks.map((c) => c.frame))].sort((a, b) => a - b);
	const ctx = new Map<number, StillCtx | string>();

	if (useStills && frames.length) {
		const inputProps = {script: story, audio, probe: true};
		const composition = await selectComposition({serveUrl, id: 'Story', inputProps});
		const browser = await openBrowser('chrome');
		const probes = new Map<number, ProbeRep>();
		try {
			await pool(4, frames, async (f) => {
				const out = path.join(outDir, 'stills', `f${String(f).padStart(5, '0')}.png`);
				try {
					await renderStill({
						composition,
						serveUrl,
						inputProps,
						frame: Math.min(f, composition.durationInFrames - 1),
						output: out,
						imageFormat: 'png',
						overwrite: true,
						puppeteerInstance: browser,
						onBrowserLog: (log) => {
							if (log.text.startsWith('PROBE ')) {
								const rep = JSON.parse(log.text.slice(6)) as ProbeRep;
								probes.set(rep.frame, rep);
							}
						},
					});
					const png = PNG.sync.read(fs.readFileSync(out));
					const probe = probes.get(Math.min(f, composition.durationInFrames - 1));
					if (!probe) ctx.set(f, 'no DOM probe report received');
					else ctx.set(f, {probe, img: {w: png.width, h: png.height, data: png.data}});
				} catch (e) {
					ctx.set(f, `render failed: ${(e as Error).message.split('\n')[0]}`);
				}
			});
		} finally {
			await browser.close({silent: true} as never).catch?.(() => undefined);
		}
	}

	setActiveStyle(story.style); // pure checks measure text with the active style's fonts
	const results: Result[] = checks.map((c, i) => {
		let pure: string | null;
		try {
			pure = c.pure();
		} catch (e) {
			pure = `exception: ${(e as Error).message}`;
		}
		let still: string | null = null;
		let stillStatus: Result['still'] = '-';
		if (c.still && useStills) {
			const sc = ctx.get(c.frame);
			if (typeof sc === 'string' || !sc) {
				still = sc ?? 'no still';
				stillStatus = 'FAIL';
			} else {
				try {
					still = c.still(sc);
				} catch (e) {
					still = `exception: ${(e as Error).message}`;
				}
				stillStatus = still ? 'FAIL' : 'PASS';
			}
		}
		const detail = [pure && `state: ${pure}`, still && `still: ${still}`].filter(Boolean).join(' | ');
		return {
			n: i + 1,
			group: c.group,
			beat: c.beat,
			frame: c.frame,
			desc: c.desc,
			pure: pure ? 'FAIL' : 'PASS',
			still: stillStatus,
			detail,
			ok: !pure && !still,
		};
	});

	// contact sheet of the checked frames (in frame order)
	let contactSheet = '';
	if (useStills && frames.length) {
		try {
			const list = frames.map((f) => path.join(outDir, 'stills', `f${String(f).padStart(5, '0')}.png`)).filter((p) => fs.existsSync(p));
			const seqDir = path.join(outDir, 'seq');
			fs.rmSync(seqDir, {recursive: true, force: true});
			fs.mkdirSync(seqDir, {recursive: true});
			list.forEach((p, i) => fs.symlinkSync(p, path.join(seqDir, `c${String(i + 1).padStart(4, '0')}.png`)));
			const cols = 12;
			const rows = Math.ceil(list.length / cols);
			contactSheet = path.join(outDir, 'contact-sheet.png');
			execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(seqDir, 'c%04d.png'), '-vf', `scale=200:-1,tile=${cols}x${rows}:padding=4:color=0xdddddd`, '-frames:v', '1', contactSheet]);
			fs.rmSync(seqDir, {recursive: true, force: true});
		} catch (e) {
			console.warn(`verify: contact sheet failed: ${(e as Error).message.split('\n')[0]}`);
		}
	}

	const failed = results.filter((r) => !r.ok).length;
	const report: Report = {
		timing: timingStats(tl),
		style: story.style,
		results,
		total: results.length,
		passed: results.length - failed,
		failed,
		ok: failed === 0,
		contactSheet,
		automatedStills: useStills ? frames.length : 0,
	};
	fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
	return report;
};

export const printTiming = (t: TimingStats) =>
	console.log(
		`timing: speech ${(t.speechMs / 1000).toFixed(1)} s in ${(t.totalMs / 1000).toFixed(1)} s total | silence ratio ${(t.silenceRatio * 100).toFixed(1)}% (whole video incl. end card ${(t.silenceRatioTotal * 100).toFixed(1)}%) | longest silent stretch ${(t.longestGapMs / 1000).toFixed(2)} s (after beat ${t.longestGapAfterBeat}) | shortest visual ${(t.minVisualMs / 1000).toFixed(2)} s (${t.minVisualWhat})`,
	);

export const printReport = (rep: Report) => {
	const pad = (s: string | number, n: number) => String(s).padEnd(n).slice(0, n);
	console.log('\n  #   beat frame group           state still check');
	for (const r of rep.results) {
		console.log(`${pad(r.n, 4)} ${pad(r.beat, 4)} ${pad(r.frame, 5)} ${pad(r.group, 15)} ${pad(r.pure, 5)} ${pad(r.still, 5)} ${r.desc}${r.ok ? '' : '\n        -> ' + r.detail}`);
	}
	if (rep.timing) printTiming(rep.timing);
	console.log(`\nverify: ${rep.passed}/${rep.total} checks passed, ${rep.failed} failed (${rep.automatedStills} frames rendered)${rep.contactSheet ? `, contact sheet ${rep.contactSheet}` : ''}`);
};
