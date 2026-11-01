import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { sendReply, type ReplyDb } from "@/lib/agent-reply";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A reply must name what it answers; the recipient is derived from that original row.
const bodySchema = z
  .object({
    body_md: z.string().min(1),
    feedback_id: z.uuid().optional(),
    reply_to_message_id: z.uuid().optional(),
  })
  .refine((v) => v.feedback_id || v.reply_to_message_id, {
    message: "feedback_id or reply_to_message_id is required",
    path: ["feedback_id"],
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
  const out = await sendReply(getSupabaseAdmin() as unknown as ReplyDb, creator, body.data);
  return NextResponse.json(out.body, { status: out.status });
}
