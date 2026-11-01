/**
 * `npm run agent -- publish <script.json>`: validate -> voice -> render (QA gate) -> poster -> upload -> post.
 * Video never goes through a Vercel function: it is PUT straight to Supabase Storage via a signed URL.
 */
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { GEMINI_MODEL, GeminiQuotaError, renderStory, setGeminiNoWait, type Engine, type StoryScript } from "./tts-v3";
import { checkVoicing, formatCheckTable, voiceHooks } from "./voice-check";
import { isLiteModel, pickEngine, topicBucket } from "./voice-policy";

const run = promisify(execFile);
const ROOT = process.cwd();
const RENDER_DIR = join(ROOT, "render");
const FFMPEG = process.env.FFMPEG_PATH ?? (process.platform === "darwin" ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg");

export type PublishOptions = {
  file: string;
  script: unknown;
  /** `auto` (default): Gemini flash, or a VOICE_GEMINI_SHARE split with OpenAI by topic hash. A concrete engine forces it. */
  engine: Engine | "auto";
  dryRun: boolean;
  /** On the Gemini daily cap, exit non-zero with the reset time instead of waiting (scheduled runs). */
  noWait?: boolean;
  fulfills?: string;
  answers?: string;
  parent?: string;
  call: (method: "GET" | "POST", path: string, body?: unknown, print?: boolean) => Promise<unknown>;
  base: () => string;
  fail: (message: string, extra?: unknown) => never;
};

type SignedTarget = { path: string; upload_url: string; public_url: string; content_type: string };

function envFileValue(name: string): string | undefined {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return m?.[1].trim().replace(/^["']|["']$/g, "") || undefined;
}

/** Prefer the billing Gemini key (the free tier rate-limits a 60-beat story). Never printed. */
export function applyBillingGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY_BILLING || envFileValue("GEMINI_API_KEY_BILLING");
  if (key) process.env.GEMINI_API_KEY = key;
  return !!key;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "reel";

async function validateWithRenderer(script: unknown): Promise<{ ok: true; warnings: string[] } | { ok: false; errors: string[] }> {
  // Dynamic import via a variable path so the root tsc does not follow into render/.
  const target = join(RENDER_DIR, "src", "schema.ts");
  const mod = (await import(/* @vite-ignore */ target)) as {
    validateStory: (i: unknown) => { ok: true; warnings: string[] } | { ok: false; errors: string[] };
  };
  return mod.validateStory(script);
}

async function putFile(target: SignedTarget, file: string): Promise<void> {
  const bytes = readFileSync(file);
  // Same wire format the Supabase SDK uses for uploadToSignedUrl.
  const form = new FormData();
  form.set("cacheControl", "31536000");
  form.set("", new Blob([new Uint8Array(bytes)], { type: target.content_type }));
  const res = await fetch(target.upload_url, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
  if (!res.ok) throw new Error(`upload of ${target.path} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

export async function publishV3(o: PublishOptions): Promise<void> {
  const { fail } = o;
  // a. validate
  const v = await validateWithRenderer(o.script);
  if (!v.ok) return fail("invalid v3 story", v.errors);
  for (const w of v.warnings) console.error(`warning: ${w}`);
  const script = o.script as StoryScript & { topic: string; title: string; beats: unknown[] };

  // b. voice: one engine per reel (auto = deterministic 80/20 by topic hash), then the transcript gate before rendering.
  const engine: Engine = o.engine === "auto" ? pickEngine(script.topic) : o.engine;
  if (engine === "gemini" && isLiteModel(GEMINI_MODEL)) return fail(`GEMINI_TTS_MODEL=${GEMINI_MODEL} is flash-lite, which is never used for final reels`);
  const billing = applyBillingGeminiKey();
  const why = o.engine === "auto" ? ` (auto: topic bucket ${topicBucket(script.topic)}/100, ${engine === "gemini" ? "<80 = gemini" : ">=80 = openai"})` : " (forced)";
  console.error(`voice: engine=${engine}${engine === "gemini" ? ` ${GEMINI_MODEL}${billing ? " (billing key)" : " (default key)"}` : ""}${why}, ${script.beats.length} beats`);
  setGeminiNoWait(Boolean(o.noWait));
  const started = Date.now();
  let voiced: Awaited<ReturnType<typeof renderStory>>;
  try {
    voiced = await renderStory(script, engine, voiceHooks());
  } catch (e) {
    if (e instanceof GeminiQuotaError) return fail("Gemini daily quota exhausted (--no-wait)", { reset_at: e.resetAt?.toISOString() ?? "unknown (rolling window)", message: e.message });
    throw e;
  }
  console.error(`voice: ${(voiced.total_ms / 1000).toFixed(1)}s of audio in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  const gate = await checkVoicing(script.beats as { text: string; say?: string }[], voiced.lines);
  if (!gate.ok) {
    console.error(formatCheckTable(gate.checks));
    return fail(`voice.transcript failed: ${gate.checks.filter((c) => !c.ok).length}/${gate.checks.length} lines do not match their script (nothing rendered or posted)`, gate.checks.filter((c) => !c.ok).map((c) => ({ beat: c.beat_index, want: c.want, heard: c.heard, reason: c.reason })));
  }
  console.error(formatCheckTable(gate.checks).split("\n")[0]);
  // Recorded in the posted script so the owner can see which engine voiced the reel.
  const posted_script = { ...(o.script as object), voice_engine: engine };

  // c. manifest + render (QA gate runs inside render.ts)
  const slug = slugify(script.topic);
  const outDir = join(RENDER_DIR, "out", "publish", slug);
  mkdirSync(outDir, { recursive: true });
  const scriptPath = join(outDir, "script.json");
  const manifestPath = join(outDir, "manifest.json");
  const mp4 = join(outDir, `${slug}.mp4`);
  writeFileSync(scriptPath, JSON.stringify(posted_script, null, 2));
  writeFileSync(
    manifestPath,
    JSON.stringify(
      { lines: voiced.lines.map((l) => ({ beat_index: l.beat_index, speaker: l.speaker, src: resolve(l.wav), duration_ms: l.duration_ms })) },
      null,
      2,
    ),
  );
  const tsx = join(RENDER_DIR, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, ["render.ts", scriptPath, manifestPath, mp4], { cwd: RENDER_DIR, stdio: "inherit" });
  if (r.status !== 0 || !existsSync(mp4)) {
    fail(`render failed (QA gate or renderer). Verify table / contact sheet: ${join(outDir, `verify-${slug}`)}`);
  }
  if (o.dryRun) {
    console.log(JSON.stringify({ dry_run: true, mp4, size_mb: +(statSync(mp4).size / 1048576).toFixed(2), manifest: manifestPath, verify: join(outDir, `verify-${slug}`) }, null, 2));
    return;
  }

  // d. poster frame (~1.0 s in)
  const poster = join(outDir, `${slug}.jpg`);
  await run(FFMPEG, ["-y", "-loglevel", "error", "-ss", "1.0", "-i", mp4, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "4", poster]);

  // e. signed URLs -> PUT -> POST reel
  const signed = (await o.call("POST", "/api/agent/reels/upload-url", { filename: `${slug}.mp4`, poster_filename: `${slug}.jpg` }, false)) as {
    video: SignedTarget;
    poster?: SignedTarget;
  };
  await putFile(signed.video, mp4);
  if (signed.poster) await putFile(signed.poster, poster);
  console.error(`upload: ${(statSync(mp4).size / 1048576).toFixed(2)} MB video${signed.poster ? " + poster" : ""} stored`);
  const posted = (await o.call(
    "POST",
    "/api/agent/reels",
    {
      script: posted_script,
      video_url: signed.video.public_url,
      ...(signed.poster ? { poster_url: signed.poster.public_url } : {}),
      ...(o.parent ? { parent_reel_id: o.parent } : {}),
      ...(o.answers ? { answers_feedback_id: o.answers } : {}),
      ...(o.fulfills ? { fulfills_request_id: o.fulfills } : {}),
    },
    false,
  )) as { id: string };
  // f.
  console.log(JSON.stringify({ id: posted.id, url: new URL(`/reel/${posted.id}`, o.base()).toString(), video_url: signed.video.public_url }, null, 2));
}
