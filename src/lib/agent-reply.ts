/**
 * Creator replies. The recipient is NEVER chosen by the caller or inferred from activity:
 * it is derived from the original feedback/message row, fetched under the authenticated creator.
 * Insert + answered/read marking happen atomically in the agent_send_reply RPC (migration 0009).
 */

type Err = { code?: string; message: string } | null;
type Result = { data: unknown; error: Err };

/** The slice of the Supabase client this module needs (structural, so tests can fake it). */
/** Chainable filter: .eq(...).eq(...).maybeSingle(). */
export interface ReplyQuery {
  eq(col: string, val: string): ReplyQuery;
  maybeSingle(): PromiseLike<Result>;
}
export interface ReplyDb {
  from(table: string): {
    select(cols: string): ReplyQuery;
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result>;
}

export type ReplyInput = { body_md: string; feedback_id?: string; reply_to_message_id?: string };
export type ReplyOutcome = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string): ReplyOutcome => ({ status, body: { error } });

export async function sendReply(db: ReplyDb, creator: string, input: ReplyInput): Promise<ReplyOutcome> {
  const { body_md, feedback_id, reply_to_message_id } = input;
  if (!feedback_id && !reply_to_message_id) {
    return fail(400, "feedback_id or reply_to_message_id is required (take it from the inbox)");
  }

  let feedbackUser: string | null = null;
  if (feedback_id) {
    const fb = (await db.from("feedback").select("user_id").eq("id", feedback_id).eq("creator_id", creator).maybeSingle()) as Result;
    if (fb.error) return fail(500, fb.error.message);
    if (!fb.data) return fail(404, "feedback not found for this creator");
    feedbackUser = (fb.data as { user_id: string }).user_id;
  }
  if (reply_to_message_id) {
    const m = (await db
      .from("messages")
      .select("user_id")
      .eq("id", reply_to_message_id)
      .eq("creator_id", creator)
      .eq("sender", "user")
      .maybeSingle()) as Result;
    if (m.error) return fail(500, m.error.message);
    if (!m.data) return fail(404, "message not found for this creator");
    if (feedbackUser && (m.data as { user_id: string }).user_id !== feedbackUser) {
      return fail(400, "feedback_id and reply_to_message_id belong to different users");
    }
  }

  // The RPC re-checks ownership under row locks, inserts the reply and marks the original answered/read.
  const res = await db.rpc("agent_send_reply", {
    p_creator: creator,
    p_feedback_id: feedback_id ?? null,
    p_reply_to_message_id: reply_to_message_id ?? null,
    p_body: body_md,
  });
  if (res.error) {
    const { code, message } = res.error;
    if (code === "P0002") return fail(404, message);
    if (code === "P0001" || code === "23505") return fail(409, message);
    if (code === "22023") return fail(400, message);
    if (code === "PGRST202" || /could not find the function/i.test(message)) {
      return fail(503, "agent_send_reply is missing: apply migration 0009_reply_targets.sql");
    }
    return fail(500, message);
  }
  return { status: 201, body: { id: res.data as string } };
}
