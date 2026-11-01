import { describe, expect, it } from "vitest";
import { buildSnapshot, parseSnapshot, type WidgetSnapshot } from "./widget-snapshot";
import type { Category, Creator, MobileReel } from "./types";

const NOW = new Date("2026-11-02T12:00:00Z");

const categories: Category[] = [
  { slug: "android", label: "Android", description: "" },
  { slug: "frontier", label: "Frontier", description: "" },
  { slug: "tech-news", label: "Tech News", description: "" },
  { slug: "lab", label: "Lab", description: "" },
];
const creators: Creator[] = [
  { id: "c1", display_name: "Claude", handle: "claude", bio: "", avatar_url: null },
  { id: "c2", display_name: "Gemini", handle: "gemini", bio: "", avatar_url: null },
];

function reel(over: Partial<MobileReel> & { id: string }): MobileReel {
  return {
    creator_id: "c1",
    title: `Title ${over.id}`,
    topic: "android/binder",
    tags: [],
    series: null,
    series_index: null,
    created_at: "2026-11-01T00:00:00Z",
    video_url: "https://cdn.test/v.mp4",
    poster_url: null,
    glossary: null,
    parent_reel_id: null,
    genre: null,
    style: null,
    expires_at: null,
    ...over,
  };
}

const EMOJI = /\p{Extended_Pictographic}/u;

describe("buildSnapshot", () => {
  it("returns the empty state when there are no reels", () => {
    const s = buildSnapshot([], creators, categories, 4, NOW);
    expect(s).toEqual({ v: 1, updatedAt: NOW.toISOString(), streak: 4, newest: null, headline: null });
  });

  it("picks the most recent reel with creator name and category label", () => {
    const s = buildSnapshot(
      [
        reel({ id: "old", created_at: "2026-10-01T00:00:00Z" }),
        reel({ id: "new", created_at: "2026-11-01T10:00:00Z", creator_id: "c2" }),
      ],
      creators,
      categories,
      2,
      NOW,
    );
    expect(s.newest).toEqual({
      id: "new",
      title: "Title new",
      creator: "Gemini",
      category: "Android",
      deepLink: "codeinsta://reel/new",
    });
  });

  it("ignores lab reels for newest", () => {
    const s = buildSnapshot(
      [
        reel({ id: "lab1", topic: "lab/format", created_at: "2026-11-02T00:00:00Z" }),
        reel({ id: "lab2", topic: "lab-v3/x", created_at: "2026-11-02T01:00:00Z" }),
        reel({ id: "real", created_at: "2026-10-30T00:00:00Z" }),
      ],
      creators,
      categories,
      0,
      NOW,
    );
    expect(s.newest?.id).toBe("real");
  });

  it("returns the empty state when only lab reels exist", () => {
    const s = buildSnapshot([reel({ id: "l", topic: "lab/x" })], creators, categories, 1, NOW);
    expect(s.newest).toBeNull();
    expect(s.headline).toBeNull();
  });

  it("headline picks the newer tech-news over an older frontier", () => {
    const s = buildSnapshot(
      [
        reel({ id: "f", topic: "frontier/model", created_at: "2026-10-20T00:00:00Z" }),
        reel({ id: "n", topic: "tech-news/launch", created_at: "2026-10-25T00:00:00Z" }),
        reel({ id: "a", topic: "android/x", created_at: "2026-11-01T00:00:00Z" }),
      ],
      creators,
      categories,
      0,
      NOW,
    );
    expect(s.headline).toEqual({ id: "n", title: "Title n", deepLink: "codeinsta://reel/n" });
    expect(s.newest?.id).toBe("a");
  });

  it("skips an expired news reel", () => {
    const s = buildSnapshot(
      [
        reel({ id: "exp", topic: "tech-news/x", created_at: "2026-11-01T00:00:00Z", expires_at: "2026-11-02T11:59:59Z" }),
        reel({ id: "live", topic: "frontier/y", created_at: "2026-10-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z" }),
      ],
      creators,
      categories,
      0,
      NOW,
    );
    expect(s.headline?.id).toBe("live");
  });

  it("has no headline when every news reel is expired", () => {
    const s = buildSnapshot(
      [reel({ id: "exp", topic: "tech-news/x", expires_at: "2026-11-02T00:00:00Z" })],
      creators,
      categories,
      0,
      NOW,
    );
    expect(s.headline).toBeNull();
  });

  it("truncates a 200-char title to 80 chars ending in an ellipsis", () => {
    const s = buildSnapshot([reel({ id: "t", title: "x".repeat(200) })], creators, categories, 0, NOW);
    expect(s.newest!.title).toHaveLength(80);
    expect(s.newest!.title.endsWith("…")).toBe(true);
    const exact = buildSnapshot([reel({ id: "e", title: "y".repeat(80) })], creators, categories, 0, NOW);
    expect(exact.newest!.title).toBe("y".repeat(80));
  });

  it("falls back safely for an unknown creator or category", () => {
    const s = buildSnapshot([reel({ id: "u", creator_id: "zz", topic: "mystery/x" })], creators, categories, 0, NOW);
    expect(s.newest).toMatchObject({ creator: "", category: "mystery" });
  });

  it("clamps a bad streak to a non-negative integer", () => {
    expect(buildSnapshot([], creators, categories, -3, NOW).streak).toBe(0);
    expect(buildSnapshot([], creators, categories, Number.NaN, NOW).streak).toBe(0);
    expect(buildSnapshot([], creators, categories, 2.9, NOW).streak).toBe(2);
  });

  it("contains no emoji in any field", () => {
    const s = buildSnapshot(
      [
        reel({ id: "a", title: "x".repeat(200) }),
        reel({ id: "n", topic: "tech-news/z", created_at: "2026-10-31T00:00:00Z" }),
      ],
      creators,
      categories,
      5,
      NOW,
    );
    expect(EMOJI.test(JSON.stringify(s))).toBe(false);
  });
});

describe("parseSnapshot", () => {
  it("returns null for null, bad JSON, wrong version, and garbage", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("")).toBeNull();
    expect(parseSnapshot("{")).toBeNull();
    expect(parseSnapshot('{"v":2}')).toBeNull();
    expect(parseSnapshot("null")).toBeNull();
    expect(parseSnapshot("42")).toBeNull();
    expect(parseSnapshot("[]")).toBeNull();
    expect(parseSnapshot('"text"')).toBeNull();
    expect(parseSnapshot(undefined as unknown as string)).toBeNull();
    expect(parseSnapshot(123 as unknown as string)).toBeNull();
  });

  it("returns null when required fields are missing or the wrong type", () => {
    expect(parseSnapshot('{"v":1}')).toBeNull();
    expect(parseSnapshot('{"v":1,"updatedAt":"x","streak":"3","newest":null,"headline":null}')).toBeNull();
    expect(parseSnapshot('{"v":1,"updatedAt":"x","streak":1,"newest":{"id":1},"headline":null}')).toBeNull();
  });

  it("round-trips a built snapshot", () => {
    const s: WidgetSnapshot = buildSnapshot(
      [reel({ id: "a" }), reel({ id: "n", topic: "tech-news/z" })],
      creators,
      categories,
      7,
      NOW,
    );
    expect(parseSnapshot(JSON.stringify(s))).toEqual(s);
    const empty = buildSnapshot([], creators, categories, 0, NOW);
    expect(parseSnapshot(JSON.stringify(empty))).toEqual(empty);
  });
});
