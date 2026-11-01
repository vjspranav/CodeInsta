import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { validateReel, type Reel } from "@/lib/reel-schema";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOwnPosterUrl, isOwnVideoUrl, objectPathOf, VIDEO_BUCKET } from "./video";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  script: z.unknown(),
  parent_reel_id: z.uuid().optional(),
  answers_feedback_id: z.uuid().optional(),
  fulfills_request_id: z.uuid().optional(),
  video_url: z.string().max(500).optional(),
  poster_url: z.string().max(500).optional(),
  /** Archive this creator's live reel with the same topic right before inserting (republish). Same creator, same topic only. */
  replace: z.boolean().optional(),
});

const short = (max: number) => z.string().min(1).max(max);
/** Minimal server-side check for v3 story reels; the CLI runs the full validateStory (render/src/schema.ts) before upload. */
const storySchema = z
  .object({
    version: z.literal(3),
    format: z.literal("story"),
    title: short(200),
    topic: short(200),
    level: z.enum(["beginner", "intermediate", "advanced"]),
    tags: z.array(short(60)).max(30).default([]),
    glossary: z
      .array(z.object({ term: short(120), full: short(500), note: z.string().max(1000).optional() }))
      .max(60)
      .default([]),
    cast: z.array(z.object({ id: short(60) }).passthrough()).max(12).default([]),
    beats: z.array(z.object({ speaker: short(60), text: short(1500) }).passthrough()).min(1).max(80),
    sources: z.array(short(500)).max(30).optional(),
    series: short(120).optional(),
    series_index: z.number().int().min(1).max(10000).optional(),
    genre: z.string().optional(),
    style: z.string().optional(),
  })
  .passthrough();

export async function POST(req: Request) {
  const creator = authenticateAgent(req);
  if (!creator) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid body", errors: body.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) },
      { status: 400 },
    );
  }
  const rawScript = (body.data.script ?? {}) as Record<string, unknown>;
  const isStory = rawScript.version === 3 && rawScript.format === "story";
  const db = getSupabaseAdmin();

  let reel: Pick<Reel, "topic" | "title" | "hook" | "tags" | "level"> & { series?: string; series_index?: number };
  let stored: unknown;
  let videoCols: Record<string, unknown> = {};
  if (isStory) {
    const story = storySchema.safeParse(rawScript);
    if (!story.success) {
      return NextResponse.json(
        { error: "invalid story script", errors: story.error.issues.map((i) => `${i.path.join(".") || "script"}: ${i.message}`) },
        { status: 400 },
      );
    }
    const videoUrl = body.data.video_url;
    if (!videoUrl) return NextResponse.json({ error: "video_url is required for v3 story reels" }, { status: 400 });
    if (!isOwnVideoUrl(db, creator, videoUrl)) {
      return NextResponse.json({ error: "video_url must be a reel-video upload for this creator (use /api/agent/reels/upload-url)" }, { status: 400 });
    }
    const posterUrl = body.data.poster_url;
    if (posterUrl && !isOwnPosterUrl(db, creator, posterUrl)) {
      return NextResponse.json({ error: "poster_url must be a reel-video upload for this creator" }, { status: 400 });
    }
    const exists = async (url: string) => {
      const path = objectPathOf(db, creator, url);
      const dir = path.slice(0, path.lastIndexOf("/"));
      const name = path.slice(dir.length + 1);
      const listed = await db.storage.from(VIDEO_BUCKET).list(dir, { search: name, limit: 5 });
      return !listed.error && (listed.data ?? []).some((o) => o.name === name);
    };
    if (!(await exists(videoUrl))) return NextResponse.json({ error: "video_url: file has not been uploaded yet" }, { status: 400 });
    if (posterUrl && !(await exists(posterUrl))) return NextResponse.json({ error: "poster_url: file has not been uploaded yet" }, { status: 400 });
    const s3 = story.data;
    reel = {
      topic: s3.topic,
      title: s3.title,
      hook: s3.beats[0].text.slice(0, 300),
      tags: s3.tags,
      level: s3.level,
      series: s3.series,
      series_index: s3.series_index,
    };
    stored = posterUrl ? { ...rawScript, poster_url: posterUrl } : rawScript;
    videoCols = { video_url: videoUrl, glossary: s3.glossary };
  } else {
    const validated = validateReel(body.data.script);
    if (!validated.ok) {
      return NextResponse.json({ error: "invalid reel script", errors: validated.errors }, { status: 400 });
    }
    reel = validated.reel;
    stored = validated.reel;
  }
  const { parent_reel_id, answers_feedback_id, fulfills_request_id } = body.data;

  if (answers_feedback_id) {
    const fb = await db
      .from("feedback")
      .select("id")
      .eq("id", answers_feedback_id)
      .eq("creator_id", creator)
      .maybeSingle();
    if (fb.error) return NextResponse.json({ error: fb.error.message }, { status: 500 });
    if (!fb.data) return NextResponse.json({ error: "feedback not found for this creator" }, { status: 400 });
  }

  // genre/style are optional slugs (columns exist once migration 0008 is applied).
  const slug = (v: unknown): string | null =>
    typeof v === "string" && /^[a-z0-9-]{2,32}$/.test(v) ? v : null;
  const genre = slug(rawScript.genre);
  const style = slug(rawScript.style);
  const extra: Record<string, string> = {};
  if (genre) extra.genre = genre;
  if (style) extra.style = style;

  const row = {
      creator_id: creator,
      topic: reel.topic,
      title: reel.title,
      hook: reel.hook,
      tags: reel.tags,
      level: reel.level,
      series: reel.series ?? null,
      series_index: reel.series_index ?? null,
      parent_reel_id: parent_reel_id ?? null,
      answers_feedback_id: answers_feedback_id ?? null,
      script: stored,
      ...videoCols,
  };
  const doInsert = (r: Record<string, unknown>) => db.from("reels").insert(r).select("id").single();

  // replace: archive this creator's live reel on the same topic (frees the partial unique index) in the same request;
  // if the insert then fails the archive is undone, so a failed republish never leaves the topic without a live reel.
  let archivedId: string | null = null;
  if (body.data.replace) {
    const arch = await db
      .from("reels")
      .update({ archived_at: new Date().toISOString() })
      .eq("creator_id", creator)
      .eq("topic", reel.topic)
      .is("archived_at", null)
      .select("id");
    if (arch.error) return NextResponse.json({ error: `replace: ${arch.error.message}` }, { status: 500 });
    archivedId = arch.data?.[0]?.id ?? null;
  }
  const undoArchive = async () => {
    if (archivedId) await db.from("reels").update({ archived_at: null }).eq("id", archivedId).eq("creator_id", creator);
  };

  let inserted = await doInsert({ ...row, ...extra });
  // Unknown-column error (42703 / PostgREST PGRST204): database predates 0008, retry without genre/style.
  if (
    inserted.error &&
    Object.keys(extra).length > 0 &&
    (inserted.error.code === "42703" ||
      inserted.error.code === "PGRST204" ||
      /column .*(genre|style)|(genre|style).*column/i.test(inserted.error.message))
  ) {
    inserted = await doInsert(row);
  }
  if (inserted.error) {
    await undoArchive();
    if (inserted.error.code === "23505") {
      return NextResponse.json({ error: `topic already posted: ${reel.topic}` }, { status: 409 });
    }
    if (inserted.error.code === "23503") {
      return NextResponse.json({ error: "parent_reel_id does not exist" }, { status: 400 });
    }
    return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  }

  if (answers_feedback_id) {
    const upd = await db
      .from("feedback")
      .update({ status: "answered", answered_at: new Date().toISOString() })
      .eq("id", answers_feedback_id);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
  }

  if (fulfills_request_id) {
    const upd = await db
      .from("topic_requests")
      .update({ status: "done", fulfilled_reel_id: inserted.data.id, decided_at: new Date().toISOString() })
      .eq("id", fulfills_request_id)
      .eq("status", "approved");
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: inserted.data.id, creator_id: creator, ...(body.data.replace ? { archived_id: archivedId } : {}) },
    { status: 201 },
  );
}
