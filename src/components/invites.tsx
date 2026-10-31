"use client";
import { useActionState, useEffect, useState } from "react";
import { createInvite } from "@/app/invites/actions";
export function InvitePanel({ invites }: { invites: { code: string; uses: number; max_uses: number; expires_at: string | null }[] }) {
  const [state, action, pending] = useActionState(createInvite, { error: "" });
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return <section className="invite-panel">
    <form action={action}><label>Number of uses<input type="number" name="uses" min="1" max="2147483647" step="1" defaultValue="1" required /></label>
      <button className="primary" disabled={pending}>{pending ? "Creating…" : "Create invite"}</button>
      <p className="error" role="alert">{state.error}</p>
    </form>
    <p role="status">{message}</p>
    {invites.length === 0 && <p className="muted">No invites yet.</p>}
    {invites.map(invite => <article className="invite-card" key={invite.code}>
      <code>{invite.code}</code><p>{invite.uses} / {invite.max_uses} uses{invite.expires_at ? ` · Expires ${new Date(invite.expires_at).toISOString().slice(0, 10)}` : " · No expiry"}</p>
      <button onClick={async () => { try { await navigator.clipboard.writeText(invite.code); setMessage("Code copied."); } catch { setMessage("Could not copy. Select the code to copy it manually."); } }}>Copy code</button>
      {origin && <a href={`${origin}/login?invite=${encodeURIComponent(invite.code)}`}>{origin}/login?invite={invite.code}</a>}
    </article>)}
  </section>;
}
