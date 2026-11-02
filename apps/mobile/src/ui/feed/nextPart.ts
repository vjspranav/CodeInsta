export type SeriesReel = {
  id: string;
  creator_id: string;
  series: string | null;
  series_index: number | null;
};

/**
 * Next part of each reel's series: reel id -> the reel with the next higher series_index in the
 * same creator's series. Computed once per library (not per row), like web's feed.tsx. Display
 * only: it never changes the feed order, which always comes from the shared ranking.
 */
export function nextPartMap<T extends SeriesReel>(reels: ReadonlyArray<T>): Map<string, T> {
  const bySeries = new Map<string, T[]>();
  for (const reel of reels) {
    if (!reel.series) continue;
    const key = `${reel.creator_id}\u0000${reel.series}`;
    const list = bySeries.get(key);
    if (list) list.push(reel);
    else bySeries.set(key, [reel]);
  }
  const next = new Map<string, T>();
  for (const list of bySeries.values()) {
    const sorted = [...list].sort((a, b) => (a.series_index ?? 0) - (b.series_index ?? 0));
    for (const reel of sorted) {
      const following = sorted.find((n) => (n.series_index ?? 0) > (reel.series_index ?? 0));
      if (following) next.set(reel.id, following);
    }
  }
  return next;
}
