import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/supabase";

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
