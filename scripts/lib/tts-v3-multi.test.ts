import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheKey, chooseSplits, dailyQuotaError, isDailyQuota429, parseRetrySeconds, splitSegments } from "./tts-v3";

const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const dir = mkdtempSync(join(tmpdir(), "tts-multi-"));

/** Builds a 24 kHz mono wav from [tone seconds, silence seconds after] pairs (tone has an optional internal gap). */
function synth(name: string, parts: { tone: number; gap: number; inner?: number }[]): string {
  const inputs: string[] = [];
  const labels: string[] = [];
  const add = (spec: string) => {
    inputs.push("-f", "lavfi", "-i", spec);
    labels.push(`[${labels.length}:a]`);
  };
  for (const p of parts) {
    if (p.inner) {
      add(`sine=f=440:r=24000:d=${p.tone / 2}`);
      add(`anullsrc=r=24000:cl=mono:d=${p.inner}`);
      add(`sine=f=440:r=24000:d=${p.tone / 2}`);
    } else add(`sine=f=440:r=24000:d=${p.tone}`);
    add(`anullsrc=r=24000:cl=mono:d=${p.gap}`);
  }
  const out = join(dir, name);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${labels.join("")}concat=n=${labels.length}:v=0:a=1`, "-ac", "1", out]);
  return out;
}

const near = (a: number, b: number, tol = 0.25) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("splitSegments (synthetic audio)", () => {
  it("splits clean bursts separated by 1 s silences", async () => {
    const wav = synth("clean.wav", [{ tone: 2, gap: 1 }, { tone: 3, gap: 1 }, { tone: 1.5, gap: 1 }, { tone: 2.5, gap: 0 }]);
    const segs = await splitSegments(wav, [20, 30, 15, 25]);
    expect(segs).toHaveLength(4);
    near(segs![0].end, 2.5);
    near(segs![1].end, 6.5);
    near(segs![2].end, 9.0);
  });

  it("returns undefined when two lines merged (no silence between them)", async () => {
    const wav = synth("merged.wav", [{ tone: 2, gap: 1 }, { tone: 3, gap: 0.05 }, { tone: 1.5, gap: 1 }, { tone: 2.5, gap: 0 }]);
    expect(await splitSegments(wav, [20, 30, 15, 25])).toBeUndefined();
  });

  it("uses expected lengths to skip a pause inside a line", async () => {
    // line 2 has a 0.8 s internal pause: 3 candidates for 2 cuts across 3 lines
    const wav = synth("inner.wav", [{ tone: 2, gap: 1 }, { tone: 6, gap: 1, inner: 0.8 }, { tone: 2, gap: 0 }]);
    const segs = await splitSegments(wav, [20, 60, 20]);
    expect(segs).toHaveLength(3);
    near(segs![0].end, 2.5);
    near(segs![1].end, 2 + 1 + 6.8 + 0.5);
  });
});

describe("chooseSplits", () => {
  it("picks silences closest to the expected cumulative share", () => {
    const cands = [{ start: 3.9, end: 4.5 }, { start: 5.9, end: 6.9 }, { start: 9.9, end: 10.1 }];
    const picked = chooseSplits(cands, 20, [30, 30, 40]);
    expect(picked).toHaveLength(2);
    expect(picked![0]).toEqual(cands[1]);
    expect(picked![1]).toEqual(cands[2]);
  });
  it("returns undefined when there are fewer silences than needed", () => {
    expect(chooseSplits([{ start: 1, end: 2 }], 10, [1, 1, 1])).toBeUndefined();
  });
});

describe("daily quota detection", () => {
  const body = '{"error":{"code":429,"message":"You exceeded your current quota. Quota exceeded for metric: generate_requests_per_model_per_day, limit: 100. Please retry in 5h3m2s.","details":[{"retryDelay":"18182s"}]}}';
  it("flags per-day 429s and not per-minute ones", () => {
    expect(isDailyQuota429(body)).toBe(true);
    expect(isDailyQuota429('{"message":"quota per minute exceeded, retry in 12s"}')).toBe(false);
  });
  it("parses the reset delay and states it in the error", () => {
    expect(parseRetrySeconds(body)).toBe(5 * 3600 + 3 * 60 + 2);
    expect(dailyQuotaError(body).message).toMatch(/daily quota exhausted.*resets in about 5\.1 h/);
  });
});

describe("multi cache key", () => {
  const base = { text: "hello there", voice: "rookie", engine: "gemini" } as const;
  it("differs from the per-line key and is stable", () => {
    expect(cacheKey({ ...base, multi: true })).not.toBe(cacheKey(base));
    expect(cacheKey({ ...base, multi: true })).toBe(cacheKey({ ...base, multi: true }));
  });
});
