import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/supabase";
import type { Creator } from "@shared/types";
import type { Ask } from "./asks";

/** `messages` row as the web inbox reads it (select *). RLS limits rows to the signed-in member. */
export type Message = {
  id: string;
  creator_id: string;
  user_id: string;
  sender: "creator" | "user";
  body_md: string;
  created_at: string;
  read_at: string | null;
  feedback_id?: string | null;
};

export type Thread = {
  creatorId: string;
  lastBody: string;
  lastAt: string;
  unread: number;
  messages: Message[];
};

/** Web copy (src/components/inbox.tsx). */
export const LOAD_ERROR = "Could not load messages. Try again.";
export const SEND_ERROR = "Message was not sent. Try again.";
export const EMPTY_MESSAGE = "Write a message first.";
/** Web caps the reply box at 10000 characters. */
export const MESSAGE_MAX = 10000;
/** Web polls every 15 s while the page is visible. */
export const INBOX_POLL_MS = 15000;

/**
 * Threads grouped from `messages` by creator, newest thread first. Messages inside a thread are oldest
 * first (the order the chat renders). Creators with no messages have no thread; the UI lists every
 * creator and looks the thread up. Message text is data and is never interpreted.
 */
export async function fetchThreads(userId: string): Promise<Thread[]> {
  const { data, error } = await db.from("messages").select("*").eq("user_id", userId).order("created_at");
  if (error) throw new Error(LOAD_ERROR);
  const groups = new Map<string, Message[]>();
  for (const message of (data ?? []) as Message[]) {
    const list = groups.get(message.creator_id);
    if (list) list.push(message);
    else groups.set(message.creator_id, [message]);
  }
  const threads: Thread[] = [];
  for (const [creatorId, messages] of groups) {
    const last = messages[messages.length - 1];
    threads.push({
      creatorId,
      lastBody: last.body_md,
      lastAt: last.created_at,
      unread: messages.filter((m) => m.sender === "creator" && !m.read_at).length,
      messages,
    });
  }
  return threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** Inserts a message as the user (RLS: owner only). "" on success, web error copy otherwise. */
export async function sendMessage(
  userId: string,
  creatorId: string,
  body: string,
  feedbackId?: string,
): Promise<string> {
  const text = body.trim();
  if (!text) return EMPTY_MESSAGE;
  if (text.length > MESSAGE_MAX) return SEND_ERROR;
  const row: Record<string, string> = { user_id: userId, creator_id: creatorId, sender: "user", body_md: text };
  if (feedbackId) row.feedback_id = feedbackId;
  const { error } = await db.from("messages").insert(row);
  return error ? SEND_ERROR : "";
}

/** Marks the creator's unread messages in a thread read. Best effort: never throws (web parity). */
export async function markThreadRead(userId: string, creatorId: string): Promise<void> {
  try {
    await db
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("creator_id", creatorId)
      .eq("sender", "creator")
      .is("read_at", null);
  } catch {
    // Reading state is cosmetic; the next poll retries.
  }
}

/** Unread creator messages across all threads (RLS scopes this to the signed-in member). 0 on error. */
export async function fetchUnreadCount(): Promise<number> {
  try {
    const { count, error } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender", "creator")
      .is("read_at", null);
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export const UNREAD_KEY = ["inbox", "unread"] as const;

/** Badge count for the Inbox tab. Needs a QueryClientProvider (Task 2.6 queryClient). */
export function useUnreadCount(): number {
  const { data } = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnreadCount,
    refetchInterval: INBOX_POLL_MS,
    staleTime: INBOX_POLL_MS,
  });
  return data ?? 0;
}

/** One row of a thread: a creator or user message, or one of the member's questions. */
export type ThreadItem =
  | { kind: "message"; key: string; at: string; message: Message }
  | { kind: "ask"; key: string; at: string; ask: Ask };

/**
 * A thread as a timeline: messages and the member's questions to this creator, oldest first, so a
 * question sits right above the DM that answers it. A thread with no messages still shows its asks.
 */
export function threadTimeline(messages: Message[], asks: Ask[], creatorId: string): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages.map((message) => ({ kind: "message" as const, key: `m:${message.id}`, at: message.created_at, message })),
    ...asks
      .filter((ask) => ask.creatorId === creatorId)
      .map((ask) => ({ kind: "ask" as const, key: `a:${ask.id}`, at: ask.createdAt, ask })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === b.kind ? 0 : a.kind === "ask" ? -1 : 1));
}

/** Short local time, the same format as the web inbox. */
export function shortTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Questions shown under each creator in the list; the thread shows all of them. */
export const ASKS_PER_CREATOR = 3;

export type InboxListRow =
  | { type: "thread"; key: string; creator: Creator; thread?: Thread; waiting: number }
  | { type: "ask"; key: string; ask: Ask; creatorName: string }
  | { type: "more"; key: string; creator: Creator; count: number };

/** Each creator's thread row, then that creator's latest questions with their status. */
export function inboxRows(creators: Creator[], threads: Thread[] | undefined, asks: Ask[] | undefined): InboxListRow[] {
  const rows: InboxListRow[] = [];
  for (const creator of creators) {
    const mine = (asks ?? []).filter((a) => a.creatorId === creator.id);
    const thread = threads?.find((t) => t.creatorId === creator.id);
    rows.push({ type: "thread", key: `t:${creator.id}`, creator, thread, waiting: mine.filter((a) => a.status === "waiting").length });
    for (const ask of mine.slice(0, ASKS_PER_CREATOR))
      rows.push({ type: "ask", key: `a:${ask.id}`, ask, creatorName: creator.display_name });
    if (mine.length > ASKS_PER_CREATOR) rows.push({ type: "more", key: `more:${creator.id}`, creator, count: mine.length });
  }
  return rows;
}
