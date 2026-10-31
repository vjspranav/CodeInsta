import { Suspense } from "react";
import { Inbox } from "@/components/inbox";
export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading inbox…</p>}>
      <Inbox />
    </Suspense>
  );
}
