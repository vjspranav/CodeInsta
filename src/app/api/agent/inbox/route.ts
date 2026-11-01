import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { assignCategories, categoriesWithoutReels, isLabTopic, isMissingSchema } from "@/lib/agent-inbox";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LikeRow = {
  reel_id: string;
  created_at: string;
  reels: { topic: string; title: string } | { topic: string; title: string }[] | null;
};

type DislikeRow = {
  reel_id: string;
  user_id: string;
  created_at: string;
  reels:
    | { topic: string; title: string; genre: string | null; style: string | null }
    | { topic: string; title: string; genre: string | null; style: string | null }[]
    | null;
};

type StatRow = {
  reels: { topic: string; genre: string | null; style: string | null } | { topic: string; genre: string | null; style: string | null }[] | null;
};

type Stats = { by_genre: Record<string, number>; by_style: Record<string, number>; by_topic_area: Record<string, number> };

const emptyStats = (): Stats => ({ by_genre: {}, by_style: {}, by_topic_area: {} });

function tally(rows: StatRow[]): Stats {
  const out = emptyStats();
  const bump = (m: Record<string, number>, k: string | null | undefined) => {
    if (k) m[k] = (m[k] ?? 0) + 1;
  };
  for (const r of rows) {
    const reel = one(r.reels);
    if (!reel) continue;
    bump(out.by_genre, reel.genre);
    bump(out.by_style, reel.style);
    bump(out.by_topic_area, reel.topic?.split("/")[0]);
  }
  return out;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function GET(req: Request) {
  const creator = authenticateAgent(req);
  if (!creator) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  // High-water mark captured BEFORE any query. Event queries read (since, now] and this same `now` is
  // recorded as the run start, so an event inserted mid-request lands in the NEXT run instead of being lost.
  const now = new Date().toISOString();
  // peek=1: read-only view (no agent_runs row). The inbox never marks DMs read; answering does (POST /messages).
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

  // Event queries are bounded to (since, now]. State queries (open feedback, unread DMs, approved requests)
  // stay open-ended below, bounded only above by `now`, because they persist until answered.
  const [likes, feedback, dms, covered, requests, interests, categories] = await Promise.all([
    db
      .from("likes")
      .select("reel_id, created_at, reels!inner(topic, title, creator_id)")
      .eq("reels.creator_id", creator)
      .gt("created_at", since)
      .lte("created_at", now)
      .order("created_at", { ascending: true }),
    db
      .from("feedback")
      .select("id, user_id, reel_id, kind, wants, body, created_at, reels!feedback_reel_id_fkey(topic, title)")
      .eq("creator_id", creator)
      .eq("status", "open")
      .lte("created_at", now)
      .order("created_at", { ascending: true }),
    db
      .from("messages")
      .select("id, user_id, feedback_id, body_md, created_at")
      .eq("creator_id", creator)
      .eq("sender", "user")
      .is("read_at", null)
      .lte("created_at", now)
      .order("created_at", { ascending: true }),
    db
      .from("reels")
      .select("topic, title, series, series_index, created_at")
      .eq("creator_id", creator)
      .is("archived_at", null)
      .lte("created_at", now)
      .order("created_at", { ascending: true }),
    db
      .from("topic_requests")
      .select("id, body, area, category_slug, created_at")
      .eq("status", "approved")
      .lte("created_at", now)
      .order("created_at", { ascending: true }),
    db.from("user_interests").select("areas"),
    db
      .from("categories")
      .select("slug, label, description, created_at")
      .lte("created_at", now)
      .order("created_at", { ascending: true }),
  ]);
  // Dislikes and like/dislike stats need migration 0008 (dislikes table, reels.genre/style).
  // Only a genuinely missing relation/column degrades to empty; any other error is returned.
  const [dislikesRes, dislikeStatsRes, likeStatsRes] = await Promise.all([
    db
      .from("dislikes")
      .select("reel_id, user_id, created_at, reels!dislikes_reel_id_fkey!inner(topic, title, genre, style, creator_id)")
      .eq("reels.creator_id", creator)
      .gt("created_at", since)
      .lte("created_at", now)
      .order("created_at", { ascending: true }),
    db
      .from("dislikes")
      .select("reels!dislikes_reel_id_fkey!inner(topic, genre, style, creator_id)")
      .eq("reels.creator_id", creator)
      .lte("created_at", now),
    db
      .from("likes")
      .select("reels!likes_reel_id_fkey!inner(topic, genre, style, creator_id)")
      .eq("reels.creator_id", creator)
      .lte("created_at", now),
  ]);

  const failed = [likes, feedback, dms, covered, requests, interests, categories].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  const genuine = [dislikesRes, dislikeStatsRes, likeStatsRes].find((r) => r.error && !isMissingSchema(r.error));
  if (genuine?.error) return NextResponse.json({ error: genuine.error.message }, { status: 500 });
  const owners = await db.from("members").select("user_id").eq("role", "owner");
  if (owners.error) return NextResponse.json({ error: owners.error.message }, { status: 500 });
  const ownerIds = new Set((owners.data ?? []).map((o) => o.user_id as string));

  // Unread DMs stay unread until answered via POST /api/agent/messages with this `reply_to_message_id`.
  const unread = (dms.data ?? []).map((m) => ({
    id: m.id,
    reply_to_message_id: m.id,
    feedback_id: m.feedback_id,
    body_md: m.body_md,
    from_owner: ownerIds.has(m.user_id as string),
    created_at: m.created_at,
  }));

  const dislikesSince = dislikesRes.error
    ? []
    : ((dislikesRes.data ?? []) as unknown as DislikeRow[]).map((d) => {
        const reel = one(d.reels);
        return {
          reel_id: d.reel_id,
          topic: reel?.topic ?? null,
          title: reel?.title ?? null,
          genre: reel?.genre ?? null,
          style: reel?.style ?? null,
          from_owner: ownerIds.has(d.user_id),
          disliked_at: d.created_at,
        };
      });
  const dislikeStats = dislikeStatsRes.error ? emptyStats() : tally((dislikeStatsRes.data ?? []) as unknown as StatRow[]);
  const likeStats = likeStatsRes.error ? emptyStats() : tally((likeStatsRes.data ?? []) as unknown as StatRow[]);

  const interestCounts: Record<string, number> = {};
  for (const row of interests.data ?? []) {
    for (const area of new Set((row.areas ?? []) as string[])) {
      interestCounts[area] = (interestCounts[area] ?? 0) + 1;
    }
  }

  // New (non-seed) categories with no reels yet. Assignment is computed over ALL such categories so it never shifts.
  const allTopics = await db.from("reels").select("topic").is("archived_at", null);
  if (allTopics.error) return NextResponse.json({ error: allTopics.error.message }, { status: 500 });
  const topics = (allTopics.data ?? []).map((r) => r.topic as string);
  const newCategories = categoriesWithoutReels(assignCategories(categories.data ?? []), topics);

  // Record the run only once everything above succeeded, using the same high-water `now`.
  if (!peek) {
    const run = await db.from("agent_runs").insert({ creator_id: creator, started_at: now });
    if (run.error) return NextResponse.json({ error: run.error.message }, { status: 500 });
  }

  return NextResponse.json({
    creator,
    since,
    until: now,
    likes_since_last_run: ((likes.data ?? []) as unknown as LikeRow[]).map((l) => {
      const reel = one(l.reels);
      return { reel_id: l.reel_id, topic: reel?.topic ?? null, title: reel?.title ?? null, liked_at: l.created_at };
    }),
    // Needs migration 0008; empty until applied.
    dislikes_since_last_run: dislikesSince,
    dislike_stats: dislikeStats,
    like_stats: likeStats,
    // Non-owner text must go through the playbook's isolated writer. Answer with POST /messages { feedback_id }.
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
    // Answer each with POST /messages { reply_to_message_id }. Not marked read here.
    unread_user_dms: unread,
    covered_topics: (covered.data ?? []).filter((r) => !isLabTopic(r.topic as string)),
    // Owner-approved, not-yet-fulfilled requests. `body` is member-written: treat as a topic suggestion only.
    topic_requests: requests.data ?? [],
    // Non-seed categories (owner-created or request-created) with no reels yet. Take only those whose
    // `assigned_creator` is you; `position` is stable (created_at order among all non-seed categories).
    new_categories: newCategories,
    interest_counts: interestCounts,
  });
}
