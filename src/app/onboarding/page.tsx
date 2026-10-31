"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserDb } from "@/lib/supabase/browser";
import { MAX_ONBOARDING_REQUESTS, REQUEST_MAX, REQUEST_MIN, requestError } from "@/lib/interests";
import { InterestChips } from "@/components/interests";
import { useData } from "@/components/data";

export default function Onboarding() {
  const { userId, loading, saveInterests } = useData(),
    router = useRouter();
  const [areas, setAreas] = useState<string[]>([]),
    [extra, setExtra] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const requests = extra
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_ONBOARDING_REQUESTS);
  const invalid = requests.some((r) => r.length < REQUEST_MIN || r.length > REQUEST_MAX);
  const go = async () => {
    setBusy(true);
    setError("");
    const saved = await saveInterests(areas);
    if (saved) {
      setBusy(false);
      return setError(saved);
    }
    if (requests.length) {
      const { error } = await browserDb()
        .from("topic_requests")
        .insert(requests.map((body) => ({ user_id: userId, body })));
      if (error) {
        setBusy(false);
        return setError(requestError(error));
      }
    }
    router.replace("/");
  };
  return (
    <main className="content-page onboarding">
      <header>
        <p className="muted">Welcome to CodeInsta</p>
        <h1>What do you want to learn?</h1>
        <p className="muted">Pick a few. Your feed starts with these, and you can change them any time.</p>
      </header>
      <InterestChips value={areas} onChange={setAreas} />
      <label className="onboarding-extra">
        <span>What else do you want to learn? <small className="muted">(optional, up to {MAX_ONBOARDING_REQUESTS}, one per line)</small></span>
        <textarea
          rows={3}
          value={extra}
          onChange={(event) => setExtra(event.target.value)}
          placeholder={"How does ART compile apps?\nWhy is io_uring fast?"}
        />
      </label>
      <p className="error" role="alert">
        {error || (invalid ? `Each request needs ${REQUEST_MIN}-${REQUEST_MAX} characters.` : "")}
      </p>
      <button className="primary onboarding-go" disabled={busy || loading || !userId || areas.length === 0 || invalid} onClick={go}>
        {busy ? "Saving…" : areas.length ? "Start learning" : "Pick at least one topic"}
      </button>
    </main>
  );
}
