import type { Category, MobileReel } from "@shared/types";

/** The slice of `Library` (Task 2.6) that Explore needs; a full `Library` satisfies it. */
export type ExploreSource = { reels: MobileReel[]; categories: Category[] };

export type ExploreSection = { category: Category; reels: MobileReel[] };

const newestFirst = (a: MobileReel, b: MobileReel) => b.created_at.localeCompare(a.created_at);

/** Web parity: a reel belongs to the category named by the first segment of its topic. */
export const categorySlug = (reel: { topic: string }) => reel.topic.split("/")[0];

/** Reels grouped per category (category order as given, reels newest first); empty categories are omitted. */
export function exploreSections(library: ExploreSource): ExploreSection[] {
  const bySlug = new Map<string, MobileReel[]>();
  for (const reel of library.reels) {
    const slug = categorySlug(reel);
    const list = bySlug.get(slug);
    if (list) list.push(reel);
    else bySlug.set(slug, [reel]);
  }
  return library.categories.flatMap((category) => {
    const reels = bySlug.get(category.slug);
    return reels?.length ? [{ category, reels: [...reels].sort(newestFirst) }] : [];
  });
}

/** Case-insensitive substring search over title, tags and topic. The query is text, never a pattern. */
export function searchReels(library: Pick<ExploreSource, "reels">, query: string): MobileReel[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return library.reels
    .filter(
      (reel) =>
        reel.title.toLowerCase().includes(needle) ||
        reel.topic.toLowerCase().includes(needle) ||
        reel.tags.some((tag) => tag.toLowerCase().includes(needle)),
    )
    .sort(newestFirst);
}
