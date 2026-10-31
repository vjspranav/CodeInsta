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
    ["wrong version", (r: ReturnType<typeof example>) => { r.version = 2; }],
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
