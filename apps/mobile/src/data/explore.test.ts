import type { Category, MobileReel } from "@shared/types";
import { exploreSections, searchReels } from "./explore";

const reel = (id: string, topic: string, created_at: string, extra: Partial<MobileReel> = {}): MobileReel => ({
  id,
  creator_id: "claude",
  title: `Title ${id}`,
  topic,
  tags: [],
  series: null,
  series_index: null,
  created_at,
  video_url: `https://cdn.example/${id}.mp4`,
  poster_url: null,
  glossary: null,
  parent_reel_id: null,
  genre: null,
  style: null,
  expires_at: null,
  ...extra,
});

const categories: Category[] = [
  { slug: "aosp", label: "AOSP", description: "Android internals" },
  { slug: "compilers", label: "Compilers", description: "" },
  { slug: "databases", label: "Databases", description: "" },
];

const library = {
  categories,
  reels: [
    reel("a1", "aosp/binder", "2026-10-01T00:00:00Z", { title: "How Binder works", tags: ["ipc", "Android"] }),
    reel("a2", "aosp/zygote", "2026-10-05T00:00:00Z"),
    reel("c1", "compilers/ssa", "2026-10-03T00:00:00Z", { title: "SSA form", tags: ["IR"] }),
    reel("x1", "unknown/thing", "2026-10-09T00:00:00Z"),
  ],
};

describe("exploreSections", () => {
  it("groups reels by the first topic segment, newest first", () => {
    const sections = exploreSections(library);
    expect(sections.find((s) => s.category.slug === "aosp")?.reels.map((r) => r.id)).toEqual(["a2", "a1"]);
    expect(sections.find((s) => s.category.slug === "compilers")?.reels.map((r) => r.id)).toEqual(["c1"]);
  });

  it("omits empty categories and reels outside any category", () => {
    const sections = exploreSections(library);
    expect(sections.map((s) => s.category.slug)).toEqual(["aosp", "compilers"]);
    expect(sections.flatMap((s) => s.reels).some((r) => r.id === "x1")).toBe(false);
  });

  it("keeps the category order it was given", () => {
    const reversed = { ...library, categories: [...categories].reverse() };
    expect(exploreSections(reversed).map((s) => s.category.slug)).toEqual(["compilers", "aosp"]);
  });

  it("does not mutate the library", () => {
    const before = library.reels.map((r) => r.id);
    exploreSections(library);
    expect(library.reels.map((r) => r.id)).toEqual(before);
  });
});

describe("searchReels", () => {
  it("returns nothing for an empty or blank query", () => {
    expect(searchReels(library, "")).toEqual([]);
    expect(searchReels(library, "   ")).toEqual([]);
  });

  it("matches title case-insensitively", () => {
    expect(searchReels(library, "BINDER").map((r) => r.id)).toEqual(["a1"]);
  });

  it("matches tags", () => {
    expect(searchReels(library, "ir").map((r) => r.id)).toContain("c1");
    expect(searchReels(library, "android").map((r) => r.id)).toEqual(["a1"]);
  });

  it("matches topic and returns newest first", () => {
    expect(searchReels(library, "aosp/").map((r) => r.id)).toEqual(["a2", "a1"]);
  });

  it("treats the query as plain text, not a pattern", () => {
    expect(searchReels(library, ".*")).toEqual([]);
  });
});
