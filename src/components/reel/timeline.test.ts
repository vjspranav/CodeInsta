import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateReel, type ReelElement } from "../../lib/reel-schema";
import { center, orderFeed, scoreFeed, timeline, wordTimings } from "./timeline";
import { isAllowed } from "../../lib/supabase/allowlist";
import { readdirSync } from "node:fs";
const file = readdirSync("content/examples").find((name) =>
  name.endsWith(".json"),
)!;
const result = validateReel(
  JSON.parse(readFileSync(`content/examples/${file}`, "utf8")),
);
if (!result.ok) throw new Error(result.errors.join("\n"));
const script = result.reel;
describe("audio timeline", () => {
  it("uses audio duration for cards, pads scenes and adds a series cliffhanger", () => {
    const frames = timeline(
      script,
      {
        voice: "af_heart",
        hook: { url: "hook.mp3", duration_ms: 1400 },
        scenes: script.scenes.map(() => ({
          url: "scene.mp3",
          duration_ms: 20000,
          words: [{ w: "hello", start_ms: 0 }],
        })),
        takeaway: { url: "end.mp3", duration_ms: 1900 },
      },
      3,
    );
    expect(frames[0].duration).toBe(1400);
    expect(frames[1].duration).toBe(20250);
    expect(frames[1].words[0].w).toBe("hello");
    expect(frames.at(-2)?.duration).toBe(1900);
    expect(frames.at(-1)?.text).toBe("Part 3 →");
  });
  it("provides narration and caption timings without recorded audio", () => {
    const frames = timeline(script, null);
    expect(frames).toHaveLength(script.scenes.length + 2);
    expect(frames[1].text).toBe(
      script.scenes[0].narration || script.scenes[0].caption,
    );
    expect(frames[1].duration).toBe(script.scenes[0].duration_ms);
    expect(wordTimings("", 1000)).toEqual([]);
    const words = wordTimings("A longer word", 1000);
    expect(words[0].start_ms).toBe(0);
    expect(words[2].start_ms).toBeGreaterThan(words[1].start_ms);
    expect(words[2].start_ms).toBeLessThan(1000);
  });
});
describe("feed order", () => {
  it("prioritizes unseen, alternates creators, and retains newest order per creator", () => {
    const rows = [
      { id: "1", creator_id: "gpt", created_at: "2026-10-31" },
      { id: "2", creator_id: "gpt", created_at: "2026-10-30" },
      { id: "3", creator_id: "claude", created_at: "2026-10-29" },
      { id: "4", creator_id: "claude", created_at: "2026-10-28" },
    ];
    expect(orderFeed(rows, new Set(["1"])).map((r) => r.id)).toEqual([
      "2",
      "3",
      "4",
      "1",
    ]);
    expect(orderFeed(rows, new Set()).map((r) => r.id)).toEqual([
      "1",
      "3",
      "2",
      "4",
    ]);
    expect(rows[0].id).toBe("1");
  });
});
it("resolves forward references and safely handles valid reference cycles", () => {
  const elements: ReelElement[] = [
    { id: "a", type: "arrow", from: "b", to: "c", at: 0, enter: "draw" },
    { id: "b", type: "highlight", target: "a", at: 0, enter: "fade" },
    {
      id: "c",
      type: "box",
      text: "Box",
      x: 10,
      y: 20,
      w: 20,
      h: 10,
      at: 0,
      enter: "pop",
    },
  ];
  expect(center("c", elements)).toEqual({ x: 20, y: 25 });
  expect(Number.isFinite(center("a", elements).x)).toBe(true);
});
it("fails closed on absent allowlists and matches whole normalized emails only", () => {
  expect(isAllowed("friend@example.com", "")).toBe(false);
  expect(isAllowed(undefined, "friend@example.com")).toBe(false);
  expect(
    isAllowed(" FRIEND@example.com ", "other@example.com, friend@example.com"),
  ).toBe(true);
  expect(isAllowed("attackerfriend@example.com", "friend@example.com")).toBe(
    false,
  );
});

describe("interest ranking", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    creator_id: "claude",
    created_at: "2026-01-01T00:00:00Z",
    topic: "networking/tcp",
    series: null as string | null,
    series_index: null as number | null,
    parent_reel_id: null as string | null,
    ...extra,
  });
  const ctx = (extra = {}) => ({ areas: [] as string[], liked: new Set<string>(), fulfilled: new Set<string>(), now, ...extra });
  it("scores each signal exactly", () => {
    const rows = [
      row("seen1", { series: "s", series_index: 1 }),
      row("next", { series: "s", series_index: 2 }),
      row("later", { series: "s", series_index: 3 }),
      row("child", { parent_reel_id: "liked" }),
      row("mine"),
      row("area", { topic: "aosp/binder" }),
      row("fresh", { created_at: "2026-11-01T00:00:00Z" }),
      row("week", { created_at: "2026-10-25T00:00:00Z" }),
    ];
    const scores = scoreFeed(rows, new Set(["seen1"]), ctx({ areas: ["aosp"], liked: new Set(["liked"]), fulfilled: new Set(["mine"]) }));
    expect(scores.get("next")).toBe(100);
    expect(scores.get("later")).toBe(0);
    expect(scores.get("child")).toBe(60);
    expect(scores.get("mine")).toBe(80);
    expect(scores.get("area")).toBe(40);
    expect(scores.get("fresh")).toBe(20);
    expect(scores.get("week")).toBeCloseTo(10);
  });
  it("ranks by score, puts seen last, and explores every fifth slot", () => {
    const rows = [
      ...[1, 2, 3, 4, 5, 6].map((n) => row(`a${n}`, { topic: "aosp/x", created_at: `2026-01-0${n}T00:00:00Z` })),
      row("out", { topic: "databases/x" }),
      row("done", { topic: "aosp/x" }),
    ];
    const ids = orderFeed(rows, new Set(["done"]), ctx({ areas: ["aosp"] })).map((r) => r.id);
    expect(ids).toEqual(["a6", "a5", "a4", "a3", "out", "a2", "a1", "done"]);
  });
  it("keeps the original order without interest context", () => {
    const rows = [row("1"), row("2", { created_at: "2026-02-01T00:00:00Z" })];
    expect(orderFeed(rows, new Set()).map((r) => r.id)).toEqual(["2", "1"]);
  });
});
describe("multi-voice timeline", () => {
  const cast = [
    { id: "a", name: "Ana", role: "Senior", voice: "af_heart", color: "purple" as const },
    { id: "b", name: "Bo", role: "Junior", voice: "am_michael", color: "green" as const },
  ];
  const multi = {
    ...script,
    cast,
    scenes: script.scenes.map((scene, i) =>
      i === 0
        ? { ...scene, lines: [{ speaker: "a", text: "Why so fast?" }, { speaker: "b", text: "Caching, mostly." }] }
        : scene,
    ),
  };
  it("sums line clips plus gaps and exposes one caption line per clip", () => {
    const audio = {
      voice: "x",
      hook: { url: "h", duration_ms: 1000 },
      scenes: multi.scenes.map((_, i) =>
        i === 0
          ? {
              url: "",
              duration_ms: 0,
              words: [],
              lines: [
                { url: "l0", duration_ms: 1500, speaker: "a", words: [] },
                { url: "l1", duration_ms: 2000, speaker: "b", words: [] },
              ],
            }
          : { url: "s", duration_ms: 1000, words: [] },
      ),
      takeaway: { url: "t", duration_ms: 1000 },
    };
    const frame = timeline(multi, audio)[1];
    expect(frame.lines.map((l) => [l.speaker, l.start, l.url])).toEqual([
      ["a", 0, "l0"],
      ["b", 1750, "l1"],
    ]);
    expect(frame.duration).toBe(1500 + 250 + 2000 + 250);
  });
  it("falls back to the authored duration without audio", () => {
    const frame = timeline(multi, null)[1];
    expect(frame.duration).toBe(script.scenes[0].duration_ms);
    expect(frame.lines).toHaveLength(2);
    expect(frame.lines[0].url).toBeUndefined();
  });
  it("splits legacy narration into whole sentences", () => {
    const frame = timeline(script, null)[1];
    expect(frame.lines.length).toBeGreaterThan(0);
    expect(frame.lines.map((l) => l.text).join(" ")).toBe(frame.words.map((w) => w.w).join(" "));
  });
});
