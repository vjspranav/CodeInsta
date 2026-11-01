import type { MobileReel } from "@shared/types";
import { isLabReel } from "@shared/validation";

/**
 * Reel columns the apps select. Never the whole `script` jsonb (it carries every scene and is
 * large); only the poster and expiry are projected out of it. `reels` has no `expires_at`
 * column, so it is `script->>expires_at` (null for evergreen reels).
 */
export const REEL_COLUMNS =
  "id,creator_id,title,topic,tags,series,series_index,created_at,video_url,glossary,parent_reel_id,genre,style,poster_url:script->>poster_url,expires_at:script->>expires_at";

export const CREATOR_COLUMNS = "id,display_name,handle,bio,avatar_url";
export const CATEGORY_COLUMNS = "slug,label,description";

type RawReel = Partial<Omit<MobileReel, "tags">> & { tags?: string[] | null };

/**
 * Rows the feed must never contain: lab experiments, rows with no playable video, and news reels
 * whose expiry has passed. A bad row is dropped, never thrown on.
 */
export function usableReels(rows: unknown, now = Date.now()): MobileReel[] {
  if (!Array.isArray(rows)) return [];
  const result: MobileReel[] = [];
  for (const row of rows as RawReel[]) {
    if (!row || typeof row.id !== "string" || typeof row.topic !== "string") continue;
    if (isLabReel({ topic: row.topic })) continue;
    if (typeof row.video_url !== "string" || row.video_url.trim() === "") continue;
    if (row.expires_at) {
      const expires = Date.parse(row.expires_at);
      if (Number.isFinite(expires) && expires <= now) continue;
    }
    result.push({
      ...(row as MobileReel),
      tags: row.tags ?? [],
      poster_url: row.poster_url ?? null,
      glossary: row.glossary ?? null,
      expires_at: row.expires_at ?? null,
    });
  }
  return result;
}
