/**
 * QA gate step `voice.transcript`: transcribe every voiced line clip (OpenAI gpt-4o-mini-transcribe, cached by clip hash)
 * and require it to match its line. Catches mis-splits (a clip holding the next line), TTS hallucinations and dropped words.
 * Comparison is tolerant of digits vs number words, spelled letters vs acronyms, hyphens/ellipses and a few homophones.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TimedWord } from "./split-align";
import { applyLexicon, CACHE_DIR, type VoiceHooks } from "./tts-v3";
import { align, expandYears, joinCompounds, normalizeTokens, tokensMatch } from "./voice-normalize";

export { normalizeTokens, tokensMatch } from "./voice-normalize";

export const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
const TRANSCRIPT_DIR = join(CACHE_DIR, "transcripts");
/** Minimum share of a line's words that must be heard. */
export const MIN_HIT = 0.7;

/* --------------------------------- scoring --------------------------------- */

export type LineScore = { ok: boolean; hit: number; leading: number; trailing: number; extras: number; reason: string };

function scoreOne(wantIn: string[], gotIn: string[], prevLast?: string, nextFirst?: string): LineScore {
  const want = joinCompounds(wantIn, gotIn);
  const got = joinCompounds(gotIn, wantIn);
  if (!want.length) return { ok: true, hit: 1, leading: 0, trailing: 0, extras: 0, reason: "" };
  const pairs = align(want, got);
  const hit = pairs.length / want.length;
  const leading = pairs.length ? pairs[0][1] : got.length;
  const trailing = pairs.length ? got.length - 1 - pairs[pairs.length - 1][1] : 0;
  const extras = got.length - pairs.length;
  const reasons: string[] = [];
  if (hit < MIN_HIT) reasons.push(`only ${(hit * 100).toFixed(0)}% of words heard`);
  if (trailing > 1) reasons.push(`${trailing} extra words after the line`);
  if (leading > 1) reasons.push(`${leading} extra words before the line`);
  if (extras > Math.max(2, Math.floor(want.length * 0.25))) reasons.push(`${extras} unexpected words`);
  if (trailing >= 1 && nextFirst && tokensMatch(got[got.length - trailing], nextFirst) && !want.some((w) => tokensMatch(w, nextFirst))) reasons.push("clip runs into the next line");
  if (leading >= 1 && prevLast && tokensMatch(got[leading - 1], prevLast) && !want.some((w) => tokensMatch(w, prevLast))) reasons.push("clip starts with the previous line");
  return { ok: reasons.length === 0, hit, leading, trailing, extras, reason: reasons.join("; ") };
}

/**
 * Scores a transcript against one or more acceptable spellings of the line (the beat's `say` and `text`, with and without the
 * pronunciation lexicon). Passes when any candidate passes. `prev`/`next` are the neighbouring lines' texts (to catch a shifted split).
 */
export function scoreLine(candidates: string[], heard: string, neighbors: { prev?: string; next?: string } = {}): LineScore {
  const lastOf = (s?: string) => (s ? normalizeTokens(s).at(-1) : undefined);
  const firstOf = (s?: string) => (s ? normalizeTokens(s)[0] : undefined);
  const prevLast = lastOf(neighbors.prev);
  const nextFirst = firstOf(neighbors.next);
  let best: LineScore | undefined;
  for (const c of candidates) {
    for (const [wa, ga] of [[false, false], [true, true], [false, true], [true, false]] as const) {
      const base = normalizeTokens(c, wa);
      const got = normalizeTokens(heard, ga);
      for (const want of [base, expandYears(base)]) {
        const sc = scoreOne(want, got, prevLast, nextFirst);
        if (sc.ok) return sc;
        if (!best || sc.hit > best.hit || (sc.hit === best.hit && sc.extras < best.extras)) best = sc;
      }
    }
  }
  return best ?? { ok: true, hit: 1, leading: 0, trailing: 0, extras: 0, reason: "" };
}

/** The spellings a beat's line may legitimately be heard as. */
export function lineCandidates(beat: { text: string; say?: string }): string[] {
  const raw = [beat.say, beat.text].filter((x): x is string => !!x);
  return [...new Set([...raw, ...raw.map((r) => applyLexicon(r))])];
}

/* ------------------------------ transcription ------------------------------ */

export type Transcriber = (wavPath: string) => Promise<string>;

function clipHash(wavPath: string): string {
  return createHash("sha256").update(readFileSync(wavPath)).update(TRANSCRIBE_MODEL).digest("hex").slice(0, 24);
}

let transcribeCalls = 0;
/** Number of OpenAI transcription requests made in this process (cache hits excluded). */
export const transcribeRequestCount = () => transcribeCalls;

/** OpenAI transcription of one clip, cached by clip content so it is never repeated. */
export const transcribeClip: Transcriber = async (wavPath) => {
  mkdirSync(TRANSCRIPT_DIR, { recursive: true });
  const cache = join(TRANSCRIPT_DIR, `${clipHash(wavPath)}.json`);
  if (existsSync(cache)) return (JSON.parse(readFileSync(cache, "utf8")) as { text: string }).text;
  const key = process.env.OPENAI_API_KEY ?? readEnvLocal("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set (add it to .env.local) - the transcript check needs it");
  const fd = new FormData();
  fd.append("model", TRANSCRIBE_MODEL);
  fd.append("language", "en");
  fd.append("file", new Blob([new Uint8Array(readFileSync(wavPath))], { type: "audio/wav" }), "clip.wav");
  transcribeCalls++;
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
  if (!res.ok) throw new Error(`OpenAI transcription ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = ((await res.json()) as { text?: string }).text ?? "";
  writeFileSync(cache, JSON.stringify({ text, model: TRANSCRIBE_MODEL }));
  return text;
};

function readEnvLocal(name: string): string | undefined {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return undefined;
  return readFileSync(p, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "") || undefined;
}

/* ---------------------------------- gate ---------------------------------- */

export type VoiceCheckBeat = { text: string; say?: string };
export type VoiceCheckLine = { beat_index: number; wav: string };
export type LineCheck = LineScore & { beat_index: number; want: string; heard: string };

/** Checks every clip against its beat (and the neighbours, to spot a shifted split). */
export async function checkVoicing(beats: VoiceCheckBeat[], lines: VoiceCheckLine[], transcribe: Transcriber = transcribeClip): Promise<{ ok: boolean; checks: LineCheck[] }> {
  const checks: LineCheck[] = [];
  const spoken = (i: number) => (beats[i] ? beats[i].say ?? beats[i].text : undefined);
  for (const l of lines) {
    const beat = beats[l.beat_index];
    const heard = await transcribe(l.wav);
    const sc = scoreLine(lineCandidates(beat), heard, { prev: spoken(l.beat_index - 1), next: spoken(l.beat_index + 1) });
    checks.push({ ...sc, beat_index: l.beat_index, want: beat.say ?? beat.text, heard });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/** Readable table of failing lines (all lines with `all`). */
export function formatCheckTable(checks: LineCheck[], all = false): string {
  const rows = checks.filter((c) => all || !c.ok);
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const out = [`voice.transcript: ${checks.filter((c) => c.ok).length}/${checks.length} lines match`];
  for (const c of rows) out.push(`${c.ok ? "ok  " : "FAIL"} beat ${String(c.beat_index).padStart(2)} ${String((c.hit * 100).toFixed(0)).padStart(3)}% | want: ${cut(c.want, 70)} | heard: ${cut(c.heard, 70)}${c.ok ? "" : ` | ${c.reason}`}`);
  return out.join("\n");
}

/* ------------------------- hooks for the multi-speaker split ------------------------- */

/** Word timestamps of a long take (whisper-1), cached by file content. Used to find line boundaries; never decides pass/fail. */
export async function transcribeWords(wavPath: string): Promise<TimedWord[] | undefined> {
  mkdirSync(TRANSCRIPT_DIR, { recursive: true });
  const hash = createHash("sha256").update(readFileSync(wavPath)).update("whisper-1-words").digest("hex").slice(0, 24);
  const cache = join(TRANSCRIPT_DIR, `${hash}.words.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8")) as TimedWord[];
  const key = process.env.OPENAI_API_KEY ?? readEnvLocal("OPENAI_API_KEY");
  if (!key) return undefined;
  const fd = new FormData();
  fd.append("model", "whisper-1");
  fd.append("language", "en");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("file", new Blob([new Uint8Array(readFileSync(wavPath))], { type: "audio/wav" }), "take.wav");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
  if (!res.ok) return undefined;
  const words = ((await res.json()) as { words?: TimedWord[] }).words;
  if (!words?.length) return undefined;
  writeFileSync(cache, JSON.stringify(words));
  return words;
}

/** Hooks for renderStory: validate each split clip by transcript, and align splits by word timestamps. */
export function voiceHooks(transcribe: Transcriber = transcribeClip): VoiceHooks {
  return {
    verify: async (wav, beat, neighbors) => scoreLine(lineCandidates(beat), await transcribe(wav), neighbors).ok,
    words: transcribeWords,
  };
}
