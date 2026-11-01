"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, ThumbsDown, MessageCircle, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Avatar, useData, type ReelRow } from "../data";
import { Feedback } from "./feedback";

type Props = {
  reel: ReelRow; next?: ReelRow; unlocked: boolean; muted: boolean;
  paused: boolean; done: boolean; sheet: boolean;
  unlock: () => void; toggleMute: () => void; toggle: () => void;
  setSheet: (open: boolean) => void;
};
export function ReelOverlay({ reel, next, unlocked, muted, paused, done, sheet, unlock, toggleMute, toggle, setSheet }: Props) {
  const { creators, liked, like, asksLeft, disliked, dislike } = useData();
  const [notice, setNotice] = useState(false), [preferenceError, setPreferenceError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(false), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const toggleDislike = async () => {
    if (saving) return;
    const adding = !disliked.has(reel.id);
    setSaving(true); setPreferenceError(""); setNotice(adding);
    const error = await dislike(reel.id);
    setSaving(false);
    if (error) { setNotice(false); setPreferenceError(error); }
  };
  const creator = creators.find((c) => c.id === reel.creator_id);
  return <>
      <div className="sound-controls">
        {!unlocked && (
          <button className="sound-pill" onClick={unlock}>
            Tap for sound
          </button>
        )}
        <button aria-label={!unlocked || muted ? "Unmute" : "Mute"} onClick={toggleMute}>
          {!unlocked || muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
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
        {notice && disliked.has(reel.id) && <div className="preference-toast" role="status">Got it, fewer like this <button disabled={saving} onClick={() => void toggleDislike()}>Undo</button></div>}
        {preferenceError && <p className="error" role="alert">{preferenceError}</p>}
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
        <button
          aria-label={asksLeft === null ? "Ask a question" : `Ask a question, ${asksLeft} of 3 left today`}
          onClick={() => setSheet(true)}
        >
          <MessageCircle size={28} />
          <span>Ask</span>
          {asksLeft !== null && <small className="asks-left">{asksLeft} of 3 left today</small>}
        </button>
        <button className="dislike-action" aria-label="Not for me" aria-pressed={disliked.has(reel.id)} disabled={saving} onClick={() => void toggleDislike()}>
          <ThumbsDown size={22} /><span>Not for me</span>
        </button>
      </div>
      {sheet && <Feedback reel={reel} close={() => setSheet(false)} />}
  </>;
}
