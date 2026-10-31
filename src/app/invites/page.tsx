import { getMembershipAdmin, requireOwner } from "@/lib/supabase/membership";
import { InvitePanel } from "@/components/invites";
export default async function Invites() {
  await requireOwner();
  const { data, error } = await getMembershipAdmin().from("invites").select("code, uses, max_uses, expires_at").order("created_at", { ascending: false });
  return <main className="content-page"><h1>Invite friends</h1>
    <InvitePanel invites={data ?? []} />
    {error && <p role="alert">Could not load invites. Please refresh.</p>}
  </main>;
}
