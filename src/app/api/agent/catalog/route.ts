import { NextResponse } from "next/server";
import { isLabTopic } from "@/lib/agent-inbox";
import { authenticateAgent } from "@/lib/agent-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const creator = authenticateAgent(req);
  if (!creator) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const filter = new URL(req.url).searchParams.get("creator") ?? "all";
  if (filter !== "all" && filter !== "claude" && filter !== "gpt") {
    return NextResponse.json({ error: "creator must be all, claude or gpt" }, { status: 400 });
  }

  let q = getSupabaseAdmin()
    .from("reels")
    .select("id, topic, title, series, series_index, creator_id, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (filter !== "all") q = q.eq("creator_id", filter);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Lab/example reels (lab/, lab-v3/) never feed creator planning.
  return NextResponse.json({ reels: (data ?? []).filter((r) => !isLabTopic(r.topic as string)) });
}
