import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// The existing runner preserves JSX. Compile just the pure helper without changing
// shared Vitest configuration or loading the provider's browser dependencies.
const source = ts.createSourceFile(
  "data.tsx",
  readFileSync(new URL("./data.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const helper = source.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "streakLabel",
);
if (!helper) throw new Error("Expected the streakLabel helper in data.tsx");
const compiled = ts.transpileModule(helper.getText(source), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports = {} as { streakLabel: (n: number) => string };
runInNewContext(compiled, { exports: moduleExports });
const { streakLabel } = moduleExports;

describe("streak label", () => {
  it.each([
    [0, ""],
    [1, "1 day streak"],
    [5, "5 day streak"],
  ])("formats %i days", (days, label) => {
    expect(streakLabel(days)).toBe(label);
  });
});
