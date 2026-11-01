/** Pure helpers for the agent inbox route (kept free of "@/" imports so they are unit-testable). */

/** Categories seeded by migration 0007. Assignment positions only count categories created after these. */
export const SEED_CATEGORY_SLUGS = [
  "aosp",
  "os",
  "compilers",
  "distributed",
  "networking",
  "databases",
  "linkers",
  "virtualization",
  "architecture",
] as const;

export type CategoryRow = { slug: string; label: string; description: string; created_at: string };
export type AssignedCategory = CategoryRow & { position: number; assigned_creator: "claude" | "gpt" };

/**
 * Stable creator assignment for non-seed categories: position among ALL of them ordered by (created_at, slug),
 * even -> claude, odd -> gpt. Computed over every such category (with or without reels) so a category receiving
 * its first reel never shifts the others.
 */
export function assignCategories(all: CategoryRow[], seeds: readonly string[] = SEED_CATEGORY_SLUGS): AssignedCategory[] {
  const seedSet = new Set(seeds);
  return all
    .filter((c) => !seedSet.has(c.slug))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.slug < b.slug ? -1 : 1))
    .map((c, position) => ({ ...c, position, assigned_creator: position % 2 === 0 ? ("claude" as const) : ("gpt" as const) }));
}

/** Only categories that have no reels yet. */
export function categoriesWithoutReels(assigned: AssignedCategory[], topics: string[]): AssignedCategory[] {
  return assigned.filter((c) => !topics.some((t) => t.startsWith(`${c.slug}/`)));
}

type DbError = { code?: string; message?: string } | null | undefined;

/**
 * True only when the error says the table/column/relationship genuinely does not exist (migration not applied).
 * Everything else (timeouts, permissions, bad filters) must surface.
 */
export function isMissingSchema(error: DbError): boolean {
  if (!error) return false;
  if (error.code && ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error.code)) return true;
  return /(relation|column|table) .*does not exist|could not find (the|a) .*(column|table|relationship)/i.test(error.message ?? "");
}

/** Lab/example topics never feed creator planning. */
export const LAB_PREFIXES = ["lab/", "lab-v3/"] as const;
export const isLabTopic = (topic: string | null | undefined) => !!topic && LAB_PREFIXES.some((p) => topic.startsWith(p));
