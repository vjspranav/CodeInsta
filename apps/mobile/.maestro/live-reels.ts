// Prints {"count": N, "firstId": "<uuid>"} for the reels the Maestro test member can see in the feed
// (same filter as src/data/queries.ts usableReels). Prints nothing else; never prints credentials.
// Run from the repo root with MAESTRO_EMAIL, MAESTRO_PASSWORD, NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment:  npx tsx apps/mobile/.maestro/live-reels.ts
import { createClient } from "@supabase/supabase-js";
import { isLabReel } from "../../../packages/shared/src/validation";

async function main() {
  const { MAESTRO_EMAIL, MAESTRO_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = process.env;
  if (!MAESTRO_EMAIL || !MAESTRO_PASSWORD || !NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("missing MAESTRO_EMAIL, MAESTRO_PASSWORD, NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  const client = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email: MAESTRO_EMAIL, password: MAESTRO_PASSWORD });
  if (signIn.error) throw new Error("test member sign-in failed (run scripts/mobile-test-user.ts create first)");
  const { data, error } = await client
    .from("reels")
    .select("id,topic,video_url,expires_at:script->>expires_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("could not read the reel catalog");
  const now = Date.now();
  const live = (data ?? []).filter((r: any) => {
    if (typeof r.topic !== "string" || isLabReel({ topic: r.topic })) return false;
    if (typeof r.video_url !== "string" || r.video_url.trim() === "") return false;
    if (r.expires_at) {
      const t = Date.parse(r.expires_at);
      if (Number.isFinite(t) && t <= now) return false;
    }
    return true;
  });
  console.log(JSON.stringify({ count: live.length, firstId: live[0]?.id ?? null }));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "failed");
  process.exit(1);
});
