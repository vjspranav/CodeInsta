import { seriesInOrder } from "@shared/feed";
import type { MobileReel } from "@shared/types";

/**
 * One creator's reels, newest first, with every series in order (owner rule: a later part never shows
 * before an earlier one). Profile stats (reel count) are derived from this list; there is no extra query.
 */
export function creatorReels(library: { reels: MobileReel[] }, creatorId: string): MobileReel[] {
  const own = library.reels
    .filter((reel) => reel.creator_id === creatorId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return seriesInOrder(own);
}
