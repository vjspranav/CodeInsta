import type { MobileReel } from "@shared/types";
import { creatorReels } from "./profiles";

const reel = (id: string, creator: string, created_at: string, extra: Partial<MobileReel> = {}): MobileReel => ({
  id,
  creator_id: creator,
  title: id,
  topic: "aosp/x",
  tags: [],
  series: null,
  series_index: null,
  created_at,
  video_url: "https://cdn.example/v.mp4",
  poster_url: null,
  glossary: null,
  parent_reel_id: null,
  genre: null,
  style: null,
  expires_at: null,
  ...extra,
});

describe("creatorReels", () => {
  it("returns only that creator's reels", () => {
    const reels = [reel("a", "claude", "2026-10-01T00:00:00Z"), reel("b", "gpt", "2026-10-02T00:00:00Z")];
    expect(creatorReels({ reels }, "gpt").map((r) => r.id)).toEqual(["b"]);
    expect(creatorReels({ reels }, "nobody")).toEqual([]);
  });

  it("lists standalone reels newest first", () => {
    const reels = [reel("old", "claude", "2026-10-01T00:00:00Z"), reel("new", "claude", "2026-10-09T00:00:00Z")];
    expect(creatorReels({ reels }, "claude").map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("puts Part 1 before Part 2 even when Part 2 is newer", () => {
    const reels = [
      reel("p2", "claude", "2026-10-09T00:00:00Z", { series: "binder", series_index: 2, topic: "aosp/binder/part-2" }),
      reel("p1", "claude", "2026-10-01T00:00:00Z", { series: "binder", series_index: 1, topic: "aosp/binder/part-1" }),
      reel("solo", "claude", "2026-10-05T00:00:00Z"),
    ];
    const ids = creatorReels({ reels }, "claude").map((r) => r.id);
    expect(ids.indexOf("p1")).toBeLessThan(ids.indexOf("p2"));
    expect(ids).toHaveLength(3);
  });

  it("reflects the upstream library as given (lab and archived reels were already dropped)", () => {
    const reels = [reel("live", "claude", "2026-10-01T00:00:00Z")];
    expect(creatorReels({ reels }, "claude")).toHaveLength(1);
  });
});
