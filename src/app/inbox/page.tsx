import { Suspense } from "react";
import { Inbox } from "@/components/inbox";

// Members may read creator answers; middleware already guarantees membership. The owner's reply
// box is gated client-side (and by RLS: messages_insert_own_user stays owner-only).
export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading inbox…</p>}>
      <Inbox />
    </Suspense>
  );
}
