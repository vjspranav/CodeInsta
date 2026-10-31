import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { validateReel } from "../../src/lib/reel-schema";

export type FileValidation = { file: string; ok: boolean; errors: string[] };
export type PathValidation = { ok: boolean; total: number; invalid: number; files: FileValidation[] };

/** Validate one reel JSON file, or every *.json file directly inside a directory. */
export function validatePath(target: string): PathValidation {
  let paths: string[];
  try {
    paths = statSync(target).isDirectory()
      ? readdirSync(target).filter((f) => f.endsWith(".json")).sort().map((f) => join(target, f))
      : [target];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, total: 1, invalid: 1, files: [{ file: target, ok: false, errors: [msg] }] };
  }

  const files: FileValidation[] = paths.map((file) => {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      return { file, ok: false, errors: [`invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
    const result = validateReel(json);
    return result.ok ? { file, ok: true, errors: [] } : { file, ok: false, errors: result.errors };
  });
  const invalid = files.filter((f) => !f.ok).length;
  return { ok: invalid === 0, total: files.length, invalid, files };
}
