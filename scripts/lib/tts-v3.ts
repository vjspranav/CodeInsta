/**
 * Reels v3 create-time TTS layer: lexicon -> engine (chatterbox | gemini | openai) -> ffmpeg post-process -> per-line wav.
 * Not used at runtime by the app; only by the create/render pipeline.
 */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = process.cwd();
const FFMPEG = process.env.FFMPEG_PATH ?? (process.platform === "darwin" ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg");
const FFPROBE = process.env.FFPROBE_PATH ?? (process.platform === "darwin" ? "/opt/homebrew/bin/ffprobe" : "ffprobe");
export const TTS_DIR = join(ROOT, "tts");
export const CACHE_DIR = join(TTS_DIR, "cache");
const VOICES_DIR = join(TTS_DIR, "voices");

export const SPEED = 1.12;
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
/** Default per-speaker delivery instructions (Gemini style / OpenAI `instructions`). */
export const STYLE_INSTRUCTIONS: Record<VoiceRole, string> = {
  rookie: "Upbeat, quick and a little cocky, like an overconfident junior engineer. Bright, clear tone.",
  senior: "Calm, dry and warm, with understated humor. Unhurried but not slow.",
  narrator: "Neutral documentary narration, brisk and clear.",
};
/** Chatterbox emotion controls per speaker (exaggeration, cfg_weight). */
const CHATTERBOX_PARAMS: Record<VoiceRole, { exaggeration: number; cfg_weight: number }> = {
  rookie: { exaggeration: 0.65, cfg_weight: 0.4 },
  senior: { exaggeration: 0.4, cfg_weight: 0.5 },
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

/** Trim silence, loudnorm, speed up by 1.12, mono 24 kHz wav. */
async function postprocess(rawWav: string, out: string): Promise<void> {
  const trim =
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse," +
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse";
  const af = `${trim},atempo=${SPEED},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000`;
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

async function chatterbox(text: string, role: VoiceRole, style?: string): Promise<Buffer> {
  await ensureChatterbox();
  const p = { ...CHATTERBOX_PARAMS[role] };
  if (style && /excit|energ|hype|shock|panic/i.test(style)) p.exaggeration = Math.min(1, p.exaggeration + 0.2);
  if (style && /calm|dry|flat|deadpan|quiet/i.test(style)) p.exaggeration = Math.max(0.25, p.exaggeration - 0.15);
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
  const body = {
    model: GEMINI_MODEL,
    input: [
      {
        type: "user_input",
        content: [
          { type: "text", text, annotations: [{ type: "speech_metadata", style: style ?? STYLE_INSTRUCTIONS[role] }] },
        ],
      },
    ],
    response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
    generation_config: { speech_config: [{ voice: GEMINI_VOICES[role] }] },
  };
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as { steps?: { content?: { type?: string; data?: string }[] }[] };
  let b64: string | undefined;
  for (const s of json.steps ?? []) for (const c of s.content ?? []) if (c.type === "audio" && c.data) b64 = c.data;
  if (!b64) throw new Error("Gemini TTS response had no audio");
  const buf = Buffer.from(b64, "base64");
  return isRiff(buf) ? buf : pcmToWav(buf);
}

async function openai(text: string, role: VoiceRole, style?: string): Promise<Buffer> {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set (add it to .env.local) - the OpenAI TTS engine cannot run without it");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      voice: OPENAI_VOICES[role],
      input: text,
      instructions: style ?? STYLE_INSTRUCTIONS[role],
      response_format: "pcm", // raw 24 kHz 16-bit mono
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return isRiff(buf) ? buf : pcmToWav(buf);
}

/* ---------------------------------- public API ---------------------------------- */

export type RenderLineInput = { text: string; voice: VoiceRole; engine: Engine; style?: string };
export type RenderLineResult = { wav: string; duration_ms: number; cached: boolean };

/** Renders one line: lexicon -> engine -> ffmpeg post-process. Cached by content hash in tts/cache/. */
export async function renderLine({ text, voice, engine, style }: RenderLineInput): Promise<RenderLineResult> {
  const spoken = applyLexicon(text);
  const model = engine === "gemini" ? GEMINI_MODEL : engine === "openai" ? OPENAI_MODEL : "cb1";
  const hash = sha(JSON.stringify([engine, model, voice, style ?? "", spoken, SPEED]));
  mkdirSync(CACHE_DIR, { recursive: true });
  const out = join(CACHE_DIR, `${engine}-${hash}.wav`);
  const meta = `${out}.json`;
  if (existsSync(out) && existsSync(meta)) {
    return { wav: out, duration_ms: (JSON.parse(readFileSync(meta, "utf8")) as { duration_ms: number }).duration_ms, cached: true };
  }
  const raw = engine === "gemini" ? await gemini(spoken, voice, style) : engine === "openai" ? await openai(spoken, voice, style) : await chatterbox(spoken, voice, style);
  const rawPath = join(CACHE_DIR, `${engine}-${hash}.raw.wav`);
  writeFileSync(rawPath, raw);
  await postprocess(rawPath, out);
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

/** Renders every beat (`say` overrides `text`). Sequential, so a local engine is never overloaded. */
export async function renderStory(script: StoryScript, engine: Engine): Promise<{ lines: StoryLine[]; total_ms: number }> {
  const lines: StoryLine[] = [];
  for (let i = 0; i < script.beats.length; i++) {
    const b = script.beats[i];
    const r = await renderLine({ text: b.say ?? b.text, voice: roleFor(script, b.speaker), engine, style: b.style });
    lines.push({ beat_index: i, speaker: b.speaker, wav: r.wav, duration_ms: r.duration_ms });
  }
  return { lines, total_ms: lines.reduce((a, l) => a + l.duration_ms, 0) };
}
