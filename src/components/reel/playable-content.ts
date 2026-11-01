import { validateReel, type Reel } from "../../lib/reel-schema";

export { isLabReel } from "../../../packages/shared/src/validation";

/** Video reels do not need a legacy script. Never feed v3 beats into the live timeline. */
export function playableContent(
  script: unknown,
  videoUrl?: string | null,
): { script: Reel | null; poster_url?: string | null } | null {
  const valid = validateReel(script);
  if (valid.ok) return { script: valid.reel };
  if (!videoUrl) return null;
  // v3 publishes store a poster frame in the script; keep only that URL.
  const poster = (script as { poster_url?: unknown } | null)?.poster_url;
  return typeof poster === "string" && /^https:\/\//.test(poster) ? { script: null, poster_url: poster } : { script: null };
}
