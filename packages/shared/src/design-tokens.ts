import json from "../design-tokens.json";

/** One design-token source for web and the mobile apps. Values mirror src/app/globals.css. */
export const designTokens = json;
export type DesignTokens = typeof json;
export type DesignTheme = "light" | "dark";
export type DesignColorName = keyof DesignTokens["color"]["dark"];
export type DesignTypeRole = keyof DesignTokens["type"];
export type DesignSpringName = keyof DesignTokens["motion"]["spring"];
export type DesignDurationName = keyof DesignTokens["motion"]["duration"];
export type DesignEasingName = keyof DesignTokens["motion"]["easing"];
export type DesignHapticName = keyof DesignTokens["motion"]["haptic"];
export type CubicBezier = [number, number, number, number];
export type SpringConfig = { damping: number; stiffness: number; mass: number; overshootClamping: boolean };

/** Colors for a theme (hex strings). */
export function designColors(theme: DesignTheme): Record<DesignColorName, string> {
  return designTokens.color[theme];
}

/** CSS custom properties (name to value) for a theme, limited to colors that have a web variable. */
export function cssVariables(theme: DesignTheme): Record<string, string> {
  const colors = designTokens.color[theme] as Record<string, string>;
  const vars = designTokens.color.cssVar as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [name, cssName] of Object.entries(vars)) out[cssName] = colors[name];
  return out;
}

export const designEasing = (name: DesignEasingName): CubicBezier => designTokens.motion.easing[name] as CubicBezier;
export const designSpring = (name: DesignSpringName): SpringConfig => designTokens.motion.spring[name];
