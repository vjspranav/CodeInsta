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
export type LocalLineClip = LocalClip & { speaker: string };
export type LocalSceneClip = LocalClip & { lines?: LocalLineClip[] };
export type LocalAudioManifest = {
  voice: string;
  hook: LocalClip;
  /** For scenes with `lines`, `file` is "" (no scene-level mp3) and duration_ms is the sum of the lines. */
  scenes: LocalSceneClip[];
  takeaway: LocalClip;
};

/** Kokoro speed for v2 (multi-voice) reels: livelier, less lecture-like. v1 keeps the default pace. */
export const V2_SPEED = 1.08;

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

async function renderClip(tts: Tts, text: string, voice: string, base: string, speed?: number): Promise<LocalClip> {
  const wav = `${base}.wav`;
  const mp3 = `${base}.mp3`;
  const audio = await tts.generate(text, speed === undefined ? { voice } : { voice, speed });
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

/**
 * Render hook, every scene and takeaway to mp3 files in outDir.
 * v1: one narration clip per scene (narration || caption) in the creator voice.
 * v2 (cast present): scenes with `lines` get one clip per line in the speaker's cast voice (speed 1.08);
 * hook and takeaway use the first cast member's voice.
 */
export async function renderReelAudio(script: Reel, creator: CreatorId, outDir: string): Promise<LocalAudioManifest> {
  const defaultVoice = VOICES[creator];
  if (!defaultVoice) throw new Error(`no voice for creator ${creator}`);
  const cast = script.cast ?? [];
  const v2 = script.version === 2 || cast.length > 0;
  const speed = v2 ? V2_SPEED : undefined;
  const voice = cast[0]?.voice || defaultVoice;
  const voiceFor = (speaker: string): string => cast.find((m) => m.id === speaker)?.voice || defaultVoice;
  mkdirSync(outDir, { recursive: true });
  const tts = await getTts();
  const hook = await renderClip(tts, script.hook, voice, join(outDir, "hook"), speed);
  const scenes: LocalSceneClip[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const s = script.scenes[i];
    if (s.lines?.length) {
      const lines: LocalLineClip[] = [];
      for (let j = 0; j < s.lines.length; j++) {
        const line = s.lines[j];
        const clip = await renderClip(tts, line.text.trim(), voiceFor(line.speaker), join(outDir, `scene-${i}-line-${j}`), speed);
        lines.push({ ...clip, speaker: line.speaker });
      }
      scenes.push({
        file: "",
        text: lines.map((l) => l.text).join(" "),
        duration_ms: lines.reduce((t, l) => t + l.duration_ms, 0),
        words: [],
        lines,
      });
    } else {
      scenes.push(await renderClip(tts, (s.narration || s.caption).trim(), voice, join(outDir, `scene-${i}`), speed));
    }
  }
  const takeaway = await renderClip(tts, script.takeaway, voice, join(outDir, "takeaway"), speed);
  return { voice, hook, scenes, takeaway };
}
