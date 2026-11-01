import { execFileSync, execFile } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "/opt/homebrew/bin/ffprobe";
const lexicon = join(process.cwd(), "tts", "lexicon.json");
const origCwd = process.cwd();
const work = mkdtempSync(join(tmpdir(), "tts-validate-"));

type Line = { id: string; text: string; tone: number; inner?: number };
/** Four lines: the last one has an internal pause (1.0 s) longer than the gaps between lines, which fools a silence-only split. */
const LINES: Line[] = [
  { id: "rookie", text: "alpha bravo charlie", tone: 1.5 },
  { id: "senior", text: "delta echo foxtrot", tone: 3 },
  { id: "rookie", text: "golf hotel india", tone: 2 },
  { id: "senior", text: "juliet kilo lima", tone: 4, inner: 1.0 },
];
const CAST = [{ id: "rookie", name: "Rookie", role: "rookie" }, { id: "senior", name: "Senior", role: "senior" }];
const script = { cast: CAST, beats: LINES.map((l) => ({ speaker: l.id, text: l.text })) };

/** Builds a take: tone, gap, tone, ... Returns the wav and each line's [start, end] in seconds. */
function take(name: string, gaps: number[], innerPause = LINES[3].inner!): { wav: string; spans: [number, number][] } {
  const inputs: string[] = [];
  let n = 0;
  const add = (spec: string) => (inputs.push("-f", "lavfi", "-i", spec), n++);
  const spans: [number, number][] = [];
  let t = 0;
  LINES.forEach((l, i) => {
    const inner = l.inner ? innerPause : 0;
    const total = l.tone + inner;
    if (inner) {
      add(`sine=f=440:r=24000:d=${l.tone / 2}`);
      add(`anullsrc=r=24000:cl=mono:d=${inner}`);
      add(`sine=f=440:r=24000:d=${l.tone / 2}`);
    } else add(`sine=f=${300 + i * 100}:r=24000:d=${l.tone}`);
    spans.push([t, t + total]);
    t += total;
    if (i < LINES.length - 1) {
      add(`anullsrc=r=24000:cl=mono:d=${gaps[i]}`);
      t += gaps[i];
    }
  });
  const wav = join(work, name);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${Array.from({ length: n }, (_, i) => `[${i}:a]`).join("")}concat=n=${n}:v=0:a=1`, "-ac", "1", wav]);
  return { wav, spans };
}

const goodGaps = [0.7, 0.7, 0.7];
const mergedGaps = [0.7, 0.05, 0.7]; // lines 2 and 3 run together: no silence to cut on

let runs = 0;
async function load() {
  vi.resetModules();
  const dir = join(work, `run${runs++}`); // fresh cache per test
  mkdirSync(join(dir, "tts"), { recursive: true });
  copyFileSync(lexicon, join(dir, "tts", "lexicon.json"));
  process.chdir(dir);
  process.env.GEMINI_API_KEY = "test-key";
  return import("./tts-v3");
}

const probe = async (f: string) => parseFloat((await promisify(execFile)(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])).stdout);

/** Stand-in for the transcript check: a clip passes when its length is what its line should voice to. */
function verifyByDuration(idxOf: (text: string) => number) {
  return async (wav: string, beat: { text: string }) => {
    const l = LINES[idxOf(beat.text)];
    const speed = 1.12 * (l.id === "rookie" ? 1 : 0.97);
    const expected = (l.tone + (l.inner ? 0.22 : 0)) / speed;
    const got = await probe(wav);
    return Math.abs(got - expected) / expected < 0.2;
  };
}

type GeminiBody = { input: { content: { text: string }[] }[] };
type Mock = { bodies: GeminiBody[]; takes: string[] };
function mockGemini(takes: string[]): Mock {
  const m: Mock = { bodies: [], takes: [...takes] };
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    m.bodies.push(body);
    const content = body.input[0].content as { text: string }[];
    let wav: string;
    if (content.length > 1) wav = m.takes.shift() ?? fail("no take left");
    else {
      const l = LINES.find((x) => content[0].text.startsWith(x.text))!;
      wav = join(work, `single-${runs}-${m.bodies.length}.wav`);
      execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=f=500:r=24000:d=${l.tone + (l.inner ? 0.22 : 0)}`, "-ac", "1", wav]);
    }
    const data = readFileSync(wav).toString("base64");
    return new Response(JSON.stringify({ steps: [{ content: [{ type: "audio", data }] }] }), { status: 200 });
  });
  return m;
}
const fail = (m: string): never => {
  throw new Error(m);
};

afterEach(() => {
  process.chdir(origCwd);
  vi.unstubAllGlobals();
});
beforeAll(() => {
  expect(origCwd).toBeTruthy();
});

describe("multi-speaker split validation (synthetic audio)", () => {
  const idxOf = (t: string) => LINES.findIndex((l) => l.text === t);

  it("reproduces the shift: a silence-only split puts clips on the wrong boundaries", async () => {
    const tts = await load();
    const { wav } = take("shift.wav", goodGaps);
    const weights = LINES.map((l) => l.text.length);
    const segs = (await tts.splitSegments(wav, weights))!;
    expect(segs).toHaveLength(4);
    // True cut between lines 3 and 4 is at ~8.0 s; the silence split picked the pause inside line 4 instead.
    const trueCut = take("x.wav", goodGaps).spans[2][1] + 0.35;
    expect(Math.abs(segs[2].end - trueCut)).toBeGreaterThan(0.5);
  });

  it("fixes a shifted split with word alignment, with a single request", async () => {
    const tts = await load();
    const t = take("take1.wav", goodGaps);
    const m = mockGemini([t.wav]);
    const words = async () =>
      LINES.flatMap((l, i) => {
        const ws = l.text.split(" ");
        const [s, e] = t.spans[i];
        return ws.map((w, k) => ({ word: w, start: s + ((e - s) * k) / ws.length, end: s + ((e - s) * (k + 0.8)) / ws.length }));
      });
    const r = await tts.renderStoryGeminiMulti(script, { verify: verifyByDuration(idxOf), words });
    expect(m.bodies).toHaveLength(1);
    for (const l of r.lines) expect(await verifyByDuration(idxOf)(l.wav, script.beats[l.beat_index])).toBe(true);
  });

  it("re-requests the group once with a stronger pause cue when the split cannot be fixed", async () => {
    const tts = await load();
    const bad = take("bad.wav", mergedGaps); // lines 2 and 3 merged, no word alignment available
    const retry = take("retry.wav", goodGaps, 0.2); // clean take on the retry
    const m = mockGemini([bad.wav, retry.wav]);
    const r = await tts.renderStoryGeminiMulti(script, { verify: verifyByDuration(idxOf) });
    expect(m.bodies).toHaveLength(2);
    expect(JSON.stringify(m.bodies[0])).not.toContain("long pause");
    expect(JSON.stringify(m.bodies[1])).toContain("long pause");
    expect(r.lines).toHaveLength(4);
    for (const l of r.lines) expect(await verifyByDuration(idxOf)(l.wav, script.beats[l.beat_index])).toBe(true);
  });

  it("voices only the mismatched lines individually when both takes fail", async () => {
    const tts = await load();
    const m = mockGemini([take("b1.wav", mergedGaps).wav, take("b2.wav", mergedGaps).wav]);
    const r = await tts.renderStoryGeminiMulti(script, { verify: verifyByDuration(idxOf) });
    const singles = m.bodies.filter((b) => b.input[0].content.length === 1);
    expect(m.bodies).toHaveLength(2 + singles.length);
    // Line 1 split cleanly in the first take and is kept; only the lines that stayed wrong are voiced alone.
    expect(singles.length).toBeGreaterThanOrEqual(1);
    expect(singles.length).toBeLessThan(4);
    expect(singles.map((b) => b.input[0].content[0].text)).not.toContain(LINES[0].text);
    for (const l of r.lines) expect(await verifyByDuration(idxOf)(l.wav, script.beats[l.beat_index])).toBe(true);
  });
});

describe("daily cap handling", () => {
  it("waits for the quota, logs the time, then retries; --no-wait throws with the reset time", async () => {
    const tts = await load();
    const body = '{"error":{"message":"Quota exceeded for metric generate_requests_per_model_per_day. Please retry in 2m0s."}}';
    const wav = take("cap.wav", goodGaps).wav;
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) return new Response(body, { status: 429 });
      return new Response(JSON.stringify({ steps: [{ content: [{ type: "audio", data: readFileSync(wav).toString("base64") }] }] }), { status: 200 });
    });
    const slept: number[] = [];
    tts.quotaSleep.fn = async (ms: number) => void slept.push(ms);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
    tts.setGeminiNoWait(false);
    const r = await tts.renderLine({ text: "hello cap", voice: "rookie", engine: "gemini" });
    expect(r.cached).toBe(false);
    expect(calls).toBe(2);
    expect(slept[0]).toBeGreaterThanOrEqual(120_000);
    expect(logs.join("\n")).toMatch(/waiting for Gemini quota until \d\d:\d\d/);

    calls = 0;
    tts.setGeminiNoWait(true);
    await expect(tts.renderLine({ text: "hello cap two", voice: "rookie", engine: "gemini" })).rejects.toMatchObject({ name: "GeminiQuotaError" });
    vi.restoreAllMocks();
  });
});
