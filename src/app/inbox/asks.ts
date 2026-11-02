// Ask tracking (read side). Mirrors apps/mobile/src/data/asks.ts and inbox.ts so both apps show the same thing.
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
/** Questions shown under each creator in the thread list; the thread shows all of them. */
export const ASKS_PER_CREATOR = 3;

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

type Res = { data: unknown; error: unknown };
type Query = PromiseLike<Res> & {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  is(column: string, value: null): Query;
  not(column: string, op: string, value: unknown): Query;
  order(column: string, opts?: { ascending?: boolean }): Query;
};
/** The slice of the Supabase client this module uses (browserDb() satisfies it). */
export type AsksDb = { from(table: string): Query };

/** The signed-in member's questions with their status and answer links. Throws ASKS_LOAD_ERROR. */
export async function fetchAsks(db: AsksDb, userId: string): Promise<Ask[]> {
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
  const rows = (feedback.data ?? []) as FeedbackRow[];
  let reels: AnswerReelRow[] = [];
  if (rows.length) {
    const answer = await db
      .from("reels")
      .select("id, title, answers_feedback_id, created_at")
      .in("answers_feedback_id", rows.map((r) => r.id))
      .is("archived_at", null);
    if (answer.error) throw new Error(ASKS_LOAD_ERROR);
    reels = (answer.data ?? []) as AnswerReelRow[];
  }
  return buildAsks(rows, reels, (messages.data ?? []) as AnswerMessageRow[]);
}

/** Short status line: "Waiting for Claude" or "Answered". */
export function askStatusLabel(ask: Pick<Ask, "status">, creatorName: string): string {
  return ask.status === "answered" ? "Answered" : `Waiting for ${creatorName}`;
}

/** Thread-list preview when a creator has not written yet. */
export function waitingPreview(waiting: number, creatorName: string): string {
  return waiting === 1 ? `1 question waiting for ${creatorName}` : `${waiting} questions waiting for ${creatorName}`;
}

/** Post-send confirmation: where the answer will arrive (same copy as the mobile sheet). */
export function sentCopy(who: string, wants: "dm" | "reel"): string {
  return wants === "reel"
    ? `${who} will make a reel about it. Track it in your Inbox.`
    : `${who} will answer in your Inbox, usually within the hour.`;
}

type TimelineMessage = { id: string; creator_id: string; created_at: string };
export type TimelineItem<M> = { kind: "message"; key: string; at: string; message: M } | { kind: "ask"; key: string; at: string; ask: Ask };

/** A thread as a timeline, oldest first, so a question sits right above the DM that answers it. */
export function threadTimeline<M extends TimelineMessage>(messages: M[], asks: Ask[], creatorId: string): TimelineItem<M>[] {
  const items: TimelineItem<M>[] = [
    ...messages
      .filter((m) => m.creator_id === creatorId)
      .map((message) => ({ kind: "message" as const, key: `m:${message.id}`, at: message.created_at, message })),
    ...asks.filter((a) => a.creatorId === creatorId).map((ask) => ({ kind: "ask" as const, key: `a:${ask.id}`, at: ask.createdAt, ask })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === b.kind ? 0 : a.kind === "ask" ? -1 : 1));
}

/** Short local time, the same format as the message bubbles. */
export function shortTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
