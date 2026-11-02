"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Inbox, X } from "lucide-react";
import { sentCopy } from "@/app/inbox/asks";
import { browserDb } from "@/lib/supabase/browser";
import { DAILY_ASKS, useData, type ReelRow } from "../data";

export function Feedback({
  reel,
  close,
}: {
  reel: ReelRow;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    { userId, isOwner, asksLeft, noteAsked } = useData();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [queued, setQueued] = useState<"dm" | "reel" | null>(null);
  const who = reel.creator_id === "gpt" ? "GPT" : "Claude",
    blocked = asksLeft === 0;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="feedback-sheet"
      onCancel={close}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      {queued ? (
        <div className="ask-done">
          <div className="row">
            <h2>Sent to {who}</h2>
            <button type="button" aria-label="Close" onClick={close}>
              <X />
            </button>
          </div>
          <p role="status">{sentCopy(who, queued)}</p>
          {asksLeft !== null && (
            <p className="muted">
              {asksLeft} of {DAILY_ASKS} questions left today
            </p>
          )}
          <Link
            className="primary"
            href={`/inbox?creator=${encodeURIComponent(reel.creator_id)}`}
            onClick={close}
          >
            <Inbox size={20} aria-hidden />
            Go to Inbox
          </Link>
          <button type="button" onClick={close} style={{ width: "100%", marginTop: 8 }}>
            Done
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (blocked) return;
            setPending(true);
            setError("");
            const form = new FormData(event.currentTarget);
            const { error } = await browserDb()
              .from("feedback")
              .insert({
                user_id: userId,
                creator_id: reel.creator_id,
                reel_id: reel.id,
                body: String(form.get("body")).trim(),
                kind: isOwner ? form.get("kind") : "question",
                wants: form.get("wants"),
              });
            setPending(false);
            if (error) {
              setError(
                error.message?.includes("Daily question limit")
                  ? "You've used all 3 questions for today. Try again later."
                  : "Could not send. Please try again.",
              );
              return;
            }
            noteAsked();
            setQueued(form.get("wants") === "reel" ? "reel" : "dm");
          }}
        >
          <div className="row">
            <h2>Ask {who} about this reel</h2>
            <button type="button" aria-label="Close" onClick={close}>
              <X />
            </button>
          </div>
          <p className="muted">About “{reel.title}”</p>
          <label>
            Your question
            <textarea
              name="body"
              required
              maxLength={isOwner ? 5000 : 1000}
              autoFocus
              disabled={blocked}
              placeholder="What would you like to understand next?"
            />
          </label>
          <fieldset className="ask-choice">
            <legend>How should {who} answer?</legend>
            <label>
              <input type="radio" name="wants" value="dm" defaultChecked />
              <span>Answer in my inbox</span>
            </label>
            <label>
              <input type="radio" name="wants" value="reel" />
              <span>Make a reel about it</span>
            </label>
          </fieldset>
          {isOwner && (
            <label>
              Type
              <select name="kind">
                <option value="question">Question</option>
                <option value="note">Note</option>
              </select>
            </label>
          )}
          {asksLeft !== null && (
            <p className="muted" role="status">
              {asksLeft} of {DAILY_ASKS} questions left today
            </p>
          )}
          <p role="alert" className="error">
            {error}
          </p>
          <button disabled={pending || blocked} className="primary">
            {pending ? "Sending…" : `Ask ${who}`}
          </button>
        </form>
      )}
    </dialog>
  );
}
