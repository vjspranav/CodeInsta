export type FeedContext = {
  areas: string[];
  liked: Set<string>;
  fulfilled: Set<string>;
  disliked?: Set<string>;
  now?: number;
};
export type FeedRow = {
  id: string;
  creator_id: string;
  created_at: string;
  topic?: string;
  series?: string | null;
  series_index?: number | null;
  parent_reel_id?: string | null;
  genre?: string | null;
  style?: string | null;
};
const DAY = 86_400_000;

export function scoreFeed<T extends FeedRow>(
  rows: T[],
  seen: Set<string>,
  context: FeedContext,
): Map<string, number> {
  const now = context.now ?? Date.now(),
    maxSeen = new Map<string, number>();
  for (const r of rows)
    if (seen.has(r.id) && r.series && r.series_index != null)
      maxSeen.set(r.series, Math.max(maxSeen.get(r.series) ?? 0, r.series_index));
  const nextPart = new Map<string, string>();
  for (const [series, max] of maxSeen) {
    const next = rows
      .filter((r) => r.series === series && !seen.has(r.id) && (r.series_index ?? 0) > max)
      .sort((a, b) => a.series_index! - b.series_index!)[0];
    if (next) nextPart.set(series, next.id);
  }
  const dislikedRows = rows.filter((r) => context.disliked?.has(r.id) && r.genre);
  const scores = new Map<string, number>();
  for (const r of rows) {
    let score = 0;
    if (r.series && nextPart.get(r.series) === r.id) score += 100;
    if (r.parent_reel_id && context.liked.has(r.parent_reel_id)) score += 60;
    if (context.fulfilled.has(r.id)) score += 80;
    if (context.areas.includes((r.topic ?? "").split("/")[0])) score += 40;
    const age = (now - new Date(r.created_at).getTime()) / DAY;
    score += 20 * Math.min(1, Math.max(0, 1 - age / 14));
    if (!seen.has(r.id) && r.genre) {
      const sameGenre = dislikedRows.filter((d) => d.genre === r.genre);
      if (sameGenre.some((d) => r.style && d.style === r.style)) score -= 60;
      else if (sameGenre.length) score -= 25;
    }
    scores.set(r.id, score);
  }
  return scores;
}

const seriesKey = (r: FeedRow) => (r.series && r.series_index != null ? `${r.creator_id}/${r.series}` : null);
const isPart = (r: FeedRow) => /\/part-\d+$/.test(r.topic ?? "");

/**
 * Unwatched reels of one series always play in series_index order: the series' slots keep their ranked
 * positions but are refilled lowest index first. Parts of one story (topic ending in /part-N) also play
 * back to back, so Part 2 follows Part 1 directly. Owner rule: a later part never shows before an earlier one.
 */
export function seriesInOrder<T extends FeedRow>(list: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const r of list) {
    const k = seriesKey(r);
    if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const g of groups.values()) g.sort((a, b) => a.series_index! - b.series_index!);
  const used = new Map<string, number>();
  const slotted = list.map((r) => {
    const k = seriesKey(r);
    if (!k) return r;
    const i = used.get(k) ?? 0;
    used.set(k, i + 1);
    return groups.get(k)![i];
  });
  const out: T[] = [];
  const placed = new Set<string>();
  for (const r of slotted) {
    if (placed.has(r.id)) continue;
    out.push(r);
    placed.add(r.id);
    const k = seriesKey(r);
    if (!k || !isPart(r)) continue;
    for (const next of groups.get(k)!) {
      if (next.series_index! > r.series_index! && isPart(next) && !placed.has(next.id)) {
        out.push(next);
        placed.add(next.id);
      }
    }
  }
  return out;
}

/** Opening Part N directly: any unwatched earlier parts of the same story play first. */
export function withEarlierParts<T extends FeedRow>(target: T, all: T[], seen: Set<string>): T[] {
  const k = seriesKey(target);
  if (!k || !isPart(target)) return [target];
  const earlier = all
    .filter((r) => seriesKey(r) === k && isPart(r) && r.series_index! < target.series_index! && !seen.has(r.id))
    .sort((a, b) => a.series_index! - b.series_index!);
  return [...earlier, target];
}

export function orderFeed<T extends FeedRow>(
  rows: T[],
  seen: Set<string>,
  context?: FeedContext,
): T[] {
  const mix = (group: T[]) => {
    const sorted = [...group].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
      result: T[] = [];
    while (sorted.length) {
      const index = result.length
        ? sorted.findIndex(
            (r) => r.creator_id !== result[result.length - 1].creator_id,
          )
        : 0;
      result.push(sorted.splice(Math.max(0, index), 1)[0]);
    }
    return result;
  };
  const unseen = rows.filter((r) => !seen.has(r.id)),
    seenRows = mix(rows.filter((r) => seen.has(r.id)));
  if (!context) return [...seriesInOrder(mix(unseen)), ...seenRows];
  const scores = scoreFeed(rows, seen, context),
    remaining = [...unseen].sort(
      (a, b) =>
        scores.get(b.id)! - scores.get(a.id)! ||
        b.created_at.localeCompare(a.created_at),
    ),
    ordered: T[] = [];
  // Every fifth slot is an exploration pick from an area the user did not select.
  const outside = (r: T) => !context.areas.includes((r.topic ?? "").split("/")[0]);
  while (remaining.length) {
    const explore = context.areas.length > 0 && ordered.length % 5 === 4,
      index = explore ? remaining.findIndex(outside) : -1;
    ordered.push(remaining.splice(Math.max(0, index), 1)[0]);
  }
  return [...seriesInOrder(ordered), ...seenRows];
}
