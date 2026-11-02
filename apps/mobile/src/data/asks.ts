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

// ---- Ask tracking (read side) ----------------------------------------------------------------
// A question is answered either by a creator DM tied to it (messages.feedback_id) or by a reel
// published with --answers (reels.answers_feedback_id); both also set feedback.status = 'answered'.
// RLS already lets a member read their own feedback and messages, and every reel.

export type AskStatus = "waiting" | "answered";

export type Ask = {
  id: string;
  creatorId: string;
  reelId: string | null;
  reelTitle: string | null;
  body: string;
  wants: "dm" | "reel";
  createdAt: string;
  status: AskStatus;
  /** The creator DM that answers this question, when there is one. */
  answerMessageId: string | null;
  /** The reel published as the answer, when there is one (live reels only). */
  answerReel: { id: string; title: string } | null;
};

type ReelRef = { id: string; title: string };
export type FeedbackRow = {
  id: string;
  creator_id: string;
  reel_id: string | null;
  wants: string;
  body: string;
  status: string;
  created_at: string;
  reels?: ReelRef | ReelRef[] | null;
};
export type AnswerReelRow = { id: string; title: string; answers_feedback_id: string | null; created_at?: string };
export type AnswerMessageRow = { id: string; feedback_id: string | null; created_at: string };

export const ASKS_LOAD_ERROR = "Could not load your questions. Try again.";
export const asksKey = (userId: string) => ["inbox", "asks", userId] as const;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Pure join of a member's questions with their answers, newest question first. */
export function buildAsks(feedback: FeedbackRow[], reels: AnswerReelRow[], messages: AnswerMessageRow[]): Ask[] {
  const firstBy = <T extends { created_at?: string }>(rows: T[], key: (row: T) => string | null) => {
    const map = new Map<string, T>();
    for (const row of [...rows].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
      const k = key(row);
      if (k && !map.has(k)) map.set(k, row);
    }
    return map;
  };
  const reelBy = firstBy(reels, (r) => r.answers_feedback_id);
  const messageBy = firstBy(messages, (m) => m.feedback_id);
  return feedback
    .map((f): Ask => {
      const reel = one(f.reels);
      const answerReel = reelBy.get(f.id);
      const answerMessage = messageBy.get(f.id);
      return {
        id: f.id,
        creatorId: f.creator_id,
        reelId: f.reel_id,
        reelTitle: reel?.title ?? null,
        body: f.body,
        wants: f.wants === "reel" ? "reel" : "dm",
        createdAt: f.created_at,
        status: f.status === "answered" || answerReel || answerMessage ? "answered" : "waiting",
        answerMessageId: answerMessage?.id ?? null,
        answerReel: answerReel ? { id: answerReel.id, title: answerReel.title } : null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The signed-in member's questions with their status and answer links. Throws ASKS_LOAD_ERROR. */
export async function fetchAsks(userId: string): Promise<Ask[]> {
  const [feedback, messages] = await Promise.all([
    db
      .from("feedback")
      .select("id, creator_id, reel_id, wants, body, status, created_at, reels!feedback_reel_id_fkey(id, title)")
      .eq("user_id", userId)
      .eq("kind", "question")
      .order("created_at", { ascending: false }),
    db
      .from("messages")
      .select("id, feedback_id, created_at")
      .eq("user_id", userId)
      .eq("sender", "creator")
      .not("feedback_id", "is", null),
  ]);
  if (feedback.error || messages.error) throw new Error(ASKS_LOAD_ERROR);
  const rows = (feedback.data ?? []) as unknown as FeedbackRow[];
  let reels: AnswerReelRow[] = [];
  if (rows.length) {
    const answer = await db
      .from("reels")
      .select("id, title, answers_feedback_id, created_at")
      .in("answers_feedback_id", rows.map((r) => r.id))
      .is("archived_at", null);
    if (answer.error) throw new Error(ASKS_LOAD_ERROR);
    reels = (answer.data ?? []) as unknown as AnswerReelRow[];
  }
  return buildAsks(rows, reels, (messages.data ?? []) as unknown as AnswerMessageRow[]);
}

/** Short status line: "Waiting for Claude" or "Answered". */
export function askStatusLabel(ask: Pick<Ask, "status">, creatorName: string): string {
  return ask.status === "answered" ? "Answered" : `Waiting for ${creatorName}`;
}
