import { designColors, designTokens } from "@shared/design-tokens";
import * as Haptics from "expo-haptics";

import {
  contrast,
  durations,
  easings,
  haptic,
  springs,
  timings,
  tokens,
} from "./tokens";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

describe("tokens equal the shared design-tokens.json (dark only)", () => {
  it("color is exactly the dark palette", () => {
    expect(tokens.color).toMatchObject(designColors("dark"));
  });

  it("space, radius and layout are the shared numbers", () => {
    expect(tokens.space).toEqual(designTokens.space);
    expect(tokens.radius).toEqual(designTokens.radius);
    expect(tokens.layout).toEqual(designTokens.layout);
  });

  it("type roles carry shared size, weight, letter spacing, and px line height", () => {
    for (const [role, t] of Object.entries(designTokens.type)) {
      const out = tokens.type[role as keyof typeof tokens.type];
      expect(out.fontSize).toBe(t.size);
      expect(out.weight).toBe(t.weight);
      expect(out.letterSpacing).toBe(t.letterSpacing);
      expect(out.lineHeight).toBeCloseTo(t.size * t.lineHeight, 5);
    }
  });

  it("fonts and press scale come from the shared file", () => {
    expect(tokens.font.sans).toBe(designTokens.font.native.sans.ios);
    expect(tokens.font.mono).toBe(designTokens.font.native.mono.ios);
    expect(tokens.press.scale).toBe(designTokens.motion.press.scale);
  });

  it("shadows keep the shared layers", () => {
    expect(tokens.shadow.overlayText.layers).toEqual(designTokens.shadow.overlayText.layers);
  });

  it("plan-named color aliases point at the shared values", () => {
    const c = tokens.color;
    expect(c.paper).toBe(c.bg);
    expect(c.ink).toBe(c.text);
    expect(c.inkMuted).toBe(c.muted);
    expect(c.accentInk).toBe(c.onAccent);
    expect(c.danger).toBe(c.errorText);
  });
});

describe("motion tokens", () => {
  it("springs equal the shared spring configs", () => {
    for (const [name, s] of Object.entries(designTokens.motion.spring)) {
      expect(springs[name as keyof typeof springs]).toEqual(s);
    }
    expect(Object.keys(springs).sort()).toEqual(["feed", "like", "sheet", "snappy"]);
  });

  it("durations equal the shared durations and timings use them", () => {
    expect(durations).toEqual(designTokens.motion.duration);
    for (const [name, ms] of Object.entries(designTokens.motion.duration)) {
      const t = timings[name as keyof typeof timings];
      expect(t.duration).toBe(ms);
      expect(t.easing).toBeDefined();
    }
  });

  it("easings are built from the shared bezier arrays", () => {
    expect(Object.keys(easings).sort()).toEqual(Object.keys(designTokens.motion.easing).sort());
    expect(tokens.motion.easing).toEqual(designTokens.motion.easing);
  });
});

describe("haptic()", () => {
  beforeEach(() => jest.clearAllMocks());

  it("like is a light impact, dislike medium, longPress heavy, refresh a selection tick", () => {
    expect(designTokens.motion.haptic).toEqual({
      like: "impactLight",
      dislike: "impactMedium",
      longPress: "impactHeavy",
      refresh: "selection",
    });
    haptic("like");
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith("light");
    haptic("dislike");
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith("medium");
    haptic("longPress");
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith("heavy");
    haptic("refresh");
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("never throws when the native module fails", async () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error("no vibrator"));
    expect(() => haptic("like")).not.toThrow();
    await Promise.resolve();
  });
});

describe("contrast()", () => {
  it("is 21 for black on white and 1 for identical colors", () => {
    expect(contrast("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrast("#808080", "#808080")).toBeCloseTo(1, 5);
  });

  it("text on bg is AAA (>= 7)", () => {
    expect(contrast(tokens.color.ink, tokens.color.paper)).toBeGreaterThanOrEqual(7);
  });

  it("onAccent on accent is AA (>= 4.5)... or at least large-text AA (>= 3)", () => {
    expect(contrast(tokens.color.accentInk, tokens.color.accent)).toBeGreaterThanOrEqual(3);
  });

  it("muted on bg is AA (>= 4.5)", () => {
    expect(contrast(tokens.color.inkMuted, tokens.color.paper)).toBeGreaterThanOrEqual(4.5);
  });
});
