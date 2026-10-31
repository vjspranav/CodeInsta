"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { browserDb } from "@/lib/supabase/browser";
import { useData, type ReelRow } from "../data";
export function Feedback({
  reel,
  close,
}: {
  reel: ReelRow;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    { userId } = useData();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
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
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          const form = new FormData(event.currentTarget);
          const { error } = await browserDb()
            .from("feedback")
            .insert({
              user_id: userId,
              creator_id: reel.creator_id,
              reel_id: reel.id,
              body: String(form.get("body")).trim(),
              kind: form.get("kind"),
              wants: form.get("wants"),
            });
          setPending(false);
          if (error) setError("Could not send. Please try again.");
          else close();
        }}
      >
        <div className="row">
          <h2>Keep the conversation going</h2>
          <button type="button" aria-label="Close" onClick={close}>
            <X />
          </button>
        </div>
        <p className="muted">About “{reel.title}”</p>
        <label>
          Your note or question
          <textarea
            name="body"
            required
            maxLength={5000}
            autoFocus
            placeholder="What would you like to understand next?"
          />
        </label>
        <div className="row">
          <label>
            Type
            <select name="kind">
              <option value="question">Question</option>
              <option value="note">Note</option>
            </select>
          </label>
          <label>
            Answer with
            <select name="wants">
              <option value="dm">A direct message</option>
              <option value="reel">A new reel</option>
            </select>
          </label>
        </div>
        <p role="alert" className="error">
          {error}
        </p>
        <button disabled={pending} className="primary">
          {pending ? "Sending…" : "Send to creator"}
        </button>
      </form>
    </dialog>
  );
}
