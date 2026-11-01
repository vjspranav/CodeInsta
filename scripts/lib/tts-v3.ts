/**
 * Reels v3 create-time TTS layer: lexicon -> engine (chatterbox | gemini | openai) -> ffmpeg post-process -> per-line wav.
 * Not used at runtime by the app; only by the create/render pipeline.
 */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { alignSplit, type TimedWord } from "./split-align";

const run = promisify(execFile);
const ROOT = process.cwd();
const FFMPEG = process.env.FFMPEG_PATH ?? (process.platform === "darwin" ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg");
const FFPROBE = process.env.FFPROBE_PATH ?? (process.platform === "darwin" ? "/opt/homebrew/bin/ffprobe" : "ffprobe");
export const TTS_DIR = join(ROOT, "tts");
export const CACHE_DIR = join(TTS_DIR, "cache");
const VOICES_DIR = join(TTS_DIR, "voices");

/** Playback speed per engine (OpenAI is already quick). */
export const SPEED_BY_ENGINE: Record<Engine, number> = { chatterbox: 1.03, gemini: 1.12, openai: 1.05 };
/** Per-role tempo multiplier on top of the engine speed (the senior reads slowest on every engine). */
export const ROLE_SPEED: Record<VoiceRole, number> = { rookie: 1, narrator: 1.07, senior: 0.97 };

export type Engine = "chatterbox" | "gemini" | "openai";
export type VoiceRole = "rookie" | "senior" | "narrator";

/* ---------------------------------- lexicon ---------------------------------- */

type Lexicon = { words: Record<string, string> };
let lexRe: RegExp | undefined;
let lexMap: Record<string, string> = {};

function loadLexicon(): void {
  if (lexRe) return;
  const lex = JSON.parse(readFileSync(join(TTS_DIR, "lexicon.json"), "utf8")) as Lexicon;
  lexMap = lex.words;
  const keys = Object.keys(lexMap).sort((a, b) => b.length - a.length);
  const esc = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&"));
  // Whole word, case-sensitive: not preceded/followed by a letter or digit.
  lexRe = new RegExp(`(?<![A-Za-z0-9])(?:${esc.join("|")})(?![A-Za-z0-9])`, "g");
}

/** Replace acronyms and tricky words with their spoken form (whole-word, case-sensitive). */
export function applyLexicon(text: string): string {
  loadLexicon();
  return text.replace(lexRe as RegExp, (m) => lexMap[m] ?? m);
}

/* ---------------------------------- voices ---------------------------------- */

/** Chatterbox reference clips (generated from Kokoro by tts/make-voices.ts). */
export const CHATTERBOX_VOICES: Record<VoiceRole, string> = {
  senior: join(VOICES_DIR, "senior.wav"), // Kokoro am_michael
  rookie: join(VOICES_DIR, "rookie.wav"), // Kokoro af_heart
  narrator: join(VOICES_DIR, "narrator.wav"), // Kokoro bm_george
};
/** Gemini prebuilt voices: Zephyr = Bright, Schedar = Even (calm), Sulafat = Warm. */
export const GEMINI_VOICES: Record<VoiceRole, string> = { rookie: "Zephyr", senior: "Schedar", narrator: "Sulafat" };
/** OpenAI voices (clear, non-husky). */
export const OPENAI_VOICES: Record<VoiceRole, string> = { rookie: "coral", senior: "ash", narrator: "sage" };
/** Default per-speaker delivery instructions (OpenAI `instructions`). Expressive on purpose: flat TTS was the complaint. */
export const STYLE_INSTRUCTIONS: Record<VoiceRole, string> = {
  rookie:
    "Voice: excitable, overconfident junior engineer, bright and fast, a little cocky. " +
    "Delivery: wide pitch swings; rise sharply on the exciting word and stress the key technical nouns. " +
    "Pacing: quick tumbling phrases with short natural pauses at commas and full stops, like a person thinking aloud. " +
    "Tone: conversational and animated, never read-out. Laugh a little or sigh when things go wrong. React to what the other person just said.",
  senior:
    "Voice: calm, warm senior engineer with dry humor. " +
    "Delivery: low, relaxed pitch with gentle falls at the ends of sentences and a slight lift on the punchline; lean on the one word that matters. " +
    "Pacing: a natural conversational pace, steady and never slow; only a quick pause at full stops. " +
    "Tone: conversational, as if talking to a friend across a desk. Respond to the previous speaker, amused rather than annoyed.",
  narrator:
    "Voice: brisk documentary narrator, clear and confident. " +
    "Delivery: varied intonation, emphasis on key words, a rising curiosity on questions, a settled fall on conclusions. " +
    "Pacing: crisp and steady, with short natural pauses at commas and full stops. " +
    "Tone: engaging storytelling, never monotone.",
};
/** Gemini style prompts (prompt-based style control via speech_metadata annotation). */
export const GEMINI_STYLES: Record<VoiceRole, string> = {
  rookie: "Say excitedly and quickly, with big pitch swings, emphasis on key words and short natural pauses:",
  senior: "Say calmly and warmly with dry humor, a relaxed low pitch, at a natural conversational pace with a quick pause only at full stops:",
  narrator: "Say like a brisk documentary narrator, with varied intonation and short natural pauses:",
};
/** Chatterbox emotion controls per speaker (exaggeration, cfg_weight). */
const CHATTERBOX_PARAMS: Record<VoiceRole, { exaggeration: number; cfg_weight: number }> = {
  rookie: { exaggeration: 0.65, cfg_weight: 0.4 },
  senior: { exaggeration: 0.4, cfg_weight: 0.6 },
  narrator: { exaggeration: 0.35, cfg_weight: 0.5 },
};
export const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts";
/** Docs say gpt-4o-mini-tts shuts down 2027-01-06; override with OPENAI_TTS_MODEL when a successor lands on /v1/audio/speech. */
export const OPENAI_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
/** Docs pricing: $0.60/1M text tokens + $12/1M audio tokens, about $0.015 per audio minute. */
export const OPENAI_USD_PER_MIN = 0.015;

/* ------------------------------- env / utilities ------------------------------- */

function envKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return m?.[1].trim().replace(/^["']|["']$/g, "") || undefined;
}

export function engineAvailable(engine: Engine): boolean {
  if (engine === "gemini") return !!envKey("GEMINI_API_KEY");
  if (engine === "openai") return !!envKey("OPENAI_API_KEY");
  return true;
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 20);
}

function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const isRiff = (b: Buffer) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF";

async function probeMs(file: string): Promise<number> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Math.round(parseFloat(stdout.trim()) * 1000);
}

/**
 * Internal pause compression (runs before atempo). ffmpeg keeps stop_duration + stop_silence of every silence,
 * so 0.1 + 0.12 caps any internal pause at ~0.22 s while pauses shorter than 0.1 s are untouched.
 */
const PAUSE_PARAMS = "stop_periods=-1:stop_duration=0.1:stop_threshold=-40dB:stop_silence=0.12";

const TRIM_FILTER =
  "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse," +
  "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse";
const LOUDNORM_FILTER = "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000";
/** Changes whenever the post-processing recipe does (trim, pause compressor, loudnorm). Part of every cache key. */
export const POSTPROCESS_VERSION = `pp2|${TRIM_FILTER}|${PAUSE_PARAMS}|${LOUDNORM_FILTER}`;

/** Trim leading/trailing silence, compress internal pauses (> 0.3 s cut to 0.22 s), tempo-adjust, loudnorm, mono 24 kHz wav. */
async function postprocess(rawWav: string, out: string, speed: number): Promise<void> {
  const squeeze = `silenceremove=${PAUSE_PARAMS}`;
  const af = `${TRIM_FILTER},${squeeze},atempo=${speed},${LOUDNORM_FILTER}`;
  await run(FFMPEG, ["-y", "-loglevel", "error", "-i", rawWav, "-af", af, "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", out]);
}

/* ---------------------------------- engines ---------------------------------- */

const CB_URL = "http://127.0.0.1:7861";
let cbStarting: Promise<void> | undefined;

async function cbHealthy(): Promise<boolean> {
  try {
    return (await fetch(`${CB_URL}/health`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

/** Starts tts/chatterbox_server.py (detached, long-lived) when it is not already up. */
export function ensureChatterbox(): Promise<void> {
  cbStarting ??= (async () => {
    if (await cbHealthy()) return;
    const py = join(TTS_DIR, ".venv", "bin", "python");
    if (!existsSync(py)) throw new Error("tts/.venv missing: python3.13 -m venv tts/.venv && tts/.venv/bin/pip install chatterbox-tts");
    mkdirSync(CACHE_DIR, { recursive: true });
    const child = spawn(py, [join(TTS_DIR, "chatterbox_server.py")], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 300; i++) {
      if (await cbHealthy()) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Chatterbox server did not become ready within 10 minutes");
  })();
  return cbStarting;
}

/** Resolved Chatterbox controls for a role and optional per-line style. */
export function chatterboxParams(role: VoiceRole, style?: string): { exaggeration: number; cfg_weight: number } {
  const p = { ...CHATTERBOX_PARAMS[role] };
  if (style && /excit|energ|hype|shock|panic/i.test(style)) p.exaggeration = Math.min(1, p.exaggeration + 0.2);
  if (style && /calm|dry|flat|deadpan|quiet/i.test(style)) p.exaggeration = Math.max(0.25, p.exaggeration - 0.15);
  return p;
}

async function chatterbox(text: string, role: VoiceRole, style?: string): Promise<Buffer> {
  await ensureChatterbox();
  const p = chatterboxParams(role, style);
  const res = await fetch(`${CB_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...p, voice_prompt: CHATTERBOX_VOICES[role] }),
  });
  if (!res.ok) throw new Error(`Chatterbox ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function gemini(text: string, role: VoiceRole, style?: string): Promise<Buffer> {
  const key = envKey("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set (add it to .env.local) - the Gemini TTS engine cannot run without it");
  return geminiCall(text, role, key, style);
}

/** Parses a retry/reset delay (seconds) out of a 429 body: "retry in 12.5s", "retryDelay": "300s", "retry in 5h3m2s". */
export function parseRetrySeconds(body: string): number | undefined {
  const m = body.match(/retry in ((?:\d+(?:\.\d+)?\s*[hms]\s*)+)/i) ?? body.match(/"retryDelay":\s*"((?:\d+(?:\.\d+)?[hms])+)"/i);
  if (!m) return undefined;
  let total = 0;
  for (const part of m[1].matchAll(/(\d+(?:\.\d+)?)\s*([hms])/gi)) total += parseFloat(part[1]) * { h: 3600, m: 60, s: 1 }[part[2].toLowerCase() as "h" | "m" | "s"];
  return total || undefined;
}

/** True when a 429 body says the DAILY quota is exhausted (retrying within minutes is pointless). */
export const isDailyQuota429 = (body: string): boolean => /per[\s_-]?day|daily/i.test(body);

/** Thrown when the Gemini DAILY cap is hit and waiting is disabled (`--no-wait`); `resetAt` is when quota should return, if known. */
export class GeminiQuotaError extends Error {
  constructor(message: string, readonly resetAt?: Date) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

export function dailyQuotaError(body: string): GeminiQuotaError {
  const secs = parseRetrySeconds(body);
  const resetAt = secs ? new Date(Date.now() + secs * 1000) : undefined;
  const reset = resetAt ? `resets in about ${(secs! / 3600).toFixed(1)} h (around ${resetAt.toISOString()})` : "reset time not given in the message (rolling window)";
  const msg = body.match(/"message":\s*"([^"]{0,300})/)?.[1] ?? body.slice(0, 300);
  return new GeminiQuotaError(`Gemini TTS daily quota exhausted (${GEMINI_MODEL}); ${reset}. Message: ${msg}`, resetAt);
}

let geminiNoWait = process.env.GEMINI_NO_WAIT === "1";
/** `--no-wait`: throw GeminiQuotaError on the daily cap instead of sleeping until it resets. */
export function setGeminiNoWait(v: boolean): void {
  geminiNoWait = v;
}
/** Sleep seam so tests can run the wait loop instantly. */
export const quotaSleep = { fn: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Number of Gemini TTS HTTP requests that reached the API in this process (retries included). */
export let geminiRequestCount = 0;

type GeminiTextItem = { type: "text"; text: string; annotations: { type: "speech_metadata"; style: string; speaker?: string }[] };

/** POSTs an interactions body, waits out per-minute 429s, fails fast on daily/billing 429s; returns a wav buffer. */
async function geminiPost(body: object, key: string): Promise<Buffer> {
  let res: Response | undefined;
  let last429 = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    geminiRequestCount++;
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if (res.status !== 429) break;
    last429 = await res.text();
    if (/credit|billing|prepay/i.test(last429)) throw new Error(`Gemini TTS 429: ${last429.slice(0, 300)}`);
    if (isDailyQuota429(last429)) {
      const err = dailyQuotaError(last429);
      if (geminiNoWait) throw err;
      // No compromise on quality: wait for the quota (never fall back to another engine or model), then retry this request.
      const secs = parseRetrySeconds(last429);
      const waitMs = Math.min(secs ? secs + 5 : 900, 3600) * 1000;
      console.log(`[gemini] daily cap on ${GEMINI_MODEL}: waiting for Gemini quota until ${hhmm(new Date(Date.now() + waitMs))}`);
      await quotaSleep.fn(waitMs);
      attempt--; // waiting for the daily cap does not use up the per-minute retry budget
      continue;
    }
    const m = last429.match(/retry in ([\d.]+)s/i) ?? last429.match(/"retryDelay":\s*"([\d.]+)s"/i);
    // Server hint when given, else exponential backoff (10, 20, 40… capped at 60 s).
    const wait = Math.ceil(m ? parseFloat(m[1]) : Math.min(60, 10 * 2 ** attempt)) + 1;
    console.log(`[gemini] 429, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  if (!res || res.status === 429) throw new Error(`Gemini TTS 429 after retries: ${last429.slice(0, 400)}`);
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as { steps?: { content?: { type?: string; data?: string }[] }[] };
  let b64: string | undefined;
  for (const s of json.steps ?? []) for (const c of s.content ?? []) if (c.type === "audio" && c.data) b64 = c.data;
  if (!b64) throw new Error("Gemini TTS response had no audio");
  const buf = Buffer.from(b64, "base64");
  return isRiff(buf) ? buf : pcmToWav(buf);
}

/** Gemini call that waits out 429 "retry in Ns" (free tier is about 3 requests/minute) and retries. */
async function geminiCall(text: string, role: VoiceRole, key: string, style?: string): Promise<Buffer> {
  const item: GeminiTextItem = { type: "text", text, annotations: [{ type: "speech_metadata", style: style ?? GEMINI_STYLES[role] }] };
  return geminiPost(
    {
      model: GEMINI_MODEL,
      input: [{ type: "user_input", content: [item] }],
      response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
      generation_config: { speech_config: [{ voice: GEMINI_VOICES[role] }] },
    },
    key,
  );
}

/** Explicit pause cue appended to every line but the last in a multi request. */
export const MULTI_PAUSE_CUE = process.env.GEMINI_MULTI_PAUSE_CUE ?? " [silence]";
/** Stronger cue for the one retry of a group whose split did not validate. */
export const STRONG_PAUSE_CUE = process.env.GEMINI_STRONG_PAUSE_CUE ?? " [long pause] [silence]";
const SPEAKER_NAME: Record<VoiceRole, string> = { rookie: "Rookie", senior: "Senior", narrator: "Narrator" };

/** One request voicing many lines in order: one speaker (single-speaker config) or two (multi-speaker config). */
async function geminiDialogue(lines: { text: string; role: VoiceRole; style?: string }[], key: string, cue = MULTI_PAUSE_CUE): Promise<Buffer> {
  const roles = [...new Set(lines.map((l) => l.role))];
  if (roles.length > 2) throw new Error("Gemini multi-speaker TTS supports at most 2 speakers per request");
  const multi = roles.length === 2;
  const content: GeminiTextItem[] = lines.map((l, i) => ({
    type: "text",
    text: l.text + (i < lines.length - 1 ? cue : ""),
    annotations: [{ type: "speech_metadata", style: l.style ?? GEMINI_STYLES[l.role], ...(multi ? { speaker: SPEAKER_NAME[l.role] } : {}) }],
  }));
  const speech_config = multi ? { speakers: roles.map((r) => ({ speaker: SPEAKER_NAME[r], voice: GEMINI_VOICES[r] })) } : [{ voice: GEMINI_VOICES[roles[0]] }];
  return geminiPost(
    { model: GEMINI_MODEL, input: [{ type: "user_input", content }], response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 }, generation_config: { speech_config } },
    key,
  );
}

async function openai(text: string, role: VoiceRole, style?: string, prev?: string): Promise<Buffer> {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set (add it to .env.local) - the OpenAI TTS engine cannot run without it");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      voice: OPENAI_VOICES[role],
      input: text,
      instructions: (style ?? STYLE_INSTRUCTIONS[role]) + (prev ? ` The previous line, said by someone else, was: "${prev.slice(0, 160)}". React to it naturally in your opening.` : ""),
      response_format: "pcm", // raw 24 kHz 16-bit mono
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return isRiff(buf) ? buf : pcmToWav(buf);
}

/* ---------------------------------- public API ---------------------------------- */

export type RenderLineInput = { text: string; voice: VoiceRole; engine: Engine; style?: string; /** previous line text, so OpenAI can react to it */ prev?: string };
export type RenderLineResult = { wav: string; duration_ms: number; cached: boolean };

const clipDigests = new Map<string, string>();
/** Content digest of a chatterbox reference clip (the voice IS the file, so editing it must invalidate the cache). */
function clipDigest(path: string): string {
  let d = clipDigests.get(path);
  if (!d) {
    d = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16) : "missing";
    clipDigests.set(path, d);
  }
  return d;
}

export type CacheRecipeInput = { text: string; voice: VoiceRole; engine: Engine; style?: string; prev?: string; /** gemini multi-line request mode (audio split from a long take) */ multi?: boolean };

/** Everything that changes the produced audio. Exported so cache invalidation can be tested without any provider. */
export function cacheRecipe({ text, voice, engine, style, prev, multi }: CacheRecipeInput) {
  const spoken = applyLexicon(text);
  const model = engine === "gemini" ? GEMINI_MODEL : engine === "openai" ? OPENAI_MODEL : "cb1";
  const speed = SPEED_BY_ENGINE[engine] * ROLE_SPEED[voice];
  const resolved =
    engine === "gemini"
      ? { prompt: style ?? GEMINI_STYLES[voice], voice: GEMINI_VOICES[voice] }
      : engine === "openai"
        ? { prompt: (style ?? STYLE_INSTRUCTIONS[voice]) + (prev ? `|prev:${prev.slice(0, 160)}` : ""), voice: OPENAI_VOICES[voice] }
        : { prompt: JSON.stringify(chatterboxParams(voice, style)), voice: `${CHATTERBOX_VOICES[voice]}#${clipDigest(CHATTERBOX_VOICES[voice])}` };
  return { format: CACHE_FORMAT, engine, model, voice: resolved.voice, prompt: resolved.prompt, spoken, speed, postprocess: POSTPROCESS_VERSION, ...(multi && engine === "gemini" ? { multi: "m1|" + MULTI_PAUSE_CUE } : {}) };
}
/** Bump only when the shape of the recipe above changes. */
const CACHE_FORMAT = "v4";
export const cacheKey = (input: CacheRecipeInput): string => sha(JSON.stringify(cacheRecipe(input)));

/** Renders one line: lexicon -> engine -> ffmpeg post-process. Cached by content hash in tts/cache/. */
export async function renderLine({ text, voice, engine, style, prev }: RenderLineInput): Promise<RenderLineResult> {
  const spoken = applyLexicon(text);
  const speed = SPEED_BY_ENGINE[engine] * ROLE_SPEED[voice];
  const hash = cacheKey({ text, voice, engine, style, prev });
  mkdirSync(CACHE_DIR, { recursive: true });
  const out = join(CACHE_DIR, `${engine}-${hash}.wav`);
  const meta = `${out}.json`;
  if (existsSync(out) && existsSync(meta)) {
    return { wav: out, duration_ms: (JSON.parse(readFileSync(meta, "utf8")) as { duration_ms: number }).duration_ms, cached: true };
  }
  const raw = engine === "gemini" ? await gemini(spoken, voice, style) : engine === "openai" ? await openai(spoken, voice, style, prev) : await chatterbox(spoken, voice, style);
  const rawPath = join(CACHE_DIR, `${engine}-${hash}.raw.wav`);
  writeFileSync(rawPath, raw);
  await postprocess(rawPath, out, speed);
  const duration_ms = await probeMs(out);
  writeFileSync(meta, JSON.stringify({ duration_ms, spoken }));
  return { wav: out, duration_ms, cached: false };
}

export type StoryScript = {
  cast?: { id: string; name?: string; role?: string }[];
  beats: { speaker: string; text: string; say?: string; style?: string }[];
};
export type StoryLine = { beat_index: number; speaker: string; wav: string; duration_ms: number };

/** Map a beat speaker ("narrator" or a cast id) to one of the three voice roles. */
export function roleFor(script: StoryScript, speaker: string): VoiceRole {
  if (speaker === "narrator") return "narrator";
  const cast = script.cast ?? [];
  const c = cast.find((x) => x.id === speaker);
  const label = `${c?.role ?? ""} ${c?.name ?? ""} ${speaker}`;
  if (/senior|lead|mentor|staff|principal/i.test(label)) return "senior";
  if (/rookie|junior|intern|new/i.test(label)) return "rookie";
  const humans = cast.filter((x) => x.id !== "narrator");
  return humans.findIndex((x) => x.id === speaker) === 1 ? "senior" : "rookie";
}

/** Renders every beat (`say` overrides `text`). Sequential, so a local engine is never overloaded. Gemini defaults to multi mode (about 2 requests per story); GEMINI_TTS_MODE=line forces one request per line. */
export async function renderStory(script: StoryScript, engine: Engine, hooks: VoiceHooks = {}): Promise<{ lines: StoryLine[]; total_ms: number }> {
  if (engine === "gemini" && (process.env.GEMINI_TTS_MODE ?? "multi") !== "line") return renderStoryGeminiMulti(script, hooks);
  const lines: StoryLine[] = [];
  for (let i = 0; i < script.beats.length; i++) {
    const b = script.beats[i];
    const r = await renderLine({ text: b.say ?? b.text, voice: roleFor(script, b.speaker), engine, style: b.style, prev: i > 0 ? script.beats[i - 1].say ?? script.beats[i - 1].text : undefined });
    lines.push({ beat_index: i, speaker: b.speaker, wav: r.wav, duration_ms: r.duration_ms });
  }
  return { lines, total_ms: lines.reduce((a, l) => a + l.duration_ms, 0) };
}

/* ------------------------------ gemini multi mode ------------------------------ */

export type Silence = { start: number; end: number };

/** Interior silences of a wav (ffmpeg silencedetect), at least `minSec` long. Leading/trailing silence is ignored. */
export async function detectSilences(wav: string, minSec = 0.3, noiseDb = -40): Promise<{ silences: Silence[]; totalSec: number }> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-nostats", "-i", wav, "-af", `silencedetect=noise=${noiseDb}dB:d=${minSec}`, "-f", "null", "-"], { maxBuffer: 64 * 1024 * 1024 });
  const totalSec = (await probeMs(wav)) / 1000;
  const silences: Silence[] = [];
  let start: number | undefined;
  for (const line of stderr.split("\n")) {
    const a = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (a) start = Math.max(0, parseFloat(a[1]));
    const b = line.match(/silence_end:\s*([\d.]+)/);
    if (b && start !== undefined) {
      const end = parseFloat(b[1]);
      if (start > 0.05 && end < totalSec - 0.05) silences.push({ start, end });
      start = undefined;
    }
  }
  return { silences, totalSec };
}

/**
 * Picks `n-1` split silences out of the candidates. Exactly n-1 candidates: take them. More (a pause inside a line):
 * dynamic programme minimising squared error of the cut positions against the expected cumulative character share,
 * with a small bonus for longer silences. Fewer: undefined (lines merged).
 */
export function chooseSplits(cands: Silence[], totalSec: number, weights: number[], allSilences: Silence[] = cands): Silence[] | undefined {
  const k = weights.length - 1;
  if (k === 0) return [];
  if (cands.length < k) return undefined;
  if (cands.length === k) return cands;
  // Work on the speech-only timeline (all detected silences removed) so pause lengths do not distort expected shares.
  const speechTotal = Math.max(0.1, totalSec - allSilences.reduce((a, s) => a + (s.end - s.start), 0));
  const speechPos = (c: Silence) => c.start - allSilences.filter((s) => s.end <= c.start + 1e-6).reduce((a, s) => a + (s.end - s.start), 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const target: number[] = [];
  for (let i = 0; i < k; i++) {
    acc += weights[i];
    target.push((acc / sum) * speechTotal);
  }
  const pos = cands.map(speechPos);
  const cost = (i: number, j: number) => 200 * ((pos[j] - target[i]) / speechTotal) ** 2 - 0.05 * Math.min(cands[j].end - cands[j].start, 1.5);
  const M = cands.length;
  const dp: number[][] = Array.from({ length: k }, () => new Array(M).fill(Infinity));
  const from: number[][] = Array.from({ length: k }, () => new Array(M).fill(-1));
  for (let j = 0; j < M; j++) dp[0][j] = cost(0, j);
  for (let i = 1; i < k; i++)
    for (let j = i; j < M; j++)
      for (let p = i - 1; p < j; p++) {
        const v = dp[i - 1][p] + cost(i, j);
        if (v < dp[i][j]) {
          dp[i][j] = v;
          from[i][j] = p;
        }
      }
  let bj = 0;
  for (let j = 0; j < M; j++) if (dp[k - 1][j] < dp[k - 1][bj]) bj = j;
  const out: Silence[] = [];
  for (let i = k - 1, j = bj; i >= 0; j = from[i][j], i--) out.unshift(cands[j]);
  return out;
}

/**
 * Splits one long take into `weights.length` segments (time ranges) on its silences. Tries min silence 0.6 s, then 0.45, 0.3 s.
 * Returns undefined when it cannot be split reliably (too few silences, or a segment far off its expected share).
 */
export async function splitSegments(wav: string, weights: number[]): Promise<{ start: number; end: number }[] | undefined> {
  const n = weights.length;
  if (n === 1) return [{ start: 0, end: (await probeMs(wav)) / 1000 }];
  const { silences, totalSec } = await detectSilences(wav, 0.3);
  for (const minSec of [0.6, 0.45, 0.3]) {
    const picked = chooseSplits(silences.filter((s) => s.end - s.start >= minSec), totalSec, weights, silences);
    if (!picked) continue;
    const cuts = [0, ...picked.map((s) => (s.start + s.end) / 2), totalSec];
    const segs = cuts.slice(0, -1).map((c, i) => ({ start: c, end: cuts[i + 1] }));
    const sum = weights.reduce((a, b) => a + b, 0);
    const bad = segs.some((sg, i) => {
      const ratio = (sg.end - sg.start) / ((weights[i] / sum) * totalSec);
      return ratio < 0.4 || ratio > 2.5;
    });
    if (!bad) return segs;
    console.log(`[tts-multi] split at min ${minSec}s silence gave an implausible segment share, trying next`);
  }
  return undefined;
}

/**
 * Hooks supplied by the publish pipeline (kept out of this module so it has no dependency on the transcript check).
 * `verify`: true when a clip's transcript matches its beat; `words`: word timestamps of a long take (for alignment splits).
 */
export type VoiceHooks = {
  verify?: (wav: string, beat: { text: string; say?: string }, neighbors: { prev?: string; next?: string }) => Promise<boolean>;
  words?: (rawWav: string) => Promise<TimedWord[] | undefined>;
};

type MultiItem = { index: number; text: string; beat: { text: string; say?: string }; prev?: string; next?: string; role: VoiceRole; style?: string; out: string; meta: string };
type Seg = { start: number; end: number };

const isCached = (it: MultiItem) => existsSync(it.out) && existsSync(it.meta);
const dropClip = (it: MultiItem) => {
  for (const f of [it.out, it.meta]) rmSync(f, { force: true });
};

/** Cuts one segment out of a take, post-processes it into the cache; the meta file (which marks it cached) is written only once accepted. */
async function cutClip(rawAll: string, seg: Seg, it: MultiItem): Promise<void> {
  const rawPath = it.out.replace(/\.wav$/, ".raw.wav");
  await run(FFMPEG, ["-y", "-loglevel", "error", "-i", rawAll, "-ss", seg.start.toFixed(3), "-to", seg.end.toFixed(3), "-c:a", "pcm_s16le", rawPath]);
  await postprocess(rawPath, it.out, SPEED_BY_ENGINE.gemini * ROLE_SPEED[it.role]);
}

async function acceptClip(it: MultiItem, extra: object): Promise<void> {
  writeFileSync(it.meta, JSON.stringify({ duration_ms: await probeMs(it.out), spoken: applyLexicon(it.text), multi: true, ...extra }));
}

/**
 * Group of beats voiced in one request: humans (rookie+senior, one request) or narrator (one request).
 * Split on silences, then VALIDATE every clip's transcript against its line. Clips that fail are re-split by word alignment
 * (free), then the group is re-requested once with a stronger pause cue, then the remaining lines are voiced one by one.
 */
async function renderGeminiGroup(name: string, items: MultiItem[], key: string, fallback: (i: MultiItem) => Promise<void>, hooks: VoiceHooks): Promise<void> {
  const todo = items.filter((it) => !isCached(it));
  if (!todo.length) return;
  if (items.length === 1) {
    await fallback(items[0]);
    return;
  }
  // Voice the whole group (even if some lines are cached) so the take keeps its flow; only missing lines are written.
  const weights = items.map((it) => Math.max(1, applyLexicon(it.text).length));
  const spoken = items.map((it) => applyLexicon(it.text));
  const pending = new Set(todo);
  const outs = items.map((i) => i.out).join("|");
  const strategies = (rawAll: string): { label: string; split: () => Promise<Seg[] | undefined> }[] => [
    { label: "silence", split: () => splitSegments(rawAll, weights) },
    {
      label: "word alignment",
      split: async () => {
        const words = await hooks.words?.(rawAll);
        if (!words) return undefined;
        const { silences, totalSec } = await detectSilences(rawAll, 0.1);
        return alignSplit(spoken, words, silences, totalSec);
      },
    },
  ];
  for (const [attempt, cue] of [MULTI_PAUSE_CUE, STRONG_PAUSE_CUE].entries()) {
    if (!pending.size) break;
    // First attempt keeps the original tag so a cached raw take is reused (no request).
    const rawAll = join(CACHE_DIR, `gemini-multi-${sha(name + outs + (attempt ? `|${cue}` : ""))}.raw.wav`);
    if (!existsSync(rawAll)) writeFileSync(rawAll, await geminiDialogue(items.map((it) => ({ text: spoken[items.indexOf(it)], role: it.role, style: it.style })), key, cue));
    else console.log(`[tts-multi] ${name}: reusing cached take`);
    for (const st of strategies(rawAll)) {
      if (!pending.size) break;
      const segs = await st.split();
      if (!segs) {
        console.log(`[tts-multi] ${name}: ${st.label} split not possible${attempt ? " (retry take)" : ""}`);
        continue;
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!pending.has(it)) continue;
        await cutClip(rawAll, segs[i], it);
        const ok = hooks.verify ? await hooks.verify(it.out, it.beat, { prev: it.prev, next: it.next }) : true;
        if (ok) {
          await acceptClip(it, { split: st.label, ...(attempt ? { retry: "strong-cue" } : {}) });
          pending.delete(it);
        } else {
          dropClip(it);
          console.log(`[tts-multi] ${name}: beat ${it.index} transcript mismatch after ${st.label} split${attempt ? " (retry take)" : ""}`);
        }
      }
    }
    if (pending.size && attempt === 0) console.log(`[tts-multi] ${name}: ${pending.size} line(s) failed validation, retrying the group once with a stronger pause cue`);
  }
  for (const it of pending) {
    console.log(`[tts-multi] ${name}: voicing beat ${it.index} on its own`);
    await fallback(it);
    if (hooks.verify && !(await hooks.verify(it.out, it.beat, { prev: it.prev, next: it.next }))) console.log(`[tts-multi] ${name}: beat ${it.index} still mismatches after a per-line request; the transcript gate will report it`);
  }
}

/** Gemini multi mode: humans in one multi-speaker request, narrator in another; split per line; validated; cached per line. */
export async function renderStoryGeminiMulti(script: StoryScript, hooks: VoiceHooks = {}): Promise<{ lines: StoryLine[]; total_ms: number }> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const said = (i: number) => (script.beats[i] ? script.beats[i].say ?? script.beats[i].text : undefined);
  const items: MultiItem[] = script.beats.map((b, index) => {
    const text = b.say ?? b.text;
    const role = roleFor(script, b.speaker);
    const out = join(CACHE_DIR, `gemini-${cacheKey({ text, voice: role, engine: "gemini", style: b.style, multi: true })}.wav`);
    return { index, text, beat: { text: b.text, say: b.say }, prev: said(index - 1), next: said(index + 1), role, style: b.style, out, meta: `${out}.json` };
  });
  // Cached clips that do not match their line (an old bad split) are dropped so they are re-split / re-voiced below.
  if (hooks.verify) {
    for (const it of items) {
      if (isCached(it) && !(await hooks.verify(it.out, it.beat, { prev: it.prev, next: it.next }))) {
        console.log(`[tts-multi] cached clip for beat ${it.index} does not match its line, re-doing it`);
        dropClip(it);
      }
    }
  }
  if (!items.every(isCached)) {
    const key = envKey("GEMINI_API_KEY");
    if (!key) throw new Error("GEMINI_API_KEY is not set (add it to .env.local) - the Gemini TTS engine cannot run without it");
    const fallback = async (it: MultiItem) => {
      // Per-line request for just this line; result goes to the multi-cache path so reruns stay free.
      const spoken = applyLexicon(it.text);
      const rawPath = it.out.replace(/\.wav$/, ".raw.wav");
      writeFileSync(rawPath, await geminiCall(spoken, it.role, key, it.style));
      await postprocess(rawPath, it.out, SPEED_BY_ENGINE.gemini * ROLE_SPEED[it.role]);
      await acceptClip(it, { fallback: "line" });
    };
    await renderGeminiGroup("humans", items.filter((it) => it.role !== "narrator"), key, fallback, hooks);
    await renderGeminiGroup("narrator", items.filter((it) => it.role === "narrator"), key, fallback, hooks);
  }
  const lines: StoryLine[] = items.map((it) => ({
    beat_index: it.index,
    speaker: script.beats[it.index].speaker,
    wav: it.out,
    duration_ms: (JSON.parse(readFileSync(it.meta, "utf8")) as { duration_ms: number }).duration_ms,
  }));
  return { lines, total_ms: lines.reduce((a, l) => a + l.duration_ms, 0) };
}
