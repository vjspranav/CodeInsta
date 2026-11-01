import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Owner rule (2026-11-01): no emojis anywhere in the app. Plain arrows (→ ← ↓) are typography, not emoji.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css|json|webmanifest|html|js)$/.test(f) ? [p] : [];
  });
}

describe("no emojis in the app", () => {
  it("src/ and public/ contain no emoji or pictographs", () => {
    const hits = [...files("src"), ...files("public")].flatMap((p) =>
      readFileSync(p, "utf8")
        .split("\n")
        .flatMap((line, i) => (EMOJI.test(line) && !p.endsWith("no-emoji.test.ts") ? [`${p}:${i + 1}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
