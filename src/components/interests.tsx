"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserDb } from "@/lib/supabase/browser";
import {
  AREA_INFO,
  AREAS,
  REQUEST_MAX,
  REQUEST_MIN,
  areaLabel,
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
  return (
    <div className="chip-grid" role="group" aria-label="Topics you want to learn">
      {AREAS.map((area) => {
        const on = value.includes(area),
          info = AREA_INFO[area];
        return (
          <button
            type="button"
            key={area}
            className="interest-chip"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((a) => a !== area) : [...value, area])}
          >
            <span className="chip-emoji" aria-hidden>{info.emoji}</span>
            <strong>{info.label}</strong>
            <small>{info.blurb}</small>
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
    if (!error) setItems((data ?? []) as TopicRequest[]);
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

export function ReviewRequests() {
  const [items, setItems] = useState<TopicRequest[]>([]),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await browserDb()
      .from("topic_requests")
      .select("id, user_id, body, area, status, created_at, fulfilled_reel_id")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) setError("Could not load requests.");
    else setItems((data ?? []) as TopicRequest[]);
  }, []);
  useEffect(() => void load(), [load]);
  const decide = async (id: string, status: "approved" | "rejected") => {
    setError("");
    const { error } = await browserDb()
      .from("topic_requests")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return setError("Could not update that request. Try again.");
    setItems((current) => current.filter((item) => item.id !== id));
  };
  return (
    <section className="interest-section">
      <h2>Review requests</h2>
      <p className="error" role="alert">{error}</p>
      {items.length === 0 && !error && <p className="muted">Nothing waiting for review.</p>}
      <ul className="request-list">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.body}</span>
            <small className="muted">Member {item.user_id.slice(0, 6)}{item.area ? ` · ${areaLabel(item.area)}` : ""}</small>
            <div className="request-actions">
              <button className="primary" onClick={() => decide(item.id, "approved")}>Approve</button>
              <button onClick={() => decide(item.id, "rejected")}>Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
