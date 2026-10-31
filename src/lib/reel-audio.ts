import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIO_BUCKET = "reel-audio";

export type WordTiming = { w: string; start_ms: number };

/** v2: one clip per spoken line of a multi-voice scene. */
export type LineClip = { url: string; duration_ms: number; speaker: string; words: WordTiming[] };

/** The manifest stored in reels.audio (see docs/coordination/decisions.md). */
export type AudioJson = {
  voice: string;
  hook: { url: string; duration_ms: number };
  /** For scenes with `lines`, `lines` holds one clip per line (same order); url may be "" and words []. */
  scenes: { url: string; duration_ms: number; words: WordTiming[]; lines?: LineClip[] }[];
  takeaway: { url: string; duration_ms: number };
};

export type AudioClipBytes = { bytes: Uint8Array; duration_ms: number };
export type AudioUploadInput = {
  voice: string;
  hook: AudioClipBytes;
  scenes: (AudioClipBytes & { words: WordTiming[]; lines?: (AudioClipBytes & { speaker: string; words: WordTiming[] })[] })[];
  takeaway: AudioClipBytes;
};

/** Uploads the mp3s to reel-audio/<reelId>/ (upsert), then sets reels.audio. Service-role client required. */
export async function storeReelAudio(db: SupabaseClient, reelId: string, input: AudioUploadInput): Promise<AudioJson> {
  const version = Date.now(); // cache-buster: the same object path may be overwritten
  const put = async (name: string, bytes: Uint8Array): Promise<string> => {
    const path = `${reelId}/${name}.mp3`;
    const { error } = await db.storage.from(AUDIO_BUCKET).upload(path, bytes, {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`upload ${path} failed: ${error.message}`);
    return `${db.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl}?v=${version}`;
  };

  const audio: AudioJson = {
    voice: input.voice,
    hook: { url: await put("hook", input.hook.bytes), duration_ms: input.hook.duration_ms },
    scenes: [],
    takeaway: { url: "", duration_ms: input.takeaway.duration_ms },
  };
  for (let i = 0; i < input.scenes.length; i++) {
    const s = input.scenes[i];
    const lines: LineClip[] | undefined = s.lines
      ? []
      : undefined;
    for (let j = 0; lines && s.lines && j < s.lines.length; j++) {
      const line = s.lines[j];
      lines.push({ url: await put(`scene-${i}-line-${j}`, line.bytes), duration_ms: line.duration_ms, speaker: line.speaker, words: line.words });
    }
    audio.scenes.push({
      url: s.bytes.length ? await put(`scene-${i}`, s.bytes) : "",
      duration_ms: s.duration_ms,
      words: s.words,
      ...(lines ? { lines } : {}),
    });
  }
  audio.takeaway.url = await put("takeaway", input.takeaway.bytes);

  const { error } = await db.from("reels").update({ audio }).eq("id", reelId);
  if (error) throw new Error(`updating reels.audio failed: ${error.message}`);
  return audio;
}
