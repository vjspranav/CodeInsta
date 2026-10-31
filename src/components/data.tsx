"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { browserDb } from "@/lib/supabase/browser";
import { validateReel, type Reel } from "@/lib/reel-schema";
import type { AudioJson } from "@/lib/reel-audio";
export type Creator = {
  id: string;
  display_name: string;
  handle: string;
  bio: string;
  avatar_url: string | null;
};
export type ReelRow = {
  id: string;
  creator_id: string;
  title: string;
  topic: string;
  tags: string[];
  series: string | null;
  series_index: number | null;
  created_at: string;
  script: Reel;
  audio: AudioJson | null;
  parent_reel_id?: string | null;
};
/** Format Lab experiments (topic lab/…) are kept out of every public list. */
export const DAILY_ASKS = 3;
export const isLabReel = (reel: { topic: string }) => reel.topic.startsWith("lab/");
type Data = {
  isOwner: boolean;
  reels: ReelRow[];
  labReels: ReelRow[];
  creators: Creator[];
  liked: Set<string>;
  seen: Set<string>;
  userId: string;
  areas: string[];
  fulfilled: Set<string>;
  /** Questions a member can still ask today (rolling 24h); null for the owner (unlimited). */
  asksLeft: number | null;
  noteAsked: () => void;
  saveInterests: (areas: string[]) => Promise<string>;
  loading: boolean;
  error: string;
  reload: () => void;
  like: (id: string, onlyLike?: boolean) => Promise<void>;
  view: (id: string) => Promise<void>;
};
const Context = createContext<Data | null>(null);
export function DataProvider({ children, isOwner }: { children: React.ReactNode; isOwner: boolean }) {
  const path = usePathname(),
    router = useRouter();
  const isPublic = ["/login", "/join", "/not-invited", "/auth/callback", "/auth/google", "/auth/google/nonce", "/privacy"].includes(path);
  const [allReels, setReels] = useState<ReelRow[]>([]),
    [creators, setCreators] = useState<Creator[]>([]);
  const [liked, setLiked] = useState(new Set<string>()),
    [seen, setSeen] = useState(new Set<string>());
  const [areas, setAreas] = useState<string[]>([]),
    [onboarded, setOnboarded] = useState<boolean | null>(null),
    [fulfilled, setFulfilled] = useState(new Set<string>()),
    [asked, setAsked] = useState(0);
  const reels = useMemo(() => allReels.filter((r) => !isLabReel(r)), [allReels]),
    labReels = useMemo(() => allReels.filter(isLabReel), [allReels]);
  const [userId, setUserId] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  // The provider lives in the root layout, so it survives tab switches. Data is fetched once,
  // then only on explicit actions (reload) or when the tab regains focus after 5 minutes.
  const liked$ = useRef(liked),
    seen$ = useRef(seen),
    user$ = useRef(userId),
    loadedAt = useRef(0),
    inFlight = useRef(false),
    signatures = useRef(new Map<string, { sig: string; row: ReelRow }>());
  liked$.current = liked;
  seen$.current = seen;
  user$.current = userId;
  const load = useCallback(async (silent: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const db = browserDb();
      const {
        data: { user },
        error: authError,
      } = await db.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again.");
      setUserId(user.id);
      const results = await Promise.all([
        db.from("reels").select("*").order("created_at", { ascending: false }),
        db.from("creators").select("*"),
        db.from("likes").select("reel_id"),
        db.from("views").select("reel_id"),
        db.from("user_interests").select("areas, onboarded").eq("user_id", user.id).maybeSingle(),
        db
          .from("topic_requests")
          .select("fulfilled_reel_id")
          .eq("user_id", user.id)
          .eq("status", "done")
          .not("fulfilled_reel_id", "is", null),
        db
          .from("feedback")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
      ]);
      // Best-effort: the DB trigger is the real limit; this only drives the counter.
      if (!results[6].error) setAsked(results[6].count ?? 0);
      for (const result of results.slice(0, 4)) if (result.error) throw result.error;
      // Interests are best-effort: a failed lookup must not lock anyone out of the feed.
      const interests = results[4].error ? undefined : results[4].data;
      setAreas(interests?.areas ?? []);
      setOnboarded(results[4].error ? true : Boolean(interests?.onboarded));
      setFulfilled(
        new Set(
          (results[5].data ?? []).map(
            (row: { fulfilled_reel_id: string }) => row.fulfilled_reel_id,
          ),
        ),
      );
      // Reuse unchanged row objects so a background refresh never resets a playing reel.
      const known = signatures.current,
        fresh = new Map<string, { sig: string; row: ReelRow }>();
      const rows = (results[0].data ?? []).flatMap((row: ReelRow) => {
        const sig = JSON.stringify(row),
          hit = known.get(row.id);
        if (hit?.sig === sig) {
          fresh.set(row.id, hit);
          return [hit.row];
        }
        const valid = validateReel(row.script);
        if (!valid.ok) return [];
        const next = { ...row, script: valid.reel } as ReelRow;
        fresh.set(row.id, { sig, row: next });
        return [next];
      });
      signatures.current = fresh;
      setReels(rows);
      setCreators(results[1].data as Creator[]);
      setLiked(
        new Set(
          results[2].data?.map((row: { reel_id: string }) => row.reel_id),
        ),
      );
      setSeen(
        new Set(
          results[3].data?.map((row: { reel_id: string }) => row.reel_id),
        ),
      );
      loadedAt.current = Date.now();
    } catch (e) {
      if (!silent)
        setError(
          e instanceof Error
            ? e.message
            : "Could not load your library. Try again.",
        );
    } finally {
      inFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, []);
  const reload = useCallback(() => void load(false), [load]);
  useEffect(() => {
    // Visiting a public page (sign-in/out) invalidates the cache so the next user reloads.
    if (isPublic) loadedAt.current = 0;
    else if (!loadedAt.current) void load(false);
  }, [isPublic, load]);
  useEffect(() => {
    if (isPublic) return;
    const refresh = () => {
      if (!document.hidden && loadedAt.current && Date.now() - loadedAt.current > 5 * 60_000)
        void load(true);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [isPublic, load]);
  useEffect(() => {
    if (!isPublic && !loading && onboarded === false && path !== "/onboarding")
      router.replace("/onboarding");
  }, [isPublic, loading, onboarded, path, router]);
  const saveInterests = useCallback(async (next: string[]) => {
    const { error } = await browserDb()
      .from("user_interests")
      .upsert({ user_id: user$.current, areas: next, onboarded: true }, { onConflict: "user_id" });
    if (error) return "Could not save your interests. Try again.";
    setAreas(next);
    setOnboarded(true);
    return "";
  }, []);
  const like = useCallback(async (id: string, onlyLike = false) => {
    const liked = liked$.current;
    if (onlyLike && liked.has(id)) return;
    const remove = liked.has(id),
      db = browserDb();
    const { error } = remove
      ? await db.from("likes").delete().eq("user_id", user$.current).eq("reel_id", id)
      : await db.from("likes").insert({ user_id: user$.current, reel_id: id });
    if (error && error.code !== "23505") {
      setError("Could not save your like. Try again.");
      return;
    }
    setLiked((previous) => {
      const next = new Set(previous);
      if (remove) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const view = useCallback(async (id: string) => {
    if (seen$.current.has(id)) return;
    const { error } = await browserDb()
      .from("views")
      .insert({ user_id: user$.current, reel_id: id });
    if (!error || error.code === "23505")
      setSeen((previous) => new Set(previous).add(id));
  }, []);
  const noteAsked = useCallback(() => setAsked((n) => n + 1), []);
  const asksLeft = isOwner ? null : Math.max(0, DAILY_ASKS - asked);
  const value = useMemo(
    () => ({
      isOwner,
      reels,
      labReels,
      creators,
      liked,
      seen,
      userId,
      areas,
      fulfilled,
      asksLeft,
      noteAsked,
      saveInterests,
      loading,
      error,
      reload,
      like,
      view,
    }),
    [isOwner, reels, labReels, creators, liked, seen, userId, areas, fulfilled, asksLeft, noteAsked, saveInterests, loading, error, reload, like, view],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useData() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing DataProvider");
  return value;
}
export function LoadState() {
  const { loading, error, reload } = useData();
  return (
    <div className="empty" role="status">
      {loading ? (
        <>
          <div className="loader" />
          <p>Loading your next idea…</p>
        </>
      ) : error ? (
        <>
          <p>{error}</p>
          <button onClick={reload}>Try again</button>
        </>
      ) : (
        <>
          <h2>Your next idea is on its way.</h2>
          <p>New reels from Claude and GPT will appear here.</p>
        </>
      )}
    </div>
  );
}
export function Avatar({ creator }: { creator?: Creator }) {
  return (
    <span className={`avatar ${creator?.id === "claude" ? "claude" : "gpt"}`}>
      {creator?.avatar_url ? (
        <Image
          unoptimized
          width={34}
          height={34}
          src={creator.avatar_url}
          alt=""
        />
      ) : creator?.id === "claude" ? (
        "✳"
      ) : (
        "⌘"
      )}
    </span>
  );
}
