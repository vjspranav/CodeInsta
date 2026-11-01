import { describe, expect, it } from "vitest";
import { cacheKey, cacheRecipe, GEMINI_STYLES, POSTPROCESS_VERSION } from "./tts-v3";

const base = { text: "The URL loads", voice: "senior", engine: "gemini" } as const;

describe("TTS cache key", () => {
  it("is stable for identical input", () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
  });

  it("resolves the default style prompt (undefined style == the explicit default)", () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base, style: GEMINI_STYLES.senior }));
    expect(cacheRecipe(base).prompt).toBe(GEMINI_STYLES.senior);
  });

  it("changes with style, voice role, engine and text", () => {
    const k = cacheKey(base);
    expect(cacheKey({ ...base, style: "Say sadly:" })).not.toBe(k);
    expect(cacheKey({ ...base, voice: "rookie" })).not.toBe(k);
    expect(cacheKey({ ...base, engine: "openai" })).not.toBe(k);
    expect(cacheKey({ ...base, text: "The API loads" })).not.toBe(k);
  });

  it("hashes lexicon-normalized text, so a lexicon edit invalidates and equivalent spellings share", () => {
    expect(cacheRecipe({ ...base, text: "URL" }).spoken).not.toBe("URL");
    expect(cacheKey({ ...base, text: "URL" })).toBe(cacheKey({ ...base, text: cacheRecipe({ ...base, text: "URL" }).spoken }));
  });

  it("records the model, the post-process recipe with pause params, and the speed", () => {
    const r = cacheRecipe(base);
    expect(r.postprocess).toBe(POSTPROCESS_VERSION);
    expect(POSTPROCESS_VERSION).toContain("stop_duration=0.1");
    expect(POSTPROCESS_VERSION).toContain("stop_silence=0.12");
    expect(r.model).toBeTruthy();
    expect(r.speed).toBeGreaterThan(0);
  });

  it("includes the chatterbox reference clip digest and resolved emotion params", () => {
    const r = cacheRecipe({ ...base, engine: "chatterbox" });
    expect(r.voice).toMatch(/senior\.wav#/);
    expect(JSON.parse(r.prompt)).toHaveProperty("exaggeration");
    expect(cacheKey({ ...base, engine: "chatterbox", style: "excited" })).not.toBe(cacheKey({ ...base, engine: "chatterbox" }));
  });

  it("includes the previous line for openai only", () => {
    const o = { ...base, engine: "openai" } as const;
    expect(cacheKey({ ...o, prev: "hi" })).not.toBe(cacheKey(o));
    expect(cacheKey({ ...base, prev: "hi" })).toBe(cacheKey(base));
  });
});
