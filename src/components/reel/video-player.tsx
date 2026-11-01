"use client";
import { useEffect, useRef, useState } from "react";
import { Heart, Play } from "lucide-react";
import { motion } from "framer-motion";
import { useData } from "../data";
import { ReelOverlay } from "./overlay";
import type { PlayerProps } from "./player";
import { syncVideoPlayback } from "./video-playback";

export function VideoPlayer(props: PlayerProps) {
  const { reel, active, unlocked, muted, unlock, toggleMute, finish, slot, audioBlocked } = props;
  const { like, view } = useData();
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false), [hidden, setHidden] = useState(false),
    [sheet, setSheet] = useState(false), [done, setDone] = useState(false),
    [progress, setProgress] = useState(0), [burst, setBurst] = useState(0),
    [error, setError] = useState("");
  const tap = useRef<ReturnType<typeof setTimeout> | null>(null), lastTap = useRef(0),
    watched = useRef(0), lastTime = useRef(0), viewed = useRef(false);
  const running = active && !paused && !hidden && !sheet && !done;
  useEffect(() => {
    const change = () => setHidden(document.hidden);
    change();
    document.addEventListener("visibilitychange", change);
    return () => { document.removeEventListener("visibilitychange", change); if (tap.current) clearTimeout(tap.current); };
  }, []);
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    return syncVideoPlayback(media, { running, unlocked, muted }, audioBlocked, () => setError("Video could not play. Tap to retry."));
  }, [running, unlocked, muted, audioBlocked]);
  // Call play inside the actual gesture as well as the effect: Safari unlocks each element.
  const enableSound = () => {
    const media = video.current;
    if (media) {
      media.muted = false;
      if (running) void media.play().catch((error: DOMException) => {
        if (error.name === "NotAllowedError") audioBlocked();
      });
    }
    unlock();
  };
  const toggle = () => {
    const media = video.current;
    if (!media) return;
    if (error) {
      setError(""); media.load(); setPaused(false);
      void media.play().catch(() => setError("Video could not play. Tap to retry."));
      return;
    }
    if (done) {
      media.currentTime = 0; lastTime.current = 0; setDone(false); setPaused(false);
    } else setPaused((value) => !value);
  };
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (tap.current) clearTimeout(tap.current);
      lastTap.current = 0;
      void like(reel.id, true); setBurst((value) => value + 1);
      return;
    }
    lastTap.current = now;
    if (!unlocked) { enableSound(); return; }
    tap.current = setTimeout(toggle, 300);
  };
  return (
    <article className="reel video-reel" aria-label={reel.title}>
      <div className="video-frame">
      <div className="progress" role="progressbar" aria-label="Reel progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span><i style={{ width: `${progress}%` }} /></span>
      </div>
      <div className="stage-tap" role="button" tabIndex={active ? 0 : -1}
        aria-label={paused || done ? "Play reel" : "Pause reel. Double tap to like."}
        onClick={onTap} onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault(); if (!unlocked) enableSound(); else toggle();
          }
        }}>
        <video data-active={active} ref={video} src={reel.video_url!} poster={reel.poster_url ?? undefined} playsInline preload="metadata" muted={!unlocked || muted}
          onTimeUpdate={(event) => {
            const media = event.currentTarget;
            setProgress(Number.isFinite(media.duration) && media.duration > 0 ? Math.min(100, media.currentTime / media.duration * 100) : 0);
            if (running && !media.paused) watched.current += Math.max(0, Math.min(1, media.currentTime - lastTime.current));
            lastTime.current = media.currentTime;
            if (!viewed.current && watched.current >= 3) { viewed.current = true; void view(reel.id); }
          }}
          onEnded={() => { if (!done) { setDone(true); finish(reel.id, slot); } }}
          onError={() => setError("Video could not load. Tap to retry.")}
        />
        {(paused || done) && <span className="pause-indicator"><Play fill="currentColor" /></span>}
        {error && <p className="video-error" role="alert">{error}</p>}
        {burst > 0 && <motion.span key={burst} className="heart-burst" initial={{ opacity: 1, scale: 0.4 }} animate={{ opacity: 0, scale: 1.5 }} transition={{ duration: 0.7 }}><Heart size={100} fill="currentColor" /></motion.span>}
      </div>
      <ReelOverlay {...props} {...{ paused, done, sheet, setSheet, toggle }} video unlock={enableSound}
        toggleMute={() => { if (!unlocked) enableSound(); else { if (muted) enableSound(); toggleMute(); } }} />
      </div>
    </article>
  );
}
