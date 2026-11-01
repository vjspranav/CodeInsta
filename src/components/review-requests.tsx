"use client";
import { useCallback, useEffect, useState } from "react";
import { browserDb } from "@/lib/supabase/browser";
import type { TopicRequest } from "@/lib/interests";
import { useData } from "./data";
import { StatusBadge } from "./interests";

const slugFromLabel = (label: string) => label.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
function RequestReview({ item, email, onDecided }: { item: TopicRequest; email?: string; onDecided: () => Promise<void> }) {
  const { categories } = useData();
  const [mode, setMode] = useState<"new_category" | "existing" | null>(null);
  const [label, setLabel] = useState(""), [slug, setSlug] = useState(""), [editedSlug, setEditedSlug] = useState(false);
  const [existing, setExisting] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const decide = async (decision: "new_category" | "existing" | "reject") => {
    setBusy(true); setError("");
    try {
      const { error } = await browserDb().rpc("review_topic_request", {
        request_id: item.id, decision,
        slug: decision === "new_category" ? slug : decision === "existing" ? existing : null,
        label: decision === "new_category" ? label.trim() : null, description: null,
      });
      if (error) throw new Error(error.message);
      await onDecided();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not review request. Try again."); }
    finally { setBusy(false); }
  };
  return <li>
    <strong>{item.body}</strong>
    <small className="muted">{email ?? item.user_id} · {new Date(item.created_at).toLocaleDateString()}</small>
    <div className="request-actions">
      <button disabled={busy} aria-pressed={mode === "new_category"} onClick={() => setMode("new_category")}>Approve as new category</button>
      <button disabled={busy} aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>Approve into existing</button>
      <button disabled={busy} onClick={() => void decide("reject")}>Reject</button>
    </div>
    {mode && <form className="review-form" onSubmit={(e) => { e.preventDefault(); void decide(mode); }}>
      {mode === "new_category" ? <>
        <label>Category label<input required maxLength={60} value={label} disabled={busy} onChange={(e) => { setLabel(e.target.value); if (!editedSlug) setSlug(slugFromLabel(e.target.value)); }} /></label>
        <label>Category slug<input required pattern="[a-z0-9-]{2,40}" minLength={2} maxLength={40} value={slug} disabled={busy} onChange={(e) => { setEditedSlug(true); setSlug(e.target.value); }} /></label>
      </> : <label>Category<select required value={existing} disabled={busy} onChange={(e) => setExisting(e.target.value)}><option value="">Select a category</option>{categories.map((category) => <option key={category.slug} value={category.slug}>{category.label}</option>)}</select></label>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Approve request"}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
  </li>;
}

export function ReviewRequests() {
  const { isOwner, refreshRequests, refreshCategories } = useData();
  const [pending, setPending] = useState<TopicRequest[]>([]), [history, setHistory] = useState<TopicRequest[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({}), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!isOwner) return;
    setError("");
    try {
      const db = browserDb();
      const [pending, history, members] = await Promise.all([
        db.from("topic_requests").select("*").eq("status", "pending").order("created_at"),
        db.from("topic_requests").select("*").neq("status", "pending").not("decided_at", "is", null).order("decided_at", { ascending: false }).limit(10),
        db.from("members").select("user_id, email"),
      ]);
      for (const result of [pending, history, members]) if (result.error) throw new Error(result.error.message);
      setPending(pending.data ?? []); setHistory(history.data ?? []);
      setEmails(Object.fromEntries((members.data ?? []).map((m: { user_id: string; email: string }) => [m.user_id, m.email])));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load requests."); }
    finally { setLoading(false); }
  }, [isOwner]);
  useEffect(() => { void load(); }, [load]);
  const onDecided = async () => { await Promise.all([load(), refreshRequests(), refreshCategories()]); };
  if (!isOwner) return null;
  return <>
    {error && <p className="error" role="alert">{error} <button onClick={() => void load()}>Retry</button></p>}
    <section className="interest-section"><h2>Pending review</h2>
      {loading ? <p role="status">Loading requests…</p> : !pending.length && !error && <p className="muted">Nothing waiting for review.</p>}
      <ul className="request-list">{pending.map((item) => <RequestReview key={item.id} item={item} email={emails[item.user_id]} onDecided={onDecided} />)}</ul>
    </section>
    <section className="interest-section"><h2>Recently decided</h2>
      <ul className="request-list">{history.map((item) => <li key={item.id}><span>{item.body}</span><small className="muted">{emails[item.user_id] ?? item.user_id} · {new Date(item.decided_at!).toLocaleDateString()}{item.category_slug ? ` · ${item.category_slug}` : ""}</small><StatusBadge status={item.status} /></li>)}</ul>
      {!loading && !history.length && !error && <p className="muted">No decisions yet.</p>}
    </section>
  </>;
}
