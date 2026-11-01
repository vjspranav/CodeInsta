import { describe, expect, it } from "vitest";
import { assignCategories, categoriesWithoutReels, isLabTopic, isMissingSchema, SEED_CATEGORY_SLUGS } from "./agent-inbox";

const cat = (slug: string, created_at: string) => ({ slug, label: slug, description: "", created_at });

describe("assignCategories", () => {
  const seeds = SEED_CATEGORY_SLUGS.map((s) => cat(s, "2026-10-31T00:00:00Z"));
  const all = [...seeds, cat("ml", "2026-11-01T01:00:00Z"), cat("product-design", "2026-11-01T02:00:00Z"), cat("security", "2026-11-01T03:00:00Z")];

  it("ignores the seed set and alternates by creation order", () => {
    const a = assignCategories(all);
    expect(a.map((c) => [c.slug, c.assigned_creator])).toEqual([
      ["ml", "claude"],
      ["product-design", "gpt"],
      ["security", "claude"],
    ]);
  });

  it("includes owner-created categories (no created_from_request needed) and is order-independent", () => {
    const a = assignCategories([...all].reverse());
    expect(a[0].slug).toBe("ml");
  });

  it("does not shift when a category receives its first reel", () => {
    const a = assignCategories(all);
    const before = categoriesWithoutReels(a, []);
    const after = categoriesWithoutReels(a, ["ml/intro"]);
    expect(before.map((c) => c.slug)).toEqual(["ml", "product-design", "security"]);
    expect(after.map((c) => [c.slug, c.assigned_creator])).toEqual([
      ["product-design", "gpt"],
      ["security", "claude"],
    ]);
  });

  it("breaks created_at ties by slug", () => {
    const a = assignCategories([cat("zz", "2026-11-02T00:00:00Z"), cat("aa", "2026-11-02T00:00:00Z")]);
    expect(a.map((c) => c.slug)).toEqual(["aa", "zz"]);
  });
});

describe("isMissingSchema", () => {
  it("treats only missing relation/column errors as empty", () => {
    expect(isMissingSchema({ code: "42P01", message: 'relation "public.dislikes" does not exist' })).toBe(true);
    expect(isMissingSchema({ code: "42703", message: "column reels.genre does not exist" })).toBe(true);
    expect(isMissingSchema({ code: "PGRST200", message: "Could not find a relationship between 'dislikes' and 'reels'" })).toBe(true);
    expect(isMissingSchema({ message: "Could not find the table 'public.dislikes' in the schema cache" })).toBe(true);
  });
  it("surfaces genuine errors", () => {
    expect(isMissingSchema(null)).toBe(false);
    expect(isMissingSchema({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(isMissingSchema({ code: "42501", message: "permission denied for table dislikes" })).toBe(false);
    expect(isMissingSchema({ code: "08006", message: "connection failure" })).toBe(false);
  });
});

describe("isLabTopic", () => {
  it("matches lab and lab-v3 prefixes only", () => {
    expect(isLabTopic("lab/x")).toBe(true);
    expect(isLabTopic("lab-v3/instagram-feed")).toBe(true);
    expect(isLabTopic("laboratory/x")).toBe(false);
    expect(isLabTopic("aosp/build")).toBe(false);
    expect(isLabTopic(null)).toBe(false);
  });
});
