import { readFileSync } from "node:fs";
import { getSupabaseAdmin } from "../../src/lib/supabase-admin";
import { storeReelAudio, type AudioJson } from "../../src/lib/reel-audio";
import type { LocalAudioManifest } from "./tts";

/** Service-role upload (used by seed and local runs). Returns the public-URL manifest written to reels.audio. */
export async function uploadReelAudio(reelId: string, manifest: LocalAudioManifest): Promise<AudioJson> {
  const clip = (c: { file: string; duration_ms: number }) => ({
    bytes: new Uint8Array(readFileSync(c.file)),
    duration_ms: c.duration_ms,
  });
  return storeReelAudio(getSupabaseAdmin(), reelId, {
    voice: manifest.voice,
    hook: clip(manifest.hook),
    scenes: manifest.scenes.map((s) => ({
      ...(s.file ? clip(s) : { bytes: new Uint8Array(0), duration_ms: s.duration_ms }),
      words: s.words,
      ...(s.lines ? { lines: s.lines.map((l) => ({ ...clip(l), speaker: l.speaker, words: l.words })) } : {}),
    })),
    takeaway: clip(manifest.takeaway),
  });
}

/** Posts the manifest + mp3 files to /api/agent/reels/<id>/audio with a bearer token. */
export async function uploadReelAudioViaApi(
  base: string,
  token: string,
  reelId: string,
  manifest: LocalAudioManifest,
): Promise<AudioJson> {
  const form = new FormData();
  form.set(
    "manifest",
    JSON.stringify({
      voice: manifest.voice,
      hook: { duration_ms: manifest.hook.duration_ms },
      scenes: manifest.scenes.map((s) => ({
        duration_ms: s.duration_ms,
        words: s.words,
        ...(s.lines ? { lines: s.lines.map((l) => ({ duration_ms: l.duration_ms, speaker: l.speaker, words: l.words })) } : {}),
      })),
      takeaway: { duration_ms: manifest.takeaway.duration_ms },
    }),
  );
  const add = (name: string, file: string) =>
    form.set(name, new Blob([new Uint8Array(readFileSync(file))], { type: "audio/mpeg" }), `${name}.mp3`);
  add("hook", manifest.hook.file);
  manifest.scenes.forEach((s, i) => {
    if (s.file) add(`scene-${i}`, s.file);
    s.lines?.forEach((l, j) => add(`scene-${i}-line-${j}`, l.file));
  });
  add("takeaway", manifest.takeaway.file);

  const res = await fetch(new URL(`/api/agent/reels/${reelId}/audio`, base), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`audio upload HTTP ${res.status}: ${text}`);
  return JSON.parse(text) as AudioJson;
}
