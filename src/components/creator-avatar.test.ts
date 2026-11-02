import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ComponentType } from "react";
import { describe, expect, it } from "vitest";

// The shared Vitest config keeps JSX untouched, so compile the component (and the shared mark
// data it imports) here with the automatic JSX runtime, as streak-label.test.ts does for data.tsx.
type Exported = Record<string, unknown>;
const nodeRequire = createRequire(import.meta.url);
function load(file: string, deps: Record<string, Exported> = {}): Exported {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const exports: Exported = {};
  const req = (id: string) => deps[id] ?? nodeRequire(id);
  runInNewContext(outputText, { exports, require: req, Object });
  return exports;
}
const marks = load("../../packages/shared/src/creator-marks.ts");
const CREATOR_MARKS = marks.CREATOR_MARKS as Record<string, { path: string }>;
const CreatorAvatar = load("./creator-avatar.tsx", {
  "../../packages/shared/src/creator-marks": marks,
}).CreatorAvatar as ComponentType<{ creatorId?: string; size?: number }>;

const render = (creatorId?: string, size?: number) =>
  renderToStaticMarkup(createElement(CreatorAvatar, { creatorId, size }));

describe("CreatorAvatar", () => {
  it.each([
    ["claude", "Claude", "#D97757"],
    ["gpt", "GPT", "#000000"],
  ])("renders the %s mark labelled with the creator name", (id, name, color) => {
    const html = render(id, 40);
    expect(html).toContain(`aria-label="${name}"`);
    expect(html).toContain(`d="${CREATOR_MARKS[id].path}"`);
    expect(html).toContain(`fill="${color}"`);
    expect(html).toContain("width:40px");
  });

  it("falls back to initials for an unknown creator", () => {
    const html = render("zed");
    expect(html).toContain('aria-label="zed"');
    expect(html).toContain(">Z<");
    expect(html).not.toContain("<svg");
  });

  it("does not treat prototype keys as creators", () => {
    expect(render("constructor")).not.toContain("<svg");
  });
});
