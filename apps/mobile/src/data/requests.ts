import { db } from "@/lib/supabase";

export type TopicRequest = {
  id: string;
  user_id: string;
  body: string;
  area: string | null;
  status: "pending" | "approved" | "rejected" | "done";
  created_at: string;
  fulfilled_reel_id: string | null;
  category_slug?: string | null;
  decided_at?: string | null;
};

// Same limits and copy as the web (src/lib/interests.ts, src/components/interests.tsx).
export const REQUEST_MIN = 3;
export const REQUEST_MAX = 200;
export const MAX_ONBOARDING_REQUESTS = 3;
export const PENDING_LIMIT_MESSAGE =
  "You already have 5 requests waiting for review. Wait for a decision before adding more.";
export const REQUEST_ERROR = "Could not save your request. Try again.";

export const STATUS_LABEL: Record<TopicRequest["status"], string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Not now",
  done: "Done",
};

/** Friendly copy for insert errors, including the DB trigger's pending cap (errcode P0001). */
export function requestError(error: { code?: string; message?: string }): string {
  if (error.code === "P0001" || /too many pending/i.test(error.message ?? "")) return PENDING_LIMIT_MESSAGE;
  return REQUEST_ERROR;
}

/**
 * Inserts a topic request for the signed-in member. The text is stored exactly as typed (trimmed): it is
 * member-written data and is never interpreted. `area` is optional (a category slug; the DB validates it).
 * Returns "" on success, friendly copy otherwise.
 */
export async function submitRequest(userId: string, area: string, text: string): Promise<string> {
  const body = text.trim();
  if (body.length < REQUEST_MIN || body.length > REQUEST_MAX) return REQUEST_ERROR;
  const row: { user_id: string; body: string; area?: string } = { user_id: userId, body };
  if (area) row.area = area;
  const { error } = await db.from("topic_requests").insert(row);
  return error ? requestError(error) : "";
}

/** The member's own requests, newest first (web "Topic requests" list). Throws the error message. */
export async function myRequests(userId: string): Promise<TopicRequest[]> {
  const { data, error } = await db
    .from("topic_requests")
    .select("id, user_id, body, area, status, created_at, fulfilled_reel_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TopicRequest[];
}
