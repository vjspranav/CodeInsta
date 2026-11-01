"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Play } from "lucide-react";
import { motion } from "framer-motion";
import { useData, type ReelRow } from "../data";
import { lineAt, timeline } from "./timeline";
import { pickVoice } from "./voices";
import { Stage } from "./stage";
import { ReelOverlay } from "./overlay";
import { VideoPlayer } from "./video-player";
export type PlayerProps = {
  reel: ReelRow;
  next?: ReelRow;
  active: boolean;
  audio: HTMLAudioElement | null;
  unlocked: boolean;
  muted: boolean;
  unlock: () => void;
  toggleMute: () => void;
  slot: number;
  finish: (id: string, slot: number) => void;
  audioBlocked: () => void;
};
export const Player = memo(function Player(props: PlayerProps) {
  if (props.reel.video_url) return <VideoPlayer {...props} />;
  if (!props.reel.script) return null;
  return <LivePlayer {...props} reel={{ ...props.reel, script: props.reel.script }} />;
});
const LivePlayer = memo(function LivePlayer({
  reel,
  next,
  active,
  audio,
  unlocked,
  muted,
  unlock,
  toggleMute,
  slot,
  finish,
  audioBlocked,
}: PlayerProps & { reel: ReelRow & { script: NonNullable<ReelRow["script"]> } }) {
  const { like, view } = useData();
  const frames = useMemo(
    () => timeline(reel.script, reel.audio, next?.series_index ?? undefined),
    [reel.script, reel.audio, next?.series_index],
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
  // Multi-voice scenes carry one clip per line; legacy scenes have one clip per frame.
  const perLine = frame.lines.some((l) => l.url),
    perLineSpeech = frame.lines.some((l) => l.speaker);
  const lineIndex = lineAt(frame, elapsed),
    line = frame.lines[lineIndex];
  const clock = useRef(0),
    played = useRef(0),
    viewed = useRef(false),
    tap = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastTap = useRef(0),
    loaded = useRef(""),
    speech = useRef<{ key: string; utterance: SpeechSynthesisUtterance } | null>(null);
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
    loaded.current = "";
    speech.current = null;
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
    const clipUrl = perLine ? line?.url : frame.url;
    if (clipUrl) {
      if (loaded.current !== clipUrl) {
        loaded.current = clipUrl;
        audio.src = clipUrl;
        audio.load();
      } else if (
        !perLine &&
        Math.abs(audio.currentTime * 1000 - clock.current) > 500
      )
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
      const key = perLineSpeech ? `${index}:${lineIndex}` : `${index}`;
      if (speech.current?.key === key) window.speechSynthesis.resume();
      else {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        const text = perLineSpeech ? (line?.text ?? "") : frame.text;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        if (perLineSpeech) {
          const who = frame.cast.findIndex((c) => c.id === line?.speaker);
          const voice = pickVoice(frame.cast[who]?.voice ?? "", Math.max(0, who));
          if (voice.voice) utterance.voice = voice.voice;
          utterance.pitch = voice.pitch;
        }
        speech.current = { key, utterance };
        if (text) window.speechSynthesis.speak(utterance);
      }
    }
    return () => {
      audio.pause();
      window.speechSynthesis?.pause();
    };
  }, [active, audio, running, unlocked, muted, frame, index, perLine, perLineSpeech, lineIndex, line]);
  useEffect(() => {
    if (!running) return;
    let last = performance.now(),
      painted = 0,
      id = 0;
    const tick = (now: number) => {
      const delta = Math.min(now - last, 100);
      last = now;
      const previousTime = clock.current;
      const lineClip = perLine ? frame.lines[lineAt(frame, clock.current)] : undefined;
      if (
        frame.url &&
        unlocked &&
        !muted &&
        audio &&
        !audio.ended &&
        !audio.error
      )
        clock.current = audio.currentTime * 1000;
      else if (lineClip?.url && unlocked && !muted && audio && !audio.error && !audio.ended) {
        // Follow the line's clip once it starts; wait for it while it loads.
        if (audio.currentTime > 0)
          clock.current = lineClip.start + audio.currentTime * 1000;
      } else clock.current += delta;
      played.current += Math.min(
        delta,
        Math.max(0, clock.current - previousTime),
      );
      if (!viewed.current && played.current >= 3000) {
        viewed.current = true;
        void callbacks.current.view(reel.id);
      }
      // ~30fps is plenty for captions and progress, and halves the re-render work.
      if (now - painted >= 33 || clock.current >= frame.duration) {
        painted = now;
        setElapsed(clock.current);
      }
      if (clock.current >= frame.duration) {
        if (index + 1 < frames.length) setIndex(index + 1);
        else {
          setDone(true);
          callbacks.current.finish(reel.id, slot);
        }
      } else id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [running, frame, index, frames.length, audio, unlocked, muted, reel.id, perLine, slot]);
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
      <ReelOverlay {...{ reel, next, unlocked, muted, paused, done, sheet, unlock, toggleMute, toggle, setSheet }} />
    </article>
  );
});
