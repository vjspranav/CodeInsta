import { requireOwner } from "@/lib/supabase/membership";
import { ReviewRequests } from "@/components/review-requests";
export default async function RequestsPage() {
  await requireOwner();
  return <main className="content-page"><h1>Topic requests</h1><ReviewRequests /></main>;
}
