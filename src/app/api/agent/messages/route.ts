import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  body_md: z.string().min(1),
  feedback_id: z.uuid().optional(),
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
  const { body_md, feedback_id } = body.data;
  const db = getSupabaseAdmin();

  let userId: string | null = null;
  if (feedback_id) {
    const fb = await db
      .from("feedback")
      .select("user_id")
      .eq("id", feedback_id)
      .eq("creator_id", creator)
      .maybeSingle();
    if (fb.error) return NextResponse.json({ error: fb.error.message }, { status: 500 });
    if (!fb.data) return NextResponse.json({ error: "feedback not found for this creator" }, { status: 400 });
    userId = fb.data.user_id;
  } else {
    // Single-user app: the recipient is whoever most recently interacted at all.
    const latest = async (table: string, column: string, userOnly = false) => {
      let q = db.from(table).select(`user_id, ${column}`);
      if (userOnly) q = q.eq("sender", "user");
      return q.order(column, { ascending: false }).limit(1).maybeSingle();
    };
    const results = await Promise.all([
      latest("likes", "created_at"),
      latest("feedback", "created_at"),
      latest("messages", "created_at", true),
    ]);
    const err = results.find((r) => r.error);
    if (err?.error) return NextResponse.json({ error: err.error.message }, { status: 500 });
    let best: { user_id: string; at: string } | null = null;
    for (const r of results) {
      const row = r.data as unknown as { user_id: string; created_at: string } | null;
      if (row && (!best || row.created_at > best.at)) best = { user_id: row.user_id, at: row.created_at };
    }
    userId = best?.user_id ?? null;
  }
  if (!userId) return NextResponse.json({ error: "no user to message yet" }, { status: 409 });

  const inserted = await db
    .from("messages")
    .insert({ creator_id: creator, user_id: userId, feedback_id: feedback_id ?? null, sender: "creator", body_md })
    .select("id")
    .single();
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });

  if (feedback_id) {
    const upd = await db
      .from("feedback")
      .update({ status: "answered", answered_at: new Date().toISOString() })
      .eq("id", feedback_id);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.data.id }, { status: 201 });
}
