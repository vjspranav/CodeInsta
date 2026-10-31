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
export function orderFeed<
  T extends { id: string; creator_id: string; created_at: string },
>(rows: T[], seen: Set<string>): T[] {
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
  return [
    ...mix(rows.filter((r) => !seen.has(r.id))),
    ...mix(rows.filter((r) => seen.has(r.id))),
  ];
}
