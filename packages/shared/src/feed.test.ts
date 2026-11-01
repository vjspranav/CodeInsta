import { describe, expect, it } from "vitest";
import { orderFeed, scoreFeed, seriesInOrder, withEarlierParts } from "./feed";

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
  it("demotes unseen matching genres/styles once, without hiding any topic", () => {
    const rows = [
      row("disliked", { genre: "story", style: "sketch" }),
      row("another-dislike", { genre: "story", style: "sketch" }),
      row("both", { genre: "story", style: "sketch", topic: "ml/basics" }),
      row("genre", { genre: "story", style: "terminal" }),
      row("style-only", { genre: "trace", style: "sketch" }),
      row("legacy", { genre: null, style: null }),
      row("seen", { genre: "story", style: "sketch" }),
    ];
    const seen = new Set(["disliked", "another-dislike", "seen"]);
    const context = ctx({ disliked: new Set(["disliked", "another-dislike"]) });
    const scores = scoreFeed(rows, seen, context);
    expect(scores.get("both")).toBe(-60);
    expect(scores.get("genre")).toBe(-25);
    expect(scores.get("style-only")).toBe(0);
    expect(scores.get("legacy")).toBe(0);
    expect(scores.get("seen")).toBe(0);
    const ordered = orderFeed(rows, seen, context).map((r) => r.id);
    expect(ordered.slice(0, 4)).toEqual(["style-only", "legacy", "genre", "both"]);
    expect(new Set(ordered)).toEqual(new Set(rows.map((r) => r.id)));
    expect(scoreFeed(rows, seen, ctx()).get("both")).toBe(0);
  });
  it("does not treat missing styles as a style match, or missing genres as a genre match", () => {
    const rows = [row("disliked", { genre: "story", style: null }), row("genre", { genre: "story", style: null }), row("legacy", { genre: null, style: null })];
    const scores = scoreFeed(rows, new Set(["disliked"]), ctx({ disliked: new Set(["disliked", "legacy"]) }));
    expect(scores.get("genre")).toBe(-25);
    expect(scores.get("legacy")).toBe(0);
  });
  it("keeps the original order without interest context", () => {
    const rows = [row("1"), row("2", { created_at: "2026-02-01T00:00:00Z" })];
    expect(orderFeed(rows, new Set()).map((r) => r.id)).toEqual(["2", "1"]);
  });
});

describe("series order (owner: Part 2 must never come before Part 1)", () => {
  const part = (id: string, n: number, created: string, extra: Partial<{ creator_id: string; series: string; topic: string }> = {}) => ({
    id,
    creator_id: "claude",
    created_at: created,
    series: "system-design-stories",
    series_index: n,
    topic: `distributed/feeds/instagram-feed/part-${n}`,
    ...extra,
  });
  const other = (id: string, created: string) => ({ id, creator_id: "gpt", created_at: created, topic: "os/x" });

  it("plays Part 1 before Part 2 even when Part 2 is newer or scores higher", () => {
    const rows = [other("a", "2026-11-01T10:00:00Z"), part("p2", 2, "2026-11-01T12:00:00Z"), part("p1", 1, "2026-11-01T09:00:00Z")];
    for (const context of [undefined, { areas: ["distributed"], liked: new Set<string>(), disliked: new Set<string>(), fulfilled: new Set<string>() }]) {
      const ids = orderFeed(rows, new Set(), context).map((r) => r.id);
      expect(ids.indexOf("p1")).toBeLessThan(ids.indexOf("p2"));
      expect(ids.indexOf("p2")).toBe(ids.indexOf("p1") + 1);
    }
  });
  it("keeps non-part series in index order without forcing them adjacent", () => {
    const s = (id: string, n: number, c: string) => ({ id, creator_id: "claude", created_at: c, series: "aosp-build", series_index: n, topic: `aosp/build/t${n}` });
    const ids = seriesInOrder([s("b3", 3, "c"), other("x", "d"), s("b1", 1, "a"), other("y", "e"), s("b2", 2, "b")]).map((r) => r.id);
    expect(ids).toEqual(["b1", "x", "b2", "y", "b3"]);
  });
  it("shows Part 2 first only when Part 1 was already watched", () => {
    const rows = [part("p2", 2, "2026-11-01T12:00:00Z"), part("p1", 1, "2026-11-01T09:00:00Z")];
    expect(orderFeed(rows, new Set(["p1"])).map((r) => r.id)).toEqual(["p2", "p1"]);
  });
  it("a direct link to Part 2 plays an unwatched Part 1 first", () => {
    const p1 = part("p1", 1, "a"), p2 = part("p2", 2, "b");
    expect(withEarlierParts(p2, [p2, p1], new Set()).map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(withEarlierParts(p2, [p2, p1], new Set(["p1"])).map((r) => r.id)).toEqual(["p2"]);
  });
});

describe("deep links", () => {
  it("deep link to Part 3 with Parts 1 and 2 unseen plays 1, 2, 3", () => {
    const part = (n: number) => ({
      id: `p${n}`,
      creator_id: "claude",
      created_at: `2026-11-0${n}T00:00:00Z`,
      series: "stories",
      series_index: n,
      topic: `distributed/feeds/x/part-${n}`,
    });
    const all = [part(3), part(1), part(2)];
    expect(withEarlierParts(part(3), all, new Set()).map((r) => r.id)).toEqual(["p1", "p2", "p3"]);
    expect(withEarlierParts(part(3), all, new Set(["p1"])).map((r) => r.id)).toEqual(["p2", "p3"]);
  });
});
