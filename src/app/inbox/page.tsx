import { Suspense } from "react";
import { Inbox } from "@/components/inbox";
import { requireOwner } from "@/lib/supabase/membership";
export default async function Page() {
  await requireOwner();
  return (
    <Suspense fallback={<p className="empty">Loading inbox…</p>}>
      <Inbox />
    </Suspense>
  );
}
