import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cssVariables, designTokens, type DesignTheme } from "./design-tokens";

const rawCss = readFileSync(resolve(__dirname, "../../../src/app/globals.css"), "utf8");

/** Lowercases hex colors and expands #rgb / #rgba, adds leading zeros (.5 -> 0.5), collapses whitespace. */
function norm(value: string): string {
  return value
    .replace(/#([0-9a-fA-F]{3,4})\b/g, (_m, h: string) => "#" + [...h].map((c) => c + c).join(""))
    .replace(/#[0-9a-fA-F]{6,8}\b/g, (m) => m.toLowerCase())
    .replace(/(^|[\s:(,-])\.(\d)/g, "$10.$2")
    .replace(/\s+/g, " ")
    .trim();
}

const css = norm(rawCss);

function block(re: RegExp): string | null {
  const m = rawCss.match(re);
  return m ? m[1] : null;
}

const rootBlock = block(/:root\s*{([^}]*)}/) ?? "";
const themeBlocks: Record<DesignTheme, string | null> = {
  dark: rootBlock,
  light:
    block(/:root\[data-theme=["']light["']\]\s*{([^}]*)}/) ??
    block(/prefers-color-scheme:\s*light\)\s*{\s*:root\s*{([^}]*)}/),
};

function declared(source: string, name: string): string | undefined {
  const m = source.match(new RegExp(`(?:^|[;\\s{])${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`));
  return m ? norm(m[1]) : undefined;
}

function declarations(prop: string): string[] {
  return [...css.matchAll(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, "g"))].map((m) => m[1]);
}

const hasPx = (prop: string, px: number) =>
  declarations(prop).some((v) => new RegExp(`(?<![\\d.])${px}px`).test(v));
const hasPxAnywhere = (px: number) => new RegExp(`(?<![\\d.])${px}px`).test(css);

describe("design tokens vs src/app/globals.css", () => {
  const themes: DesignTheme[] = ["dark", "light"];

  it("color tokens with a cssVar equal the CSS variable value for the matching theme", () => {
    for (const theme of themes) {
      const source = themeBlocks[theme];
      if (source === null) continue; // the web has no block for this theme yet
      for (const [name, cssName] of Object.entries(designTokens.color.cssVar)) {
        const value = (designTokens.color[theme] as Record<string, string>)[name];
        expect(declared(source, cssName), `${theme}.${name} ${cssName}`).toBe(norm(value));
      }
    }
  });

  it("the dark theme exists on the web and light has the same keys as dark", () => {
    expect(themeBlocks.dark).not.toBe("");
    expect(Object.keys(designTokens.color.light).sort()).toEqual(Object.keys(designTokens.color.dark).sort());
    for (const name of Object.keys(designTokens.color.cssVar)) {
      expect(designTokens.color.dark).toHaveProperty(name);
    }
  });

  it("dark colors without a cssVar are literals used in globals.css", () => {
    const mapped = new Set(Object.keys(designTokens.color.cssVar));
    for (const [name, value] of Object.entries(designTokens.color.dark)) {
      if (mapped.has(name)) continue;
      expect(css, `dark.${name}`).toContain(norm(value));
    }
  });

  it("cssVariables returns every mapped variable per theme", () => {
    for (const theme of themes) {
      const vars = cssVariables(theme);
      expect(Object.keys(vars).sort()).toEqual(Object.values(designTokens.color.cssVar).sort());
      for (const [name, cssName] of Object.entries(designTokens.color.cssVar)) {
        expect(vars[cssName]).toBe((designTokens.color[theme] as Record<string, string>)[name]);
      }
    }
  });

  it("font families equal the web declarations", () => {
    expect(declared(rootBlock, designTokens.font.cssProp.sans)).toBe(norm(designTokens.font.sans));
    expect(css).toContain(`font-family: ${norm(designTokens.font.mono)}`);
  });

  it("radius and space values are px literals used by the web", () => {
    for (const [name, v] of Object.entries(designTokens.radius)) {
      expect(hasPx("border-radius", v) || hasPx("border-bottom-left-radius", v), `radius.${name}`).toBe(true);
    }
    for (const [name, v] of Object.entries(designTokens.space)) {
      expect(hasPxAnywhere(v), `space.${name}`).toBe(true);
    }
  });

  it("type sizes, weights, line heights and letter spacing exist in the web CSS", () => {
    const weights = declarations("font-weight");
    const lineHeights = declarations("line-height");
    const spacings = declarations("letter-spacing");
    for (const [role, t] of Object.entries(designTokens.type)) {
      expect(hasPx("font-size", t.size), `${role}.size`).toBe(true);
      expect(weights.some((w) => w === String(t.weight)), `${role}.weight`).toBe(true);
      expect(lineHeights.some((l) => l === String(t.lineHeight)), `${role}.lineHeight`).toBe(true);
      if (t.letterSpacing !== 0) expect(spacings.some((s) => s === `${t.letterSpacing}px`), `${role}.letterSpacing`).toBe(true);
    }
  });

  it("layout and z-index values exist in the web CSS", () => {
    for (const [name, v] of Object.entries(designTokens.layout)) {
      expect(hasPxAnywhere(v), `layout.${name}`).toBe(true);
    }
    const z = declarations("z-index").map((v) => v.replace(/\s*!important/, ""));
    for (const [name, v] of Object.entries(designTokens.z)) {
      expect(z, `z.${name}`).toContain(String(v));
    }
  });

  it("shadows match the web declarations", () => {
    // "0 1px 3px #000c, 0 0 1px #000c" -> [[0,1,3,"#000000cc"], ...]
    const parse = (value: string) =>
      norm(value)
        .split(",")
        .map((layer) => {
          const [x, y, blur, color] = layer.trim().split(" ");
          return [parseFloat(x), parseFloat(y), parseFloat(blur), color];
        });
    for (const [name, s] of Object.entries(designTokens.shadow)) {
      if (s.layers.length === 0) continue;
      expect(css, `shadow.${name}`).toContain(norm(s.css));
      expect(s.layers.map((l) => [l.x, l.y, l.blur, norm(l.color)]), `shadow.${name} layers`).toEqual(parse(s.css));
    }
    expect(declared(css, "--shadow")).toBe(norm(designTokens.shadow.overlayText.css));
  });

  it("the press scale matches the web active state", () => {
    expect(css).toContain(`scale(${designTokens.motion.press.scale.toString().replace(/^0\./, "0.")})`);
  });
});

describe("motion tokens", () => {
  it("springs have positive damping, stiffness and mass", () => {
    for (const [name, s] of Object.entries(designTokens.motion.spring)) {
      expect(s.damping, name).toBeGreaterThan(0);
      expect(s.stiffness, name).toBeGreaterThan(0);
      expect(s.mass, name).toBeGreaterThan(0);
    }
  });

  it("the feed spring is critically damped and the like spring is bouncy", () => {
    const zeta = (s: { damping: number; stiffness: number; mass: number }) =>
      s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
    const { feed, like, snappy, sheet } = designTokens.motion.spring;
    expect(zeta(feed)).toBeGreaterThanOrEqual(0.98);
    expect(zeta(feed)).toBeLessThanOrEqual(1.05);
    expect(zeta(like)).toBeLessThan(0.5);
    expect(zeta(snappy)).toBeLessThan(1);
    expect(zeta(sheet)).toBeLessThan(1);
  });

  it("durations ascend", () => {
    const { instant, fast, base, slow } = designTokens.motion.duration;
    expect([instant, fast, base, slow]).toEqual([90, 160, 240, 360]);
    expect(instant).toBeLessThan(fast);
    expect(fast).toBeLessThan(base);
    expect(base).toBeLessThan(slow);
  });

  it("easings are valid cubic-bezier arrays", () => {
    for (const [name, e] of Object.entries(designTokens.motion.easing)) {
      expect(e, name).toHaveLength(4);
      expect(e[0] >= 0 && e[0] <= 1 && e[2] >= 0 && e[2] <= 1, name).toBe(true);
    }
  });

  it("haptic mapping names are set", () => {
    expect(designTokens.motion.haptic).toEqual({
      like: "impactLight",
      dislike: "impactMedium",
      longPress: "impactHeavy",
      refresh: "selection",
    });
  });
});

describe("design-tokens.json hygiene", () => {
  it("contains no emoji", () => {
    const text = readFileSync(resolve(__dirname, "../design-tokens.json"), "utf8");
    expect(text).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️/u);
  });
});
