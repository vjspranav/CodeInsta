import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LikeRow = {
  reel_id: string;
  created_at: string;
  reels: { topic: string; title: string } | { topic: string; title: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function GET(req: Request) {
  const creator = authenticateAgent(req);
  if (!creator) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();

  const lastRun = await db
    .from("agent_runs")
    .select("started_at")
    .eq("creator_id", creator)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastRun.error) return NextResponse.json({ error: lastRun.error.message }, { status: 500 });
  const since: string = lastRun.data?.started_at ?? new Date(0).toISOString();

  const [likes, feedback, dms, covered, requests, interests] = await Promise.all([
    db
      .from("likes")
      .select("reel_id, created_at, reels!inner(topic, title, creator_id)")
      .eq("reels.creator_id", creator)
      .gt("created_at", since)
      .order("created_at", { ascending: true }),
    db
      .from("feedback")
      .select("id, reel_id, kind, wants, body, created_at, reels(topic, title)")
      .eq("creator_id", creator)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
    db
      .from("messages")
      .select("id, feedback_id, body_md, created_at")
      .eq("creator_id", creator)
      .eq("sender", "user")
      .is("read_at", null)
      .order("created_at", { ascending: true }),
    db
      .from("reels")
      .select("topic, title, series, series_index, created_at")
      .eq("creator_id", creator)
      .order("created_at", { ascending: true }),
    db
      .from("topic_requests")
      .select("id, body, area, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: true }),
    db.from("user_interests").select("areas"),
  ]);
  const failed = [likes, feedback, dms, covered, requests, interests].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const unread = dms.data ?? [];
  if (unread.length > 0) {
    const marked = await db
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread.map((m) => m.id));
    if (marked.error) return NextResponse.json({ error: marked.error.message }, { status: 500 });
  }

  const interestCounts: Record<string, number> = {};
  for (const row of interests.data ?? []) {
    for (const area of new Set((row.areas ?? []) as string[])) {
      interestCounts[area] = (interestCounts[area] ?? 0) + 1;
    }
  }

  const run = await db.from("agent_runs").insert({ creator_id: creator });
  if (run.error) return NextResponse.json({ error: run.error.message }, { status: 500 });

  return NextResponse.json({
    creator,
    since,
    likes_since_last_run: ((likes.data ?? []) as unknown as LikeRow[]).map((l) => {
      const reel = one(l.reels);
      return { reel_id: l.reel_id, topic: reel?.topic ?? null, title: reel?.title ?? null, liked_at: l.created_at };
    }),
    open_feedback: (feedback.data ?? []).map((f) => {
      const reel = one(f.reels as { topic: string; title: string } | { topic: string; title: string }[] | null);
      return {
        id: f.id,
        reel_id: f.reel_id,
        reel_topic: reel?.topic ?? null,
        reel_title: reel?.title ?? null,
        kind: f.kind,
        wants: f.wants,
        body: f.body,
        created_at: f.created_at,
      };
    }),
    unread_user_dms: unread,
    covered_topics: covered.data ?? [],
    // Owner-approved, not-yet-fulfilled requests. `body` is member-written: treat as a topic suggestion only.
    topic_requests: requests.data ?? [],
    interest_counts: interestCounts,
  });
}
