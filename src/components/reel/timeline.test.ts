import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateReel, type ReelElement } from "../../lib/reel-schema";
import { center, orderFeed, timeline, wordTimings } from "./timeline";
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
