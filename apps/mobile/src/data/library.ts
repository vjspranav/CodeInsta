import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orderFeed } from "@shared/feed";
import type { Category, Creator, MobileReel } from "@shared/types";

import { useAuth } from "@/auth/useAuth";
import { db } from "@/lib/supabase";
import { syncWidgetAfterLoad } from "@/widgets/sync";
import { CATEGORY_COLUMNS, CREATOR_COLUMNS, REEL_COLUMNS, usableReels } from "./queries";

export type Library = {
  reels: MobileReel[];
  creators: Creator[];
  categories: Category[];
  liked: Set<string>;
  disliked: Set<string>;
  seen: Set<string>;
  areas: string[];
  onboarded: boolean;
  fulfilled: Set<string>;
};

export const LIBRARY_KEY = ["library"] as const;

const idSet = (rows: unknown, column: string): Set<string> =>
  new Set(
    ((rows ?? []) as Record<string, unknown>[])
      .map((row) => row[column])
      .filter((value): value is string => typeof value === "string"),
  );

/** The same parallel selects as web `data.tsx`, with the reel list trimmed for the apps. */
export async function fetchLibrary(userId: string): Promise<Library> {
  const [reels, creators, likes, views, interests, requests, categories, dislikes] =
    await Promise.all([
      db
        .from("reels")
        .select(REEL_COLUMNS)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      db.from("creators").select(CREATOR_COLUMNS),
      db.from("likes").select("reel_id").eq("user_id", userId),
      db.from("views").select("reel_id").eq("user_id", userId),
      db.from("user_interests").select("areas, onboarded").eq("user_id", userId).maybeSingle(),
      db
        .from("topic_requests")
        .select("fulfilled_reel_id")
        .eq("user_id", userId)
        .eq("status", "done")
        .not("fulfilled_reel_id", "is", null),
      db.from("categories").select(CATEGORY_COLUMNS).order("label"),
      db.from("dislikes").select("reel_id").eq("user_id", userId),
    ]);
  for (const result of [reels, creators, likes, views, categories, dislikes]) {
    if (result.error) throw new Error("Could not load your library. Try again.");
  }
  // Interests are best-effort: a failed lookup must not lock anyone out of the feed.
  const interestRow = interests.error ? null : (interests.data as { areas?: string[]; onboarded?: boolean } | null);
  return {
    reels: usableReels(reels.data),
    creators: (creators.data ?? []) as unknown as Creator[],
    categories: (categories.data ?? []) as unknown as Category[],
    liked: idSet(likes.data, "reel_id"),
    disliked: idSet(dislikes.data, "reel_id"),
    seen: idSet(views.data, "reel_id"),
    areas: interests.error ? [] : (interestRow?.areas ?? []),
    onboarded: interests.error ? true : Boolean(interestRow?.onboarded),
    // topic_requests is best-effort too, as on web.
    fulfilled: requests.error ? new Set() : idSet(requests.data, "fulfilled_reel_id"),
  };
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((v) => b.has(v));

/**
 * Background refetches return the previous object when nothing changed, so a playing reel and
 * every memoized row keep their identity (no re-render, no player reset on refresh).
 */
export function sameLibrary(a: Library, b: Library): boolean {
  return (
    sameSet(a.liked, b.liked) &&
    sameSet(a.disliked, b.disliked) &&
    sameSet(a.seen, b.seen) &&
    sameSet(a.fulfilled, b.fulfilled) &&
    a.onboarded === b.onboarded &&
    JSON.stringify(a.areas) === JSON.stringify(b.areas) &&
    JSON.stringify(a.reels) === JSON.stringify(b.reels) &&
    JSON.stringify(a.creators) === JSON.stringify(b.creators) &&
    JSON.stringify(a.categories) === JSON.stringify(b.categories)
  );
}

export function useLibrary(): {
  library: Library | null;
  loading: boolean;
  error: string;
  reload(): void;
  markSeenInCache(id: string): void;
} {
  const { user } = useAuth();
  const client = useQueryClient();
  const userId = user?.id ?? "";
  const query = useQuery({
    queryKey: [...LIBRARY_KEY, userId],
    queryFn: async () => {
      const loaded = await fetchLibrary(userId);
      // Best effort: refresh the widget snapshot after each successful load, never fail the feed.
      try {
        void syncWidgetAfterLoad(loaded).catch(() => {});
      } catch {
        // ignore
      }
      return loaded;
    },
    enabled: userId !== "",
    structuralSharing: (previous, next) =>
      previous && sameLibrary(previous as Library, next as Library) ? previous : next,
  });
  const { refetch } = query;
  // Records a successful `views` insert in the cached seen set. The set is updated in place on
  // purpose: the library keeps its identity, so nothing re-renders and the current feed order
  // does not change, while the next refetch (which now includes this view) matches the cache.
  const markSeenInCache = useCallback(
    (id: string) => {
      client.setQueryData<Library>([...LIBRARY_KEY, userId], (old) => {
        if (old && !old.seen.has(id)) old.seen.add(id);
        return old;
      });
    },
    [client, userId],
  );
  return {
    library: query.data ?? null,
    // Only the first load counts; a background refresh never shows a loading state.
    loading: query.isPending && userId !== "",
    error: query.data ? "" : query.error ? "Could not load your library. Try again." : "",
    reload: () => void refetch(),
    markSeenInCache,
  };
}

/** Feed order for a library: the single shared ranking, with series kept in Part order. */
export function buildFeed(library: Library | null): MobileReel[] {
  if (!library) return [];
  return orderFeed(library.reels, library.seen, {
    areas: library.areas,
    liked: library.liked,
    fulfilled: library.fulfilled,
    disliked: library.disliked,
  });
}

export function useFeed(): MobileReel[] {
  const { library } = useLibrary();
  return useMemo(() => buildFeed(library), [library]);
}
