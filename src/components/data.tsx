"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
    [fulfilled, setFulfilled] = useState(new Set<string>());
  const reels = useMemo(() => allReels.filter((r) => !isLabReel(r)), [allReels]),
    labReels = useMemo(() => allReels.filter(isLabReel), [allReels]);
  const [userId, setUserId] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
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
      ]);
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
      setReels(
        (results[0].data ?? []).flatMap((row: ReelRow) => {
          const valid = validateReel(row.script);
          return valid.ok ? [{ ...row, script: valid.reel } as ReelRow] : [];
        }),
      );
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
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load your library. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!isPublic) void reload();
  }, [isPublic, reload]);
  useEffect(() => {
    if (!isPublic && !loading && onboarded === false && path !== "/onboarding")
      router.replace("/onboarding");
  }, [isPublic, loading, onboarded, path, router]);
  const saveInterests = async (next: string[]) => {
    const { error } = await browserDb()
      .from("user_interests")
      .upsert({ user_id: userId, areas: next, onboarded: true }, { onConflict: "user_id" });
    if (error) return "Could not save your interests. Try again.";
    setAreas(next);
    setOnboarded(true);
    return "";
  };
  const like = async (id: string, onlyLike = false) => {
    if (onlyLike && liked.has(id)) return;
    const remove = liked.has(id),
      db = browserDb();
    const { error } = remove
      ? await db.from("likes").delete().eq("user_id", userId).eq("reel_id", id)
      : await db.from("likes").insert({ user_id: userId, reel_id: id });
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
  };
  const view = async (id: string) => {
    if (seen.has(id)) return;
    const { error } = await browserDb()
      .from("views")
      .insert({ user_id: userId, reel_id: id });
    if (!error || error.code === "23505")
      setSeen((previous) => new Set(previous).add(id));
  };
  return (
    <Context.Provider
      value={{
        isOwner,
        reels,
        labReels,
        creators,
        liked,
        seen,
        userId,
        areas,
        fulfilled,
        saveInterests,
        loading,
        error,
        reload,
        like,
        view,
      }}
    >
      {children}
    </Context.Provider>
  );
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
