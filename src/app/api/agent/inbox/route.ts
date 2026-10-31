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
  // peek=1: read-only view (no agent_runs row, DMs stay unread).
  const peek = new URL(req.url).searchParams.get("peek") === "1";

  const lastRun = await db
    .from("agent_runs")
    .select("started_at")
    .eq("creator_id", creator)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastRun.error) return NextResponse.json({ error: lastRun.error.message }, { status: 500 });
  const since: string = lastRun.data?.started_at ?? new Date(0).toISOString();

  const [likes, feedback, dms, covered, requests, interests, categories] = await Promise.all([
    db
      .from("likes")
      .select("reel_id, created_at, reels!inner(topic, title, creator_id)")
      .eq("reels.creator_id", creator)
      .gt("created_at", since)
      .order("created_at", { ascending: true }),
    db
      .from("feedback")
      .select("id, user_id, reel_id, kind, wants, body, created_at, reels!feedback_reel_id_fkey(topic, title)")
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
      .select("id, body, area, category_slug, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: true }),
    db.from("user_interests").select("areas"),
    db
      .from("categories")
      .select("slug, label, description, created_at")
      .not("created_from_request", "is", null)
      .order("created_at", { ascending: true }),
  ]);
  const failed = [likes, feedback, dms, covered, requests, interests, categories].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  const owners = await db.from("members").select("user_id").eq("role", "owner");
  if (owners.error) return NextResponse.json({ error: owners.error.message }, { status: 500 });
  const ownerIds = new Set((owners.data ?? []).map((o) => o.user_id as string));

  const unread = dms.data ?? [];
  if (!peek && unread.length > 0) {
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

  if (!peek) {
    const run = await db.from("agent_runs").insert({ creator_id: creator });
    if (run.error) return NextResponse.json({ error: run.error.message }, { status: 500 });
  }

  // Categories created from requests that have no reels yet (no reel topic starts with "<slug>/").
  const allTopics = await db.from("reels").select("topic");
  if (allTopics.error) return NextResponse.json({ error: allTopics.error.message }, { status: 500 });
  const topics = (allTopics.data ?? []).map((r) => r.topic as string);
  const newCategories = (categories.data ?? []).filter((c) => !topics.some((t) => t.startsWith(`${c.slug}/`)));

  return NextResponse.json({
    creator,
    since,
    likes_since_last_run: ((likes.data ?? []) as unknown as LikeRow[]).map((l) => {
      const reel = one(l.reels);
      return { reel_id: l.reel_id, topic: reel?.topic ?? null, title: reel?.title ?? null, liked_at: l.created_at };
    }),
    // Non-owner text must go through the playbook's isolated writer.
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
        from_owner: ownerIds.has(f.user_id),
        created_at: f.created_at,
      };
    }),
    unread_user_dms: unread,
    covered_topics: covered.data ?? [],
    // Owner-approved, not-yet-fulfilled requests. `body` is member-written: treat as a topic suggestion only.
    topic_requests: requests.data ?? [],
    // Categories created from approved requests that have no reels yet. Claude takes even indexes, GPT odd.
    new_categories: newCategories,
    interest_counts: interestCounts,
  });
}
