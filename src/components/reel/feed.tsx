"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { useData, LoadState, type ReelRow } from "../data";
import { Player } from "./player";
import { orderFeed } from "./timeline";
type Learning = { day: string; streak: number; ids: string[] };
const dateKey = () => new Date().toLocaleDateString("en-CA");
export function Feed({ reelId }: { reelId?: string }) {
  const { reels, seen, loading, error, userId, areas, liked, fulfilled } = useData();
  const [ordered, setOrdered] = useState<ReelRow[]>([]),
    [active, setActive] = useState(""),
    [unlocked, setUnlocked] = useState(false),
    [muted, setMuted] = useState(false),
    [audio, setAudio] = useState<HTMLAudioElement | null>(null),
    [learning, setLearning] = useState<Learning>({
      day: "",
      streak: 0,
      ids: [],
    });
  const root = useRef<HTMLDivElement>(null),
    initialized = useRef(""),
    unlocked$ = useRef(false),
    userId$ = useRef(userId);
  unlocked$.current = unlocked;
  userId$.current = userId;
  // Next part of each series, computed once instead of per reel per render.
  const nextByReel = useMemo(() => {
    const bySeries = new Map<string, ReelRow[]>();
    for (const r of reels)
      if (r.series) {
        const key = `${r.creator_id}\u0000${r.series}`;
        (bySeries.get(key) ?? bySeries.set(key, []).get(key)!).push(r);
      }
    const map = new Map<string, ReelRow>();
    for (const list of bySeries.values()) {
      list.sort((a, b) => (a.series_index ?? 0) - (b.series_index ?? 0));
      for (const r of list) {
        const next = list.find((n) => (n.series_index ?? 0) > (r.series_index ?? 0));
        if (next) map.set(r.id, next);
      }
    }
    return map;
  }, [reels]);
  // Only the active reel +-1 mounts a Player; the rest are same-height placeholders.
  const [center, setCenter] = useState(0);
  useEffect(() => {
    const i = ordered.findIndex((r) => r.id === active);
    if (i >= 0) setCenter(i);
  }, [active, ordered]);
  useEffect(() => {
    if (loading || !reels.length || initialized.current === (reelId ?? "feed"))
      return;
    initialized.current = reelId ?? "feed";
    const list = reelId
      ? reels.filter((r) => r.id === reelId)
      : orderFeed(reels, seen, { areas, liked, fulfilled });
    setOrdered(list);
    setActive(list[0]?.id ?? "");
  }, [loading, reels, seen, reelId, areas, liked, fulfilled]);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`codeinsta-learning-${userId}`) ?? "null",
      ) as Learning | null;
      if (
        saved &&
        typeof saved.day === "string" &&
        Number.isFinite(saved.streak) &&
        Array.isArray(saved.ids)
      )
        setLearning(saved);
    } catch {}
  }, [userId]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.6)
            setActive((entry.target as HTMLElement).dataset.reel!);
          else
            setActive((current) =>
              current === (entry.target as HTMLElement).dataset.reel
                ? ""
                : current,
            );
        }
      },
      { root: root.current, threshold: [0, 0.6] },
    );
    root.current
      ?.querySelectorAll("[data-reel]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ordered]);
  const unlock = useCallback(() => {
    // Reuse this exact media element across every scene/reel: iOS unlock is per element.
    if (audio?.src)
      void audio.play().catch((error: DOMException) => {
        if (error.name === "NotAllowedError") setUnlocked(false);
      });
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
    setUnlocked(true);
  }, [audio]);
  const finish = useCallback((id: string, index: number) => {
    setLearning((previous) => {
      const today = dateKey(),
        yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const sameDay = previous.day === today;
      const updated = {
        day: today,
        streak: sameDay
          ? previous.streak
          : previous.day === yesterday.toLocaleDateString("en-CA")
            ? previous.streak + 1
            : 1,
        ids: Array.from(new Set([...(sameDay ? previous.ids : []), id])),
      };
      try {
        localStorage.setItem(
          `codeinsta-learning-${userId$.current}`,
          JSON.stringify(updated),
        );
      } catch {}
      return updated;
    });
    const node = root.current?.children[index + 1];
    if (node instanceof HTMLElement)
      node.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }, []);
  const toggleMute = useCallback(() => {
    if (!unlocked$.current) unlock();
    setMuted((v) => !v);
  }, [unlock]);
  const audioBlocked = useCallback(() => setUnlocked(false), []);
  return (
    <main
      className="feed-page"
      onClickCapture={() => {
        if (!unlocked) unlock();
      }}
    >
      <header className="feed-header">
        <strong>
          codeinsta<span> / {reelId ? "reel" : "for you"}</span>
        </strong>
        <div title="Completed concepts on this device">
          <Flame size={16} />
          {learning.day === dateKey() ? learning.streak : 0}
          <span>
            {learning.day === dateKey() ? learning.ids.length : 0} learned today
          </span>
        </div>
      </header>
      <audio ref={setAudio} preload="auto" onError={() => setUnlocked(false)} />
      {loading || (!ordered.length && !reelId) ? (
        <LoadState />
      ) : !ordered.length ? (
        <div className="empty">This reel is not available.</div>
      ) : (
        <>
          <div ref={root} className="feed-scroll">
            {ordered.map((reel, i) => (
              <div className="reel-slot" key={reel.id} data-reel={reel.id}>
                {Math.abs(i - center) <= 1 ? (
                  <Player
                    reel={reel}
                    next={nextByReel.get(reel.id)}
                    active={active === reel.id}
                    audio={audio}
                    unlocked={unlocked}
                    muted={muted}
                    unlock={unlock}
                    toggleMute={toggleMute}
                    slot={i}
                    finish={finish}
                    audioBlocked={audioBlocked}
                  />
                ) : (
                  <div className="reel-placeholder" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
          {error && (
            <p className="toast" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </main>
  );
}
