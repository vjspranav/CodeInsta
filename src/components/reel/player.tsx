"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Heart,
  MessageCircle,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, useData, type ReelRow } from "../data";
import { timeline } from "./timeline";
import { Stage } from "./stage";
import { Feedback } from "./feedback";
type Props = {
  reel: ReelRow;
  next?: ReelRow;
  active: boolean;
  audio: HTMLAudioElement | null;
  unlocked: boolean;
  muted: boolean;
  unlock: () => void;
  toggleMute: () => void;
  finish: () => void;
  audioBlocked: () => void;
};
export function Player({
  reel,
  next,
  active,
  audio,
  unlocked,
  muted,
  unlock,
  toggleMute,
  finish,
  audioBlocked,
}: Props) {
  const { creators, liked, like, view, isOwner } = useData();
  const frames = useMemo(
    () => timeline(reel.script, reel.audio, next?.series_index ?? undefined),
    [reel, next],
  );
  const [index, setIndex] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [paused, setPaused] = useState(false),
    [hidden, setHidden] = useState(false),
    [sheet, setSheet] = useState(false),
    [burst, setBurst] = useState(0),
    [done, setDone] = useState(false);
  const frame = frames[index],
    running = active && !paused && !hidden && !sheet && !done;
  const clock = useRef(0),
    played = useRef(0),
    viewed = useRef(false),
    tap = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastTap = useRef(0),
    speech = useRef<SpeechSynthesisUtterance | null>(null);
  const callbacks = useRef({ finish, view, audioBlocked });
  callbacks.current = { finish, view, audioBlocked };
  useEffect(() => {
    const change = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(
    () => () => {
      if (tap.current) clearTimeout(tap.current);
    },
    [],
  );
  useEffect(() => {
    clock.current = 0;
    setElapsed(0);
    if (!active || !audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (frame.url) {
      audio.src = frame.url;
      audio.load();
    }
    return () => {
      audio.pause();
      window.speechSynthesis?.cancel();
      speech.current = null;
    };
  }, [active, audio, frame]);
  useEffect(() => {
    if (!active || !audio) return;
    audio.muted = muted;
    if (!running || !unlocked || muted) {
      audio.pause();
      window.speechSynthesis?.pause();
      return;
    }
    if (frame.url) {
      if (Math.abs(audio.currentTime * 1000 - clock.current) > 500)
        audio.currentTime = Math.min(
          clock.current / 1000,
          Number.isFinite(audio.duration)
            ? audio.duration
            : clock.current / 1000,
        );
      void audio.play().catch((error: DOMException) => {
        if (error.name === "NotAllowedError") callbacks.current.audioBlocked();
      });
    } else if ("speechSynthesis" in window && frame.card !== "next") {
      if (speech.current) window.speechSynthesis.resume();
      else {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(frame.text);
        utterance.rate = 1.05;
        speech.current = utterance;
        window.speechSynthesis.speak(utterance);
      }
    }
    return () => {
      audio.pause();
      window.speechSynthesis?.pause();
    };
  }, [active, audio, running, unlocked, muted, frame]);
  useEffect(() => {
    if (!running) return;
    let last = performance.now(),
      id = 0;
    const tick = (now: number) => {
      const delta = Math.min(now - last, 100);
      last = now;
      const previousTime = clock.current;
      if (
        frame.url &&
        unlocked &&
        !muted &&
        audio &&
        !audio.ended &&
        !audio.error
      )
        clock.current = audio.currentTime * 1000;
      else clock.current += delta;
      played.current += Math.min(
        delta,
        Math.max(0, clock.current - previousTime),
      );
      if (!viewed.current && played.current >= 3000) {
        viewed.current = true;
        void callbacks.current.view(reel.id);
      }
      setElapsed(clock.current);
      if (clock.current >= frame.duration) {
        if (index + 1 < frames.length) setIndex(index + 1);
        else {
          setDone(true);
          callbacks.current.finish();
        }
      } else id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [running, frame, index, frames.length, audio, unlocked, muted, reel.id]);
  const creator = creators.find((c) => c.id === reel.creator_id);
  const toggle = () => {
    if (done) {
      setIndex(0);
      clock.current = 0;
      setElapsed(0);
      setDone(false);
      setPaused(false);
      return;
    }
    setPaused((value) => !value);
  };
  const onTap = () => {
    if (!unlocked) {
      unlock();
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (tap.current) clearTimeout(tap.current);
      lastTap.current = 0;
      void like(reel.id, true);
      setBurst((v) => v + 1);
    } else {
      lastTap.current = now;
      tap.current = setTimeout(toggle, 300);
    }
  };
  return (
    <article
      className={`reel creator-${reel.creator_id}`}
      aria-label={reel.title}
    >
      <div
        className="progress"
        aria-label={`Scene ${index + 1} of ${frames.length}`}
      >
        {frames.map((f, i) => (
          <span key={i}>
            <i
              style={{
                width: `${i < index ? 100 : i > index ? 0 : Math.min(100, (elapsed / f.duration) * 100)}%`,
              }}
            />
          </span>
        ))}
      </div>
      <div
        className="stage-tap"
        role="button"
        tabIndex={active ? 0 : -1}
        aria-label={paused ? "Play reel" : "Pause reel. Double tap to like."}
        onClick={onTap}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            if (!unlocked) unlock();
            else toggle();
          }
        }}
      >
        <Stage key={index} frame={frame} elapsed={elapsed} />
        {paused && (
          <span className="pause-indicator">
            <Play fill="currentColor" />
          </span>
        )}
        {burst > 0 && (
          <motion.span
            key={burst}
            className="heart-burst"
            initial={{ opacity: 1, scale: 0.4 }}
            animate={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.7 }}
          >
            <Heart size={100} fill="currentColor" />
          </motion.span>
        )}
      </div>
      <div className="sound-controls">
        {!unlocked && (
          <button className="sound-pill" onClick={unlock}>
            Tap for sound 🔊
          </button>
        )}
        <button aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <button aria-label={paused ? "Play" : "Pause"} onClick={toggle}>
          {paused ? <Play size={20} /> : <Pause size={20} />}
        </button>
      </div>
      <div className="reel-meta">
        <Link className="creator-link" href={`/c/${reel.creator_id}`}>
          <Avatar creator={creator} />
          <strong>{creator?.handle ?? reel.creator_id}</strong>
          <span className="creator-badge">
            {reel.creator_id === "gpt" ? "Build & debug" : "Under the hood"}
          </span>
        </Link>
        <h1>{reel.title}</h1>
        <p className="tags">{reel.tags.map((tag) => `#${tag}`).join(" ")}</p>
        {next && (
          <Link className="next-chip" href={`/reel/${next.id}`}>
            Next in series · Part {next.series_index} →
          </Link>
        )}
        {done && <span className="completion">✓ Learned</span>}
      </div>
      <div className="reel-actions">
        <button
          aria-label={liked.has(reel.id) ? "Unlike" : "Like"}
          aria-pressed={liked.has(reel.id)}
          onClick={() => void like(reel.id)}
        >
          <Heart
            size={29}
            fill={liked.has(reel.id) ? "currentColor" : "none"}
          />
          <span>Like</span>
        </button>
        {isOwner && <button aria-label="Note or ask" onClick={() => setSheet(true)}>
          <MessageCircle size={28} />
          <span>Ask</span>
        </button>}
      </div>
      {isOwner && sheet && <Feedback reel={reel} close={() => setSheet(false)} />}
    </article>
  );
}
