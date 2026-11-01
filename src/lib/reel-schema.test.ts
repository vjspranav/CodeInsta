import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateReel } from "./reel-schema";

const example = (name = "virtual-addresses") =>
  JSON.parse(readFileSync(new URL(`../../content/examples/${name}.json`, import.meta.url), "utf8"));

describe("reel v1 contract", () => {
  it.each(["virtual-addresses", "compiler-ir"])("loads valid example %s", (name) => {
    const result = validateReel(example(name));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reel.scenes[0].elements[0].enter).toBe("fade");
  });

  it("defaults omitted enter animations to fade", () => {
    const reel = example();
    delete reel.scenes[0].elements[0].enter;
    const result = validateReel(reel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reel.scenes[0].elements[0].enter).toBe("fade");
  });

  it.each([20000, 90000])("accepts inclusive duration boundary %i", (total) => {
    const reel = example();
    reel.scenes.forEach((scene: { duration_ms: number }, i: number) => {
      scene.duration_ms = i === 0 ? total - 12000 : 6000;
    });
    expect(validateReel(reel).ok).toBe(true);
  });

  it("accepts ten scenes and eight unique elements", () => {
    const reel = example();
    reel.scenes = Array.from({ length: 10 }, () => structuredClone(reel.scenes[0]));
    reel.scenes[0].elements = Array.from({ length: 8 }, (_, i) => ({ ...reel.scenes[0].elements[0], id: `id-${i}` }));
    expect(validateReel(reel).ok).toBe(true);
  });

  // Each mutation removes one guarantee consumers rely on; no validator internals are mocked.
  it.each([
    ["wrong version", (r: ReturnType<typeof example>) => { r.version = 3; }],
    ["two scenes", (r: ReturnType<typeof example>) => { r.scenes.pop(); }],
    ["eleven scenes", (r: ReturnType<typeof example>) => { r.scenes = Array(11).fill(r.scenes[0]); }],
    ["too short", (r: ReturnType<typeof example>) => { r.scenes.forEach((s: { duration_ms: number }) => { s.duration_ms = 6000; }); }],
    ["too long", (r: ReturnType<typeof example>) => { r.scenes.forEach((s: { duration_ms: number }) => { s.duration_ms = 30001; }); }],
    ["fractional duration", (r: ReturnType<typeof example>) => { r.scenes[0].duration_ms = 8000.5; }],
    ["zero duration", (r: ReturnType<typeof example>) => { r.scenes[0].duration_ms = 0; }],
    ["nine elements", (r: ReturnType<typeof example>) => { r.scenes[0].elements = Array.from({length: 9}, (_, i) => ({...r.scenes[0].elements[0], id: String(i)})); }],
    ["duplicate id", (r: ReturnType<typeof example>) => { r.scenes[0].elements[1].id = "heading"; }],
    ["unknown arrow from", (r: ReturnType<typeof example>) => { r.scenes[1].elements[3].from = "missing"; }],
    ["unknown arrow to", (r: ReturnType<typeof example>) => { r.scenes[1].elements[3].to = "missing"; }],
    ["cross-scene highlight", (r: ReturnType<typeof example>) => { r.scenes[1].elements[4].target = "a"; }],
    ["long caption", (r: ReturnType<typeof example>) => { r.scenes[0].caption = "x".repeat(121); }],
    ["unknown palette", (r: ReturnType<typeof example>) => { r.scenes[0].elements[1].color = "pink"; }],
    ["unknown animation", (r: ReturnType<typeof example>) => { r.scenes[0].elements[0].enter = "spin"; }],
    ["unknown type", (r: ReturnType<typeof example>) => { r.scenes[0].elements[0].type = "video"; }],
    ["negative offset", (r: ReturnType<typeof example>) => { r.scenes[0].elements[0].at = -1; }],
    ["offset at scene end", (r: ReturnType<typeof example>) => { r.scenes[0].elements[0].at = 8000; }],
    ["out of stage position", (r: ReturnType<typeof example>) => { r.scenes[0].elements[0].x = 101; }],
    ["missing box width", (r: ReturnType<typeof example>) => { delete r.scenes[0].elements[1].w; }],
    ["invalid level", (r: ReturnType<typeof example>) => { r.level = "expert"; }],
    ["unknown field", (r: ReturnType<typeof example>) => { r.scenez = []; }],
  ])("rejects %s", (_, mutate) => {
    const reel = example();
    mutate(reel);
    const result = validateReel(reel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.every((error) => typeof error === "string")).toBe(true);
    }
  });

  it.each(["os", "OS/memory", "os//memory", "/os/memory", "os/memory/", "os/virtual_memory"])("rejects malformed topic %s", (topic) => {
    expect(validateReel({ ...example(), topic }).ok).toBe(false);
  });

  it("accepts a 120-character caption and forward references", () => {
    const reel = example();
    reel.scenes[0].caption = "x".repeat(120);
    reel.scenes[1].elements.reverse();
    expect(validateReel(reel).ok).toBe(true);
  });

  it.each([[null], [undefined], ["{}"], [{}], [[]]])("returns errors rather than throwing for invalid input %j", (input) => {
    expect(validateReel(input).ok).toBe(false);
  });
});

describe("reel v2 contract", () => {
  const cast = [
    { id: "sr", name: "Maya", role: "Senior engineer", voice: "af_heart", color: "purple" },
    { id: "jr", name: "Sam", role: "Junior engineer", voice: "am_michael", color: "green" },
  ];
  const v2 = () => {
    const reel = example();
    reel.version = 2;
    reel.format = "dialogue";
    reel.cast = structuredClone(cast);
    reel.scenes[0].lines = [
      { speaker: "sr", text: "Why is the feed instant?" },
      { speaker: "jr", text: "Caching?" },
    ];
    reel.scenes[0].elements = [
      { id: "client", type: "node", x: 4, y: 10, w: 24, label: "Phone", icon: "phone", at: 0 },
      { id: "cdn", type: "node", x: 60, y: 10, w: 24, label: "CDN", icon: "cdn", at: 100 },
      { id: "pkt", type: "flow", from: "client", to: "cdn", label: "GET /feed", count: 4, at: 200 },
      { id: "b1", type: "bubble", y: 40, speaker: "sr", text: "Hi", at: 300 },
      { id: "a1", type: "alert", x: 5, y: 60, title: "PAGE", text: "p99 > 2s", at: 400 },
      { id: "m1", type: "metric", x: 5, y: 80, value: "42 ms", label: "p99", at: 500 },
    ];
    return reel;
  };

  it("accepts a full v2 script and applies defaults", () => {
    const result = validateReel(v2());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const els = result.reel.scenes[0].elements;
    expect(els.find((e) => e.type === "alert" && e.level === "critical")).toBeTruthy();
    expect(els.find((e) => e.type === "flow")).toMatchObject({ count: 4 });
  });

  it("still accepts v1 and v2 scripts without v2 fields", () => {
    expect(validateReel(example()).ok).toBe(true);
    expect(validateReel({ ...example(), version: 2 }).ok).toBe(true);
  });

  it.each([
    ["line speaker outside the cast", (r: ReturnType<typeof v2>) => { r.scenes[0].lines[0].speaker = "ghost"; }],
    ["lines without a cast", (r: ReturnType<typeof v2>) => { delete r.cast; }],
    ["bubble speaker outside the cast", (r: ReturnType<typeof v2>) => { r.scenes[0].elements[3].speaker = "ghost"; }],
    ["duplicate cast ids", (r: ReturnType<typeof v2>) => { r.cast[1].id = "sr"; }],
    ["seven lines", (r: ReturnType<typeof v2>) => { r.scenes[0].lines = Array.from({ length: 7 }, () => ({ speaker: "sr", text: "x" })); }],
    ["empty lines", (r: ReturnType<typeof v2>) => { r.scenes[0].lines = []; }],
    ["flow to a missing element", (r: ReturnType<typeof v2>) => { r.scenes[0].elements[2].to = "missing"; }],
    ["flow endpoint that is not a node or box", (r: ReturnType<typeof v2>) => { r.scenes[0].elements[2].to = "m1"; }],
    ["flow with six dots", (r: ReturnType<typeof v2>) => { r.scenes[0].elements[2].count = 6; }],
    ["unknown node icon", (r: ReturnType<typeof v2>) => { r.scenes[0].elements[0].icon = "toaster"; }],
    ["unknown format", (r: ReturnType<typeof v2>) => { r.format = "sitcom"; }],
    ["unknown cast color", (r: ReturnType<typeof v2>) => { r.cast[0].color = "pink"; }],
  ])("rejects %s", (_, mutate) => {
    const reel = v2();
    mutate(reel);
    expect(validateReel(reel).ok).toBe(false);
  });

  it("accepts exactly six lines and box endpoints for flows", () => {
    const reel = v2();
    reel.scenes[0].lines = Array.from({ length: 6 }, (_, i) => ({ speaker: i % 2 ? "jr" : "sr", text: `line ${i}` }));
    reel.scenes[0].elements[1] = { id: "cdn", type: "box", x: 60, y: 10, w: 24, h: 10, text: "CDN", at: 100 };
    expect(validateReel(reel).ok).toBe(true);
  });
});


describe("publishing preference metadata", () => {
  it("preserves genre and style for the agent API and dislike ranking", () => {
    const result = validateReel({ ...example(), genre: "trace", style: "blueprint" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reel).toMatchObject({ genre: "trace", style: "blueprint" });
  });
  it.each(["", "Story", "bad/style", "x".repeat(33)])("rejects invalid genre/style slug %j", (slug) => {
    expect(validateReel({ ...example(), genre: slug }).ok).toBe(false);
    expect(validateReel({ ...example(), style: slug }).ok).toBe(false);
  });
});
