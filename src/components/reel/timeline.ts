import type { CastMember, Reel, ReelElement } from "@/lib/reel-schema";
import type { AudioJson, WordTiming } from "@/lib/reel-audio";
/** One caption unit: a single speaker's sentence. `words` start relative to `start`. */
export type FrameLine = {
  speaker?: string;
  text: string;
  start: number;
  duration: number;
  url?: string;
  words: WordTiming[];
};
export type Frame = {
  text: string;
  caption: string;
  duration: number;
  elements: ReelElement[];
  url?: string;
  /** Word timings from the frame start (all lines, absolute). */
  words: WordTiming[];
  /** Captions play these one at a time; per-line clips (multi-voice) carry their own url. */
  lines: FrameLine[];
  cast: CastMember[];
  card?: "hook" | "takeaway" | "next";
};
export const LINE_GAP_MS = 250;
const MAX_CAPTION_WORDS = 14;
export function wordTimings(text: string, duration: number): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean),
    total = words.reduce((n, word) => n + word.length + 1, 0);
  let cursor = 0;
  return words.map((w) => {
    const start_ms = (cursor / Math.max(1, total)) * duration;
    cursor += w.length + 1;
    return { w, start_ms };
  });
}
/** Splits timed words into whole sentences (never fragments), halving very long ones. */
export function captionLines(words: WordTiming[], duration: number): FrameLine[] {
  const groups: WordTiming[][] = [];
  let current: WordTiming[] = [];
  for (const word of words) {
    current.push(word);
    if (/[.!?…]["')\]]*$/.test(word.w)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  const pieces = groups.flatMap((group) => {
    if (group.length <= MAX_CAPTION_WORDS) return [group];
    const parts = Math.ceil(group.length / MAX_CAPTION_WORDS),
      size = Math.ceil(group.length / parts);
    return Array.from({ length: parts }, (_, i) => group.slice(i * size, (i + 1) * size));
  });
  return pieces.map((piece, i) => {
    const start = i === 0 ? 0 : piece[0].start_ms,
      end = i + 1 < pieces.length ? pieces[i + 1][0].start_ms : duration;
    return {
      text: piece.map((w) => w.w).join(" "),
      start,
      duration: Math.max(0, end - start),
      words: piece.map((w) => ({ w: w.w, start_ms: Math.max(0, w.start_ms - start) })),
    };
  });
}
const estimate = (text: string) =>
  Math.max(1200, text.split(/\s+/).filter(Boolean).length * 330);
export function timeline(
  script: Reel,
  audio: AudioJson | null,
  nextPart?: number,
): Frame[] {
  const cast = script.cast ?? [];
  const card = (
    text: string,
    kind: "hook" | "takeaway",
    clip?: { url: string; duration_ms: number },
  ): Frame => {
    const duration =
      clip?.duration_ms || Math.max(2500, text.split(/\s+/).length * 370);
    const words = wordTimings(text, duration);
    return {
      text,
      caption: text,
      card: kind,
      duration,
      url: clip?.url,
      elements: [],
      words,
      lines: captionLines(words, duration),
      cast,
    };
  };
  return [
    card(script.hook, "hook", audio?.hook),
    ...script.scenes.map((scene, i): Frame => {
      const clip = audio?.scenes?.[i];
      if (scene.lines?.length) {
        // Multi-voice: play the line clips back to back with a small gap.
        let cursor = 0,
          recorded = true;
        const lines = scene.lines.map((line, j): FrameLine => {
          const lineClip = clip?.lines?.[j];
          recorded &&= Boolean(lineClip?.url);
          const duration = lineClip?.duration_ms || estimate(line.text),
            start = cursor;
          cursor += duration + LINE_GAP_MS;
          return {
            speaker: line.speaker,
            text: line.text,
            start,
            duration,
            url: lineClip?.url || undefined,
            words: lineClip?.words?.length ? lineClip.words : wordTimings(line.text, duration),
          };
        });
        const spoken = cursor - LINE_GAP_MS;
        // Elements must never be cut off by a short recording.
        const lastAt = Math.max(0, ...scene.elements.map((e) => e.at));
        const duration = recorded
          ? Math.max(spoken + LINE_GAP_MS, lastAt + 600)
          : Math.max(scene.duration_ms, spoken + LINE_GAP_MS);
        return {
          text: scene.lines.map((l) => l.text).join(" "),
          caption: scene.caption,
          duration,
          elements: scene.elements,
          words: lines.flatMap((l) => l.words.map((w) => ({ w: w.w, start_ms: l.start + w.start_ms }))),
          lines,
          cast,
        };
      }
      const text = scene.narration || scene.caption;
      const duration = Math.max(
        scene.duration_ms,
        clip?.url ? clip.duration_ms + 250 : 0,
      );
      const words = clip?.words?.length ? clip.words : wordTimings(text, duration);
      return {
        text,
        caption: scene.caption,
        duration,
        url: clip?.url || undefined,
        elements: scene.elements,
        words,
        lines: captionLines(words, duration),
        cast,
      };
    }),
    card(script.takeaway, "takeaway", audio?.takeaway),
    ...(nextPart
      ? [
          {
            text: `Part ${nextPart} →`,
            caption: "Keep the thread going",
            card: "next" as const,
            duration: 1800,
            elements: [],
            words: [],
            lines: [],
            cast,
          },
        ]
      : []),
  ];
}
/** Index of the line being spoken (the latest that has started). */
export function lineAt(frame: Frame, elapsed: number): number {
  let index = 0;
  frame.lines.forEach((line, i) => {
    if (elapsed >= line.start) index = i;
  });
  return index;
}
/** A speaker's bubble is a slot for their current spoken line, never a timed spoiler. */
export function bubbleContent(
  frame: Frame,
  bubble: Extract<ReelElement, { type: "bubble" }>,
  elapsed: number,
): string | null {
  if (!frame.lines.some((line) => line.speaker)) return elapsed >= bubble.at ? bubble.text : null;
  const slot = frame.elements.find((element) => element.type === "bubble" && element.speaker === bubble.speaker);
  if (slot?.id !== bubble.id) return null;
  const line = frame.lines.find((line) => elapsed >= line.start && elapsed < line.start + line.duration);
  return line?.speaker === bubble.speaker ? line.text : null;
}
/** Index of the highlighted word within a line. */
export function wordAt(line: FrameLine, elapsed: number): number {
  const local = elapsed - line.start;
  let index = 0;
  line.words.forEach((word, i) => {
    if (local >= word.start_ms) index = i;
  });
  return index;
}
export function center(
  id: string,
  elements: ReelElement[],
  visited = new Set<string>(),
): { x: number; y: number } {
  if (visited.has(id)) return { x: 50, y: 50 };
  visited.add(id);
  const e = elements.find((e) => e.id === id);
  if (!e) return { x: 50, y: 50 };
  if ("y" in e) return { x: (e.x ?? 5) + (e.w ?? 30) / 2, y: e.y + (e.h ?? 8) / 2 };
  if (e.type === "highlight") return center(e.target, elements, visited);
  const a = center(e.from, elements, new Set(visited)),
    b = center(e.to, elements, new Set(visited));
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
export type FeedContext = {
  areas: string[];
  liked: Set<string>;
  fulfilled: Set<string>;
  disliked?: Set<string>;
  now?: number;
};
type FeedRow = {
  id: string;
  creator_id: string;
  created_at: string;
  topic?: string;
  series?: string | null;
  series_index?: number | null;
  parent_reel_id?: string | null;
  genre?: string | null;
  style?: string | null;
};
const DAY = 86_400_000;

export function scoreFeed<T extends FeedRow>(
  rows: T[],
  seen: Set<string>,
  context: FeedContext,
): Map<string, number> {
  const now = context.now ?? Date.now(),
    maxSeen = new Map<string, number>();
  for (const r of rows)
    if (seen.has(r.id) && r.series && r.series_index != null)
      maxSeen.set(r.series, Math.max(maxSeen.get(r.series) ?? 0, r.series_index));
  const nextPart = new Map<string, string>();
  for (const [series, max] of maxSeen) {
    const next = rows
      .filter((r) => r.series === series && !seen.has(r.id) && (r.series_index ?? 0) > max)
      .sort((a, b) => a.series_index! - b.series_index!)[0];
    if (next) nextPart.set(series, next.id);
  }
  const dislikedRows = rows.filter((r) => context.disliked?.has(r.id) && r.genre);
  const scores = new Map<string, number>();
  for (const r of rows) {
    let score = 0;
    if (r.series && nextPart.get(r.series) === r.id) score += 100;
    if (r.parent_reel_id && context.liked.has(r.parent_reel_id)) score += 60;
    if (context.fulfilled.has(r.id)) score += 80;
    if (context.areas.includes((r.topic ?? "").split("/")[0])) score += 40;
    const age = (now - new Date(r.created_at).getTime()) / DAY;
    score += 20 * Math.min(1, Math.max(0, 1 - age / 14));
    if (!seen.has(r.id) && r.genre) {
      const sameGenre = dislikedRows.filter((d) => d.genre === r.genre);
      if (sameGenre.some((d) => r.style && d.style === r.style)) score -= 60;
      else if (sameGenre.length) score -= 25;
    }
    scores.set(r.id, score);
  }
  return scores;
}

const seriesKey = (r: FeedRow) => (r.series && r.series_index != null ? `${r.creator_id}/${r.series}` : null);
const isPart = (r: FeedRow) => /\/part-\d+$/.test(r.topic ?? "");

/**
 * Unwatched reels of one series always play in series_index order: the series' slots keep their ranked
 * positions but are refilled lowest index first. Parts of one story (topic ending in /part-N) also play
 * back to back, so Part 2 follows Part 1 directly. Owner rule: a later part never shows before an earlier one.
 */
export function seriesInOrder<T extends FeedRow>(list: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const r of list) {
    const k = seriesKey(r);
    if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const g of groups.values()) g.sort((a, b) => a.series_index! - b.series_index!);
  const used = new Map<string, number>();
  const slotted = list.map((r) => {
    const k = seriesKey(r);
    if (!k) return r;
    const i = used.get(k) ?? 0;
    used.set(k, i + 1);
    return groups.get(k)![i];
  });
  const out: T[] = [];
  const placed = new Set<string>();
  for (const r of slotted) {
    if (placed.has(r.id)) continue;
    out.push(r);
    placed.add(r.id);
    const k = seriesKey(r);
    if (!k || !isPart(r)) continue;
    for (const next of groups.get(k)!) {
      if (next.series_index! > r.series_index! && isPart(next) && !placed.has(next.id)) {
        out.push(next);
        placed.add(next.id);
      }
    }
  }
  return out;
}

/** Opening Part N directly: any unwatched earlier parts of the same story play first. */
export function withEarlierParts<T extends FeedRow>(target: T, all: T[], seen: Set<string>): T[] {
  const k = seriesKey(target);
  if (!k || !isPart(target)) return [target];
  const earlier = all
    .filter((r) => seriesKey(r) === k && isPart(r) && r.series_index! < target.series_index! && !seen.has(r.id))
    .sort((a, b) => a.series_index! - b.series_index!);
  return [...earlier, target];
}

export function orderFeed<T extends FeedRow>(
  rows: T[],
  seen: Set<string>,
  context?: FeedContext,
): T[] {
  const mix = (group: T[]) => {
    const sorted = [...group].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
      result: T[] = [];
    while (sorted.length) {
      const index = result.length
        ? sorted.findIndex(
            (r) => r.creator_id !== result[result.length - 1].creator_id,
          )
        : 0;
      result.push(sorted.splice(Math.max(0, index), 1)[0]);
    }
    return result;
  };
  const unseen = rows.filter((r) => !seen.has(r.id)),
    seenRows = mix(rows.filter((r) => seen.has(r.id)));
  if (!context) return [...seriesInOrder(mix(unseen)), ...seenRows];
  const scores = scoreFeed(rows, seen, context),
    remaining = [...unseen].sort(
      (a, b) =>
        scores.get(b.id)! - scores.get(a.id)! ||
        b.created_at.localeCompare(a.created_at),
    ),
    ordered: T[] = [];
  // Every fifth slot is an exploration pick from an area the user did not select.
  const outside = (r: T) => !context.areas.includes((r.topic ?? "").split("/")[0]);
  while (remaining.length) {
    const explore = context.areas.length > 0 && ordered.length % 5 === 4,
      index = explore ? remaining.findIndex(outside) : -1;
    ordered.push(remaining.splice(Math.max(0, index), 1)[0]);
  }
  return [...seriesInOrder(ordered), ...seenRows];
}
