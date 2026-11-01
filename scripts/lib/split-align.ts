/**
 * Splits one long TTS take into per-line time ranges using word timestamps (from a transcript of the take).
 * More reliable than guessing cuts from silences alone: the words say which silence is the line boundary.
 */
import { align, normalizeSpans } from "./voice-normalize";

export type TimedWord = { word: string; start: number; end: number };
type Gap = { start: number; end: number };

/**
 * `lines` are the texts as voiced, in order. Returns one {start,end} per line, cutting inside the silence (or the gap between the
 * last word of a line and the first word of the next). Undefined when the words cannot be aligned to the lines.
 */
export function alignSplit(lines: string[], words: TimedWord[], silences: Gap[], totalSec: number): { start: number; end: number }[] | undefined {
  if (!words.length || !lines.length) return undefined;
  if (lines.length === 1) return [{ start: 0, end: totalSec }];
  const heard = normalizeSpans(words.map((w) => w.word));
  const wantToks = lines.map((l) => normalizeSpans([l]).map((t) => t.tok));
  const flat = wantToks.flat();
  const owner = wantToks.flatMap((t, i) => t.map(() => i));
  const pairs = align(flat, heard.map((h) => h.tok));
  const first: number[] = new Array(lines.length).fill(-1);
  const last: number[] = new Array(lines.length).fill(-1);
  const matched: number[] = new Array(lines.length).fill(0);
  for (const [wi, hj] of pairs) {
    const l = owner[wi];
    if (first[l] < 0) first[l] = heard[hj].from;
    last[l] = heard[hj].to;
    matched[l]++;
  }
  for (let i = 0; i < lines.length; i++) if (matched[i] === 0 || matched[i] < 0.5 * wantToks[i].length) return undefined;
  const cuts: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    const gapStart = words[last[i]].end;
    const gapEnd = words[first[i + 1]].start;
    if (gapEnd < gapStart - 0.3) return undefined; // lines overlap in time: alignment is unreliable
    const lo = Math.min(gapStart, gapEnd) - 0.1;
    const hi = Math.max(gapStart, gapEnd) + 0.1;
    const inGap = silences.filter((s) => s.end > lo && s.start < hi).sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    const cut = inGap ? (inGap.start + inGap.end) / 2 : (gapStart + gapEnd) / 2;
    if (cut <= cuts[cuts.length - 1] + 0.05) return undefined;
    cuts.push(cut);
  }
  cuts.push(totalSec);
  return cuts.slice(0, -1).map((c, i) => ({ start: c, end: cuts[i + 1] }));
}
