"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserDb } from "@/lib/supabase/browser";
import {
  REQUEST_MAX,
  REQUEST_MIN,
  requestError,
  type TopicRequest,
} from "@/lib/interests";
import { useData } from "./data";

export function InterestChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { categories } = useData();
  return (
    <div className="chip-grid" role="group" aria-label="Topics you want to learn">
      {categories.map((info) => {
        const area = info.slug, on = value.includes(area);
        return (
          <button
            type="button"
            key={area}
            className="interest-chip"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((a) => a !== area) : [...value, area])}
          >
            <strong>{info.label}</strong>
            <small>{info.description}</small>
          </button>
        );
      })}
    </div>
  );
}

export function MyInterests() {
  const { areas, saveInterests } = useData();
  const [draft, setDraft] = useState(areas),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => setDraft(areas), [areas]);
  const dirty = draft.length !== areas.length || draft.some((a) => !areas.includes(a));
  return (
    <section className="interest-section">
      <h2>My interests</h2>
      <p className="muted">Your feed leans toward these. Tap to change.</p>
      <InterestChips value={draft} onChange={(next) => { setDraft(next); setMessage(""); }} />
      <p className="error" role="alert">{message.startsWith("Could") ? message : ""}</p>
      <button
        className="primary"
        disabled={saving || !dirty || draft.length === 0}
        onClick={async () => {
          setSaving(true);
          const result = await saveInterests(draft);
          setSaving(false);
          setMessage(result || "Saved.");
        }}
      >
        {saving ? "Saving…" : "Save interests"}
      </button>
      {message === "Saved." && <p className="muted" role="status">Saved.</p>}
      {draft.length === 0 && <p className="muted">Pick at least one topic.</p>}
    </section>
  );
}

const STATUS_LABEL: Record<TopicRequest["status"], string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Not now",
  done: "Done",
};

export function StatusBadge({ status }: { status: TopicRequest["status"] }) {
  return <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function TopicRequests() {
  const { userId } = useData();
  const [items, setItems] = useState<TopicRequest[]>([]),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await browserDb()
      .from("topic_requests")
      .select("id, user_id, body, area, status, created_at, fulfilled_reel_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setItems((data ?? []) as TopicRequest[]);
  }, [userId]);
  useEffect(() => void load(), [load]);
  const text = body.trim();
  return (
    <section className="interest-section">
      <h2>Topic requests</h2>
      <p className="muted">Ask for something you want to learn. The owner reviews every request.</p>
      <form
        className="request-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (text.length < REQUEST_MIN) return;
          setBusy(true);
          setError("");
          const { error } = await browserDb().from("topic_requests").insert({ user_id: userId, body: text });
          setBusy(false);
          if (error) return setError(requestError(error));
          setBody("");
          void load();
        }}
      >
        <input
          value={body}
          maxLength={REQUEST_MAX}
          onChange={(event) => setBody(event.target.value)}
          placeholder="e.g. How does ART compile apps?"
          aria-label="Topic request"
        />
        <button className="primary" disabled={busy || text.length < REQUEST_MIN}>
          {busy ? "Adding…" : "Request"}
        </button>
      </form>
      <p className="error" role="alert">{error}</p>
      {items.length === 0 && <p className="muted">No requests yet.</p>}
      <ul className="request-list">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.body}</span>
            <StatusBadge status={item.status} />
            {item.status === "done" && item.fulfilled_reel_id && (
              <Link href={`/reel/${item.fulfilled_reel_id}`}>Watch the reel →</Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
