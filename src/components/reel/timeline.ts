import type { Reel, ReelElement } from "@/lib/reel-schema";
import type { AudioJson, WordTiming } from "@/lib/reel-audio";
export type Frame = {
  text: string;
  caption: string;
  duration: number;
  elements: ReelElement[];
  url?: string;
  words: WordTiming[];
  card?: "hook" | "takeaway" | "next";
};
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
export function timeline(
  script: Reel,
  audio: AudioJson | null,
  nextPart?: number,
): Frame[] {
  const card = (
    text: string,
    kind: "hook" | "takeaway",
    clip?: { url: string; duration_ms: number },
  ): Frame => {
    const duration =
      clip?.duration_ms || Math.max(2500, text.split(/\s+/).length * 370);
    return {
      text,
      caption: text,
      card: kind,
      duration,
      url: clip?.url,
      elements: [],
      words: wordTimings(text, duration),
    };
  };
  return [
    card(script.hook, "hook", audio?.hook),
    ...script.scenes.map((scene, i): Frame => {
      const clip = audio?.scenes?.[i],
        text = scene.narration || scene.caption;
      const duration = Math.max(
        scene.duration_ms,
        clip ? clip.duration_ms + 250 : 0,
      );
      return {
        text,
        caption: scene.caption,
        duration,
        url: clip?.url,
        elements: scene.elements,
        words: clip?.words?.length ? clip.words : wordTimings(text, duration),
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
          },
        ]
      : []),
  ];
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
  if ("x" in e) return { x: e.x + (e.w ?? 30) / 2, y: e.y + (e.h ?? 8) / 2 };
  if (e.type === "highlight") return center(e.target, elements, visited);
  const a = center(e.from, elements, new Set(visited)),
    b = center(e.to, elements, new Set(visited));
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
export type FeedContext = {
  areas: string[];
  liked: Set<string>;
  fulfilled: Set<string>;
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
  const scores = new Map<string, number>();
  for (const r of rows) {
    let score = 0;
    if (r.series && nextPart.get(r.series) === r.id) score += 100;
    if (r.parent_reel_id && context.liked.has(r.parent_reel_id)) score += 60;
    if (context.fulfilled.has(r.id)) score += 80;
    if (context.areas.includes((r.topic ?? "").split("/")[0])) score += 40;
    const age = (now - new Date(r.created_at).getTime()) / DAY;
    score += 20 * Math.min(1, Math.max(0, 1 - age / 14));
    scores.set(r.id, score);
  }
  return scores;
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
  if (!context) return [...mix(unseen), ...seenRows];
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
  return [...ordered, ...seenRows];
}
