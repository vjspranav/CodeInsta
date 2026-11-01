import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Values starting with $ (optionally quoted) are env references (docs), not secrets.
const SECRET = /(SERVICE_ROLE|AGENT_TOKEN|PRIVATE KEY|sk-[A-Za-z0-9]{20,})\s*[=:]\s*(?!["'`]?\$)\S{16,}/;
const tracked = execSync("git ls-files", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\n")
  .filter(Boolean);

describe("secrets guard", () => {
  it("tracked files hold no live secrets", () => {
    const hits: string[] = [];
    for (const file of tracked.filter((f) => /^(apps\/mobile|docs|supabase)\//.test(f))) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      text.split("\n").forEach((line, i) => {
        if (SECRET.test(line)) hits.push(`${file}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("credentials and local env files are not tracked", () => {
    const bad = tracked.filter(
      (f) => f.startsWith("apps/mobile/credentials/") || /(^|\/)\.env\.local$/.test(f),
    );
    expect(bad).toEqual([]);
  });
});
