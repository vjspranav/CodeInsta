import type { TextStyle } from "react-native";
import { tokens } from "@/theme/tokens";
import type { DesignTypeRole } from "@shared/design-tokens";

/** Text style for a token type role. */
export function textStyle(role: DesignTypeRole): TextStyle {
  const t = tokens.type[role];
  return {
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    fontWeight: t.fontWeight,
    letterSpacing: t.letterSpacing,
  };
}

const shadow = tokens.shadow.overlayText.layers[0];

/** Legibility shadow for text floating over video (the shared overlayText token). */
export const overlayTextShadow: TextStyle = {
  textShadowColor: shadow.color,
  textShadowOffset: { width: shadow.x, height: shadow.y },
  textShadowRadius: shadow.blur,
};
