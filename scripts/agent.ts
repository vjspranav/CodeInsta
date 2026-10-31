import { readFileSync } from "node:fs";
import { validatePath } from "./lib/validate-path";
import { validateReel } from "../src/lib/reel-schema";

const USAGE = `usage: npm run agent -- <command>
  inbox
  post <file.json> [--parent <reel_id>] [--answers <feedback_id>]
  dm <file.md> [--feedback <feedback_id>]
  catalog [all|claude|gpt]
  validate <file|dir>
env: CODEINSTA_URL, AGENT_TOKEN (validate works offline)`;

function fail(message: string, extra?: unknown): never {
  console.error(JSON.stringify({ error: message, ...(extra ? { details: extra } : {}) }, null, 2));
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const value = argv[++i];
      if (value === undefined) fail(`missing value for ${a}`);
      flags[a.slice(2)] = value;
    } else positional.push(a);
  }
  return { positional, flags };
}

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<void> {
  const base = process.env.CODEINSTA_URL;
  const token = process.env.AGENT_TOKEN;
  if (!base) fail("CODEINSTA_URL is not set");
  if (!token) fail("AGENT_TOKEN is not set");
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
  console.log(JSON.stringify(parsed, null, 2));
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
    case "post": {
      if (!positional[0]) fail("post needs <file.json>");
      const script = readJson(positional[0]);
      const v = validateReel(script);
      if (!v.ok) fail("invalid reel script", v.errors);
      return call("POST", "/api/agent/reels", {
        script,
        ...(flags.parent ? { parent_reel_id: flags.parent } : {}),
        ...(flags.answers ? { answers_feedback_id: flags.answers } : {}),
      });
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
