import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Owner rule (2026-11-01): no emojis anywhere in the app. Plain arrows are typography, not emoji.
// Same pattern as the web app's src/no-emoji.test.ts.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;

const ROOT = resolve(__dirname, "..");
const DIRS = ["app", "src", "modules", "plugins", "native", "targets", "assets"];
const EXT = /\.(ts|tsx|json|kt|swift|xml|strings|js)$/;
const SKIP_DIRS = new Set(["node_modules", "build", "Pods", ".gradle"]);

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return SKIP_DIRS.has(name) ? [] : files(p);
    return EXT.test(name) ? [p] : [];
  });
}

describe("no emojis in the mobile app", () => {
  it("app, src, modules, plugins, native, targets, assets and app.config.ts contain none", () => {
    const targets = [...DIRS.flatMap((d) => files(join(ROOT, d))), join(ROOT, "app.config.ts")];
    const hits = targets.flatMap((p) => {
      if (!existsSync(p) || p.endsWith("no-emoji.test.ts")) return [];
      return readFileSync(p, "utf8")
        .split("\n")
        .flatMap((line, i) => (EMOJI.test(line) ? [`${p.slice(ROOT.length + 1)}:${i + 1}`] : []));
    });
    expect(hits).toEqual([]);
  });

  it("the pattern catches pictographs and ignores arrows", () => {
    expect(EMOJI.test("\u{1F600}")).toBe(true);
    expect(EMOJI.test("❤️")).toBe(true);
    expect(EMOJI.test("→ ← ↓")).toBe(false);
  });
});
