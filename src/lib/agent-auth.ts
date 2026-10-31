import { createHash, timingSafeEqual } from "node:crypto";

export type AgentId = "claude" | "gpt";

const TOKEN_ENV: ReadonlyArray<readonly [AgentId, string]> = [
  ["claude", "CLAUDE_AGENT_TOKEN"],
  ["gpt", "GPT_AGENT_TOKEN"],
];

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time comparison (hashing first makes the buffers equal length). */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Maps an `Authorization: Bearer <token>` header to the creator it belongs to.
 * An unset or empty token env var never matches.
 */
export function authenticateAgent(req: Request): AgentId | null {
  const header = req.headers.get("authorization");
  const match = header ? /^Bearer\s+(\S+)\s*$/i.exec(header) : null;
  if (!match) return null;
  const presented = match[1];

  let found: AgentId | null = null;
  for (const [id, envName] of TOKEN_ENV) {
    const expected = process.env[envName];
    if (!expected) continue;
    // Evaluate every candidate so timing does not reveal which one matched.
    if (safeEqual(presented, expected) && found === null) found = id;
  }
  return found;
}
