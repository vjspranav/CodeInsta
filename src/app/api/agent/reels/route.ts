import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { validateReel } from "@/lib/reel-schema";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  script: z.unknown(),
  parent_reel_id: z.uuid().optional(),
  answers_feedback_id: z.uuid().optional(),
});

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
  const validated = validateReel(body.data.script);
  if (!validated.ok) {
    return NextResponse.json({ error: "invalid reel script", errors: validated.errors }, { status: 400 });
  }
  const reel = validated.reel;
  const { parent_reel_id, answers_feedback_id } = body.data;
  const db = getSupabaseAdmin();

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

  const inserted = await db
    .from("reels")
    .insert({
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
      script: reel,
    })
    .select("id")
    .single();
  if (inserted.error) {
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

  return NextResponse.json({ id: inserted.data.id }, { status: 201 });
}
