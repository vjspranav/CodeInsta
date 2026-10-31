"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
    initialized = useRef("");
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
  const finish = (id: string, index: number) => {
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
          `codeinsta-learning-${userId}`,
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
  };
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
            {ordered.map((reel, i) => {
              const next = reel.series
                ? reels
                    .filter(
                      (r) =>
                        r.creator_id === reel.creator_id &&
                        r.series === reel.series &&
                        (r.series_index ?? 0) > (reel.series_index ?? 0),
                    )
                    .sort(
                      (a, b) => (a.series_index ?? 0) - (b.series_index ?? 0),
                    )[0]
                : undefined;
              return (
                <div className="reel-slot" key={reel.id} data-reel={reel.id}>
                  <Player
                    reel={reel}
                    next={next}
                    active={active === reel.id}
                    audio={audio}
                    unlocked={unlocked}
                    muted={muted}
                    unlock={unlock}
                    toggleMute={() => {
                      if (muted && !unlocked) unlock();
                      setMuted((v) => !v);
                    }}
                    finish={() => finish(reel.id, i)}
                    audioBlocked={() => setUnlocked(false)}
                  />
                </div>
              );
            })}
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
