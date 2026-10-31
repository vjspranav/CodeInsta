"use client";
import { useCallback, useState } from "react";
import { Play as PlayIcon, X } from "lucide-react";
import { LoadState, useData, type ReelRow } from "./data";
import { Player } from "./reel/player";
import { palette } from "./reel/stage";
import { FORMATS } from "@/lib/reel-schema";

const FORMAT_NAMES: Record<string, string> = {
  dialogue: "Dialogue",
  whiteboard: "Whiteboard",
  incident: "Incident",
  interview: "Interview",
  podcast: "Podcast",
  explainer: "Explainer",
};

export function Lab() {
  const { labReels, loading, error } = useData();
  const [open, setOpen] = useState<ReelRow | null>(null),
    [unlocked, setUnlocked] = useState(false),
    [muted, setMuted] = useState(false),
    [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const unlock = useCallback(() => {
    if (audio?.src)
      void audio.play().catch((e: DOMException) => {
        if (e.name === "NotAllowedError") setUnlocked(false);
      });
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
    setUnlocked(true);
  }, [audio]);
  const order = (r: ReelRow) => {
    const i = (FORMATS as readonly string[]).indexOf(r.script.format ?? "");
    return i < 0 ? FORMATS.length : i;
  };
  const sorted = [...labReels].sort((a, b) => order(a) - order(b));
  return (
    <main className="content-page lab-page">
      <header>
        <p className="muted">Owner only. Compare ways to tell the same story.</p>
        <h1>Format Lab</h1>
      </header>
      <audio ref={setAudio} preload="auto" onError={() => setUnlocked(false)} />
      {loading || error ? (
        <LoadState />
      ) : !sorted.length ? (
        <p className="empty">No lab reels yet. Post reels with a lab/ topic.</p>
      ) : (
        <div className="lab-list">
          {sorted.map((reel) => (
            <button
              key={reel.id}
              className="lab-card"
              onClick={() => {
                unlock();
                setOpen(reel);
              }}
            >
              <span className="lab-format">
                {FORMAT_NAMES[reel.script.format ?? ""] ?? reel.topic.replace("lab/", "")}
              </span>
              <h2>{reel.title}</h2>
              <ul className="lab-cast">
                {(reel.script.cast ?? []).map((member) => (
                  <li key={member.id}>
                    <i style={{ background: palette[member.color] }} />
                    <strong>{member.name}</strong>
                    <span>{member.role}</span>
                    <code>{member.voice}</code>
                  </li>
                ))}
              </ul>
              <span className="lab-play">
                <PlayIcon size={16} fill="currentColor" /> Play full screen
              </span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="lab-overlay" role="dialog" aria-label={open.title}>
          <button className="lab-close" aria-label="Close reel" onClick={() => setOpen(null)}>
            <X size={22} />
          </button>
          <div className="reel-slot">
            <Player
              reel={open}
              active
              audio={audio}
              unlocked={unlocked}
              muted={muted}
              unlock={unlock}
              toggleMute={() => {
                if (muted && !unlocked) unlock();
                setMuted((v) => !v);
              }}
              finish={() => {}}
              audioBlocked={() => setUnlocked(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
