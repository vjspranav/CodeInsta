import { Lab } from "@/components/lab";
import { requireOwner } from "@/lib/supabase/membership";
export default async function Page() {
  await requireOwner();
  return <Lab />;
}
