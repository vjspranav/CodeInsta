import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePath } from "./lib/validate-path";
import { validateReel, type Reel } from "../src/lib/reel-schema";

const USAGE = `usage: npm run agent -- <command>
  inbox
  requests                      approved, unfulfilled requests + new categories (read-only, records no agent run)
  post <file.json> [--parent <reel_id>] [--answers <feedback_id>] [--fulfills <request_id>] [--no-audio]
  audio <reel_id> <file.json>   (re)render narration with Kokoro TTS and upload it
  dm <file.md> [--feedback <feedback_id>]
  catalog [all|claude|gpt]
  validate <file|dir>
env: CODEINSTA_URL, AGENT_TOKEN (validate works offline)
audio needs ffmpeg/ffprobe on PATH (or FFMPEG_PATH/FFPROBE_PATH) and downloads the Kokoro model on first use`;

function fail(message: string, extra?: unknown): never {
  console.error(JSON.stringify({ error: message, ...(extra ? { details: extra } : {}) }, null, 2));
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-audio") flags["no-audio"] = "true";
    else if (a.startsWith("--")) {
      const value = argv[++i];
      if (value === undefined) fail(`missing value for ${a}`);
      flags[a.slice(2)] = value;
    } else positional.push(a);
  }
  return { positional, flags };
}

function env() {
  const base = process.env.CODEINSTA_URL;
  const token = process.env.AGENT_TOKEN;
  if (!base) fail("CODEINSTA_URL is not set");
  if (!token) fail("AGENT_TOKEN is not set");
  return { base, token };
}

async function call(method: "GET" | "POST", path: string, body?: unknown, print = true): Promise<unknown> {
  const { base, token } = env();
  const res = await fetch(new URL(path, base), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  if (!res.ok) fail(`HTTP ${res.status}`, parsed);
  if (print) console.log(JSON.stringify(parsed, null, 2));
  return parsed;
}

/** Render narration locally (Kokoro) and upload it through the agent API. */
async function renderAndUpload(reelId: string, script: Reel, creator: "claude" | "gpt") {
  const { base, token } = env();
  const { renderReelAudio } = await import("./lib/tts");
  const { uploadReelAudioViaApi } = await import("./lib/audio-upload");
  const dir = mkdtempSync(join(tmpdir(), "codeinsta-audio-"));
  try {
    const started = Date.now();
    const manifest = await renderReelAudio(script, creator, dir);
    const audio = await uploadReelAudioViaApi(base, token, reelId, manifest);
    console.error(`audio: rendered and uploaded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return audio;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return fail(`cannot read JSON from ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  switch (cmd) {
    case "inbox":
      return call("GET", "/api/agent/inbox");
    case "requests": {
      const inbox = (await call("GET", "/api/agent/inbox?peek=1", undefined, false)) as {
        topic_requests: unknown[];
        new_categories: unknown[];
      };
      console.log(
        JSON.stringify({ topic_requests: inbox.topic_requests, new_categories: inbox.new_categories }, null, 2),
      );
      return;
    }
    case "post": {
      if (!positional[0]) fail("post needs <file.json>");
      const script = readJson(positional[0]);
      const v = validateReel(script);
      if (!v.ok) fail("invalid reel script", v.errors);
      const posted = (await call("POST", "/api/agent/reels", {
        script,
        ...(flags.parent ? { parent_reel_id: flags.parent } : {}),
        ...(flags.answers ? { answers_feedback_id: flags.answers } : {}),
        ...(flags.fulfills ? { fulfills_request_id: flags.fulfills } : {}),
      })) as { id: string; creator_id: "claude" | "gpt" };
      if (flags["no-audio"]) return;
      try {
        await renderAndUpload(posted.id, v.reel, posted.creator_id);
      } catch (e) {
        console.error(
          `WARN reel posted but audio failed (${e instanceof Error ? e.message : String(e)}). Retry: npm run agent -- audio ${posted.id} ${positional[0]}`,
        );
        process.exit(2);
      }
      return;
    }
    case "audio": {
      if (!positional[0] || !positional[1]) fail("audio needs <reel_id> <file.json>");
      const v = validateReel(readJson(positional[1]));
      if (!v.ok) fail("invalid reel script", v.errors);
      const catalog = (await call("GET", "/api/agent/catalog?creator=all", undefined, false)) as {
        reels: { id: string; creator_id: "claude" | "gpt" }[];
      };
      const row = catalog.reels.find((r) => r.id === positional[0]);
      if (!row) fail(`reel ${positional[0]} not found in catalog`);
      const audio = await renderAndUpload(positional[0], v.reel, row.creator_id);
      console.log(JSON.stringify(audio, null, 2));
      return;
    }
    case "dm": {
      if (!positional[0]) fail("dm needs <file.md>");
      const body_md = readFileSync(positional[0], "utf8");
      return call("POST", "/api/agent/messages", {
        body_md,
        ...(flags.feedback ? { feedback_id: flags.feedback } : {}),
      });
    }
    case "catalog":
      return call("GET", `/api/agent/catalog?creator=${encodeURIComponent(positional[0] ?? "all")}`);
    case "validate": {
      if (!positional[0]) fail("validate needs <file|dir>");
      const result = validatePath(positional[0]);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }
    default:
      console.error(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
