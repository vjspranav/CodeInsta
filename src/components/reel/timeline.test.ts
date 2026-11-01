import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateReel, type ReelElement } from "../../lib/reel-schema";
import { bubbleContent, center, timeline, wordTimings } from "./timeline";
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


describe("speech-bound chat bubbles", () => {
  const frame = {
    ...timeline(script, null)[1],
    elements: [
      { id: "q", type: "bubble" as const, speaker: "junior", text: "Question", y: 10, at: 0, enter: "fade" as const },
      { id: "a", type: "bubble" as const, speaker: "senior", text: "Spoiler", y: 40, at: 0, enter: "fade" as const },
    ],
    lines: [
      { speaker: "junior", text: "Why is it slow?", start: 0, duration: 2000, words: [] },
      { speaker: "senior", text: "The cache is empty.", start: 2250, duration: 4000, words: [] },
      { speaker: "junior", text: "Now I see.", start: 6500, duration: 1000, words: [] },
    ],
  };
  it("hides the answer during the question regardless of authored offsets", () => {
    expect(bubbleContent(frame, frame.elements[1], 1000)).toBeNull();
    expect(bubbleContent(frame, frame.elements[0], 1000)).toBe("Why is it slow?");
  });
  it("uses the current spoken text and hides bubbles in gaps and other turns", () => {
    expect(bubbleContent(frame, frame.elements[0], 2100)).toBeNull();
    expect(bubbleContent(frame, frame.elements[0], 2500)).toBeNull();
    expect(bubbleContent(frame, frame.elements[1], 2500)).toBe("The cache is empty.");
    expect(bubbleContent(frame, frame.elements[0], 6600)).toBe("Now I see.");
    expect(bubbleContent(frame, frame.elements[0], 7500)).toBeNull();
  });
});

