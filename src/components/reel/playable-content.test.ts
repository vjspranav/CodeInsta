import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playableContent } from "./playable-content";

describe("playable reel loading", () => {
  it("keeps a v3 video even though it is not a legacy scene script", () => {
    expect(playableContent({ version: 3, format: "story", beats: [] }, "https://example.com/story.mp4")).toEqual({ script: null });
  });
  it("supports a video without a script", () => {
    expect(playableContent(null, "https://example.com/story.mp4")).toEqual({ script: null });
  });
  it("still rejects invalid script-only reels", () => {
    expect(playableContent({ version: 3, beats: [] })).toBeNull();
    expect(playableContent(null, "")).toBeNull();
  });
  it("keeps validated legacy scenes for the live player", () => {
    const script = JSON.parse(readFileSync(new URL("../../../content/examples/virtual-addresses.json", import.meta.url), "utf8"));
    expect(playableContent(script)?.script?.scenes.length).toBeGreaterThan(0);
  });
  it("keeps a v3 poster frame URL and drops non-https ones", () => {
    const v3 = { version: 3, format: "story", poster_url: "https://x.supabase.co/storage/v1/object/public/reel-video/claude/a.jpg" };
    expect(playableContent(v3, "https://x/v.mp4")).toEqual({ script: null, poster_url: v3.poster_url });
    expect(playableContent({ ...v3, poster_url: "javascript:alert(1)" }, "https://x/v.mp4")).toEqual({ script: null });
  });
});
