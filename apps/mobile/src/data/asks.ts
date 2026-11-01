import { DAILY_ASKS } from "@shared/validation";

import { db } from "@/lib/supabase";

const SEND_FAILED = "Could not send. Please try again.";
const LIMIT_REACHED = `You've used all ${DAILY_ASKS} questions for today. Try again later.`;

/** Id of the signed-in user from the locally stored session (no network round trip). */
export async function currentUserId(): Promise<string> {
  const { data } = await db.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Please sign in again.");
  return id;
}

/**
 * Questions a member can still ask today (rolling 24 hours). `null` for the owner (unlimited).
 * Best effort like web: the database trigger is the real limit, this only drives the counter, so
 * a failed count reports the full allowance.
 */
export async function asksLeft(userId: string, isOwner: boolean): Promise<number | null> {
  if (isOwner) return null;
  const { count, error } = await db
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  const asked = error ? 0 : (count ?? 0);
  return Math.max(0, DAILY_ASKS - asked);
}

export type AskInput = {
  reelId: string | null;
  creatorId: string;
  body: string;
  wants: "dm" | "reel";
};

/** Sends a question exactly like web's Feedback sheet. Returns "" on success, else the error copy. */
export async function askQuestion(input: AskInput): Promise<string> {
  const body = input.body.trim();
  if (!body) return SEND_FAILED;
  let userId: string;
  try {
    userId = await currentUserId();
  } catch {
    return SEND_FAILED;
  }
  const { error } = await db.from("feedback").insert({
    user_id: userId,
    creator_id: input.creatorId,
    reel_id: input.reelId,
    body,
    kind: "question",
    wants: input.wants,
  });
  if (!error) return "";
  return error.message?.includes("Daily question limit") ? LIMIT_REACHED : SEND_FAILED;
}
