import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const designTokens = JSON.parse(
  readFileSync(resolve(process.cwd(), "packages/shared/design-tokens.json"), "utf8"),
) as {
  motion: {
    duration: Record<string, number>;
    easing: Record<string, number[]>;
  };
};

function declarationBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1];
}

describe("web motion tokens", () => {
  it("matches the shared duration and easing values", () => {
    const root = declarationBlock(":root");

    for (const [name, milliseconds] of Object.entries(designTokens.motion.duration)) {
      expect(root).toContain(`--dur-${name}: ${milliseconds}ms;`);
    }
    for (const [name, bezier] of Object.entries(designTokens.motion.easing)) {
      expect(root).toContain(`--ease-${name}: cubic-bezier(${bezier.join(", ")});`);
    }
  });

  it("uses role tokens for UI motion and disables transitions for reduced motion", () => {
    expect(css).toContain(
      "transition: transform var(--dur-instant) var(--ease-standard), border-color var(--dur-instant) var(--ease-standard);",
    );
    expect(css).toContain("animation: cap-in var(--dur-fast) var(--ease-decelerate);");
    expect(css).toContain("transition: background var(--dur-fast) var(--ease-standard);");

    const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(reducedMotion).toContain("transition-duration: 0.01ms !important;");
  });
});
