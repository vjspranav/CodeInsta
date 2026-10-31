import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { validatePath } from "./validate-path";

const example = (n: string) => join(__dirname, "../../content/examples", `${n}.json`);
const dir = mkdtempSync(join(tmpdir(), "validate-path-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("validatePath", () => {
  it("accepts a valid file", () => {
    const r = validatePath(example("compiler-ir"));
    expect(r.ok).toBe(true);
    expect(r.total).toBe(1);
  });

  it("validates every json file in a directory and flags bad ones", () => {
    copyFileSync(example("compiler-ir"), join(dir, "a.json"));
    writeFileSync(join(dir, "b.json"), "{ not json");
    writeFileSync(join(dir, "c.json"), JSON.stringify({ version: 1 }));
    writeFileSync(join(dir, "ignored.txt"), "x");
    const r = validatePath(dir);
    expect(r.ok).toBe(false);
    expect(r.total).toBe(3);
    expect(r.invalid).toBe(2);
    expect(r.files.find((f) => f.file.endsWith("b.json"))?.errors[0]).toMatch(/invalid JSON/);
    expect(r.files.find((f) => f.file.endsWith("c.json"))?.errors.length).toBeGreaterThan(0);
  });

  it("reports a missing path as invalid", () => {
    const r = validatePath(join(dir, "nope.json"));
    expect(r.ok).toBe(false);
  });
});
