// Generates ~10s Chatterbox reference clips from Kokoro voices. Run: npx tsx tts/make-voices.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { KokoroTTS } from "kokoro-js";

const OUT = join(process.cwd(), "tts", "voices");
const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const VOICES: Record<string, string> = { senior: "am_michael", rookie: "af_heart", narrator: "bm_george" };
const TEXT =
  "So here is the thing about caches. You put the hot data close to the user, and suddenly everything feels instant. " +
  "But the moment it goes stale, you have a brand new problem, and nobody is happy about it. That is the whole story, really.";

async function main() {
mkdirSync(OUT, { recursive: true });
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
for (const [name, voice] of Object.entries(VOICES)) {
  const raw = join(OUT, `${name}.raw.wav`);
  const audio = await tts.generate(TEXT, { voice: voice as never });
  await audio.save(raw);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", raw, "-t", "10", "-ac", "1", "-ar", "24000", join(OUT, `${name}.wav`)]);
  unlinkSync(raw);
  console.log("wrote", name, voice);
}
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
