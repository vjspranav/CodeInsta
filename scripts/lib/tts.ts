import { execFile } from "node:child_process";
import { mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AudioJson, WordTiming } from "../../src/lib/reel-audio";
import type { Reel } from "../../src/lib/reel-schema";

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? (process.platform === "darwin" ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg");
const FFPROBE = process.env.FFPROBE_PATH ?? (process.platform === "darwin" ? "/opt/homebrew/bin/ffprobe" : "ffprobe");

// Trim leading/trailing silence so karaoke timing and pacing stay tight.
const TRIM =
  "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse," +
  "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse";

export const VOICES = { claude: "am_michael", gpt: "af_heart" } as const;
export type CreatorId = keyof typeof VOICES;

export type { WordTiming, AudioJson };
export type LocalClip = { file: string; text: string; duration_ms: number; words: WordTiming[] };
export type LocalAudioManifest = {
  voice: string;
  hook: LocalClip;
  scenes: LocalClip[];
  takeaway: LocalClip;
};

type Tts = {
  generate(text: string, opts: { voice: string; speed?: number }): Promise<{ save(path: string): Promise<void> | void }>;
};
let ttsPromise: Promise<Tts> | undefined;

function getTts(): Promise<Tts> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      return (await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
        device: "cpu",
      })) as unknown as Tts;
    })();
  }
  return ttsPromise;
}

/** Approximate word timings: spread over the duration by character length, after a short lead-in. */
export function wordTimings(text: string, durationMs: number): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lead = Math.min(120, Math.round(durationMs * 0.05));
  const usable = Math.max(1, durationMs - lead);
  const weights = words.map((w) => w.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return words.map((w, i) => {
    const start = lead + Math.round((acc / total) * usable);
    acc += weights[i];
    return { w, start_ms: start };
  });
}

export async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Math.round(parseFloat(stdout.trim()) * 1000);
}

async function renderClip(tts: Tts, text: string, voice: string, base: string): Promise<LocalClip> {
  const wav = `${base}.wav`;
  const mp3 = `${base}.mp3`;
  const audio = await tts.generate(text, { voice });
  await audio.save(wav);
  await run(FFMPEG, [
    "-y", "-loglevel", "error", "-i", wav,
    "-ac", "1", "-af", TRIM + ",loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "24000", "-b:a", "64k", mp3,
  ]);
  try {
    unlinkSync(wav);
  } catch {
    /* ignore */
  }
  const duration_ms = await probeDurationMs(mp3);
  return { file: mp3, text, duration_ms, words: wordTimings(text, duration_ms) };
}

/** Render hook, every scene (narration || caption) and takeaway to mp3 files in outDir. */
export async function renderReelAudio(script: Reel, creator: CreatorId, outDir: string): Promise<LocalAudioManifest> {
  const voice = VOICES[creator];
  if (!voice) throw new Error(`no voice for creator ${creator}`);
  mkdirSync(outDir, { recursive: true });
  const tts = await getTts();
  const hook = await renderClip(tts, script.hook, voice, join(outDir, "hook"));
  const scenes: LocalClip[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const s = script.scenes[i];
    scenes.push(await renderClip(tts, (s.narration || s.caption).trim(), voice, join(outDir, `scene-${i}`)));
  }
  const takeaway = await renderClip(tts, script.takeaway, voice, join(outDir, "takeaway"));
  return { voice, hook, scenes, takeaway };
}
