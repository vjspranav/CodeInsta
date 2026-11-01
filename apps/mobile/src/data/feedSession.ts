import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orderFeed, withEarlierParts } from "@shared/feed";
import type { MobileReel } from "@shared/types";

import { db } from "@/lib/supabase";
import { haptic } from "@/theme/tokens";

import { currentUserId } from "./asks";
import { useLibrary, type Library } from "./library";

export type HapticKind = "like" | "dislike";
export type FeedSessionOptions = {
  /** Injected so the module stays testable; defaults to the token haptics. */
  onHaptic?: (kind: HapticKind) => void;
};

const DUPLICATE = "23505";
const LIKE_FAILED = "Could not save your like. Try again.";
const DISLIKE_WAIT = "Please wait for your previous change.";
const DISLIKE_FAILED = "Could not save your preference. Try again.";

/**
 * The feed order for this session. With `entryReelId` (deep link), the target and any unseen
 * earlier parts of its story lead the list, then everything else without duplicates.
 */
export function buildItems(library: Library | null, entryReelId?: string): MobileReel[] {
  if (!library) return [];
  const ordered = orderFeed(library.reels, library.seen, {
    areas: library.areas,
    liked: library.liked,
    fulfilled: library.fulfilled,
    disliked: library.disliked,
  });
  const target = entryReelId ? library.reels.find((r) => r.id === entryReelId) : undefined;
  if (!target) return ordered;
  const lead = withEarlierParts(target, library.reels, library.seen);
  const leadIds = new Set(lead.map((r) => r.id));
  return [...lead, ...ordered.filter((r) => !leadIds.has(r.id))];
}

/** Library set with in-flight optimistic changes (id -> wanted membership) applied on top. */
function withPending(base: Set<string>, pending: Map<string, boolean>): Set<string> {
  const next = new Set(base);
  for (const [id, wanted] of pending) {
    if (wanted) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function useFeedSession(entryReelId?: string, options: FeedSessionOptions = {}) {
  const { library } = useLibrary();
  const onHaptic$ = useRef(options.onHaptic ?? haptic);
  onHaptic$.current = options.onHaptic ?? haptic;

  const likePending = useRef(new Map<string, boolean>());
  const dislikePending = useRef(new Map<string, boolean>());
  const seenInFlight = useRef(new Set<string>());
  const userId$ = useRef("");

  const [liked, setLiked] = useState(() => new Set(library?.liked));
  const [disliked, setDisliked] = useState(() => new Set(library?.disliked));
  const [seen, setSeen] = useState(() => new Set(library?.seen));
  const liked$ = useRef(liked);
  const disliked$ = useRef(disliked);
  const seen$ = useRef(seen);
  const [error, setError] = useState("");
  const [streak, setStreak] = useState(0);

  const commitLiked = useCallback((next: Set<string>) => {
    liked$.current = next;
    setLiked(next);
  }, []);
  const commitDisliked = useCallback((next: Set<string>) => {
    disliked$.current = next;
    setDisliked(next);
  }, []);
  const commitSeen = useCallback((next: Set<string>) => {
    seen$.current = next;
    setSeen(next);
  }, []);

  // A fresh library (first load, background refresh) replaces the sets in the same render, so
  // no frame shows stale reactions. Changes still in flight are laid back on top.
  const [syncedLibrary, setSyncedLibrary] = useState(library);
  if (syncedLibrary !== library) {
    setSyncedLibrary(library);
    if (library) {
      commitLiked(withPending(library.liked, likePending.current));
      commitDisliked(withPending(library.disliked, dislikePending.current));
      commitSeen(new Set([...library.seen, ...seen$.current]));
    }
  }

  // The order is computed once per library and never from live `seen`, so marking a reel seen
  // can never reshuffle the pager under the user.
  const items = useMemo(() => buildItems(library, entryReelId), [library, entryReelId]);

  const userId = useCallback(async () => {
    if (!userId$.current) userId$.current = await currentUserId();
    return userId$.current;
  }, []);

  const like = useCallback(
    async (id: string, onlyLike = false): Promise<void> => {
      const had = liked$.current.has(id);
      if (onlyLike && had) return;
      if (likePending.current.has(id)) return;
      likePending.current.set(id, !had);
      // Optimistic: state and haptic land before the network is touched.
      setError("");
      const apply = (selected: boolean) => {
        const next = new Set(liked$.current);
        if (selected) next.add(id);
        else next.delete(id);
        commitLiked(next);
      };
      apply(!had);
      onHaptic$.current("like");
      try {
        const uid = await userId();
        const table = db.from("likes");
        const { error: failure } = had
          ? await table.delete().eq("user_id", uid).eq("reel_id", id)
          : await table.insert({ user_id: uid, reel_id: id });
        if (failure && failure.code !== DUPLICATE) throw failure;
      } catch {
        apply(had);
        setError(LIKE_FAILED);
      } finally {
        likePending.current.delete(id);
      }
    },
    [commitLiked, userId],
  );

  const dislike = useCallback(
    async (id: string): Promise<string> => {
      if (dislikePending.current.has(id)) return DISLIKE_WAIT;
      const remove = disliked$.current.has(id);
      dislikePending.current.set(id, !remove);
      const apply = (selected: boolean) => {
        const next = new Set(disliked$.current);
        if (selected) next.add(id);
        else next.delete(id);
        commitDisliked(next);
      };
      apply(!remove);
      onHaptic$.current("dislike");
      try {
        const uid = await userId();
        const table = db.from("dislikes");
        const { error: failure } = remove
          ? await table.delete().eq("user_id", uid).eq("reel_id", id)
          : await table.insert({ user_id: uid, reel_id: id });
        if (failure && failure.code !== DUPLICATE) throw failure;
        return "";
      } catch {
        apply(remove);
        return DISLIKE_FAILED;
      } finally {
        dislikePending.current.delete(id);
      }
    },
    [commitDisliked, userId],
  );

  const mounted = useRef(true);
  const streakRequest = useRef(0);
  const refreshStreak = useCallback(async () => {
    const request = ++streakRequest.current;
    let value = 0;
    try {
      const { data, error: failure } = await db.rpc("learning_streak", {
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!failure && typeof data === "number" && Number.isFinite(data)) value = Math.max(0, data);
    } catch {
      value = 0;
    }
    if (mounted.current && request === streakRequest.current) setStreak(value);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refreshStreak();
    return () => {
      mounted.current = false;
    };
  }, [refreshStreak]);

  const markSeen = useCallback(
    async (id: string): Promise<void> => {
      if (seen$.current.has(id) || seenInFlight.current.has(id)) return;
      seenInFlight.current.add(id);
      try {
        const uid = await userId();
        const { error: failure } = await db.from("views").insert({ user_id: uid, reel_id: id });
        if (failure && failure.code !== DUPLICATE) return;
        commitSeen(new Set(seen$.current).add(id));
        void refreshStreak();
      } catch {
        // Offline or signed out: the next visit to this reel tries again.
      } finally {
        seenInFlight.current.delete(id);
      }
    },
    [commitSeen, refreshStreak, userId],
  );

  return { items, liked, disliked, seen, like, dislike, markSeen, streak, error };
}
