import { getRandomBytes } from "expo-crypto";
import { isValidSlug } from "@shared/validation";
import { db } from "@/lib/supabase";
import type { TopicRequest } from "./requests";

export const REVIEW_ERROR = "Could not review request. Try again.";
export const SLUG_ERROR = "Use 2 to 40 lowercase letters, numbers or hyphens for the slug.";
export const LABEL_ERROR = "Enter a category label (up to 60 characters).";
export const INVITE_USES_ERROR = "Enter a whole number of uses between 1 and 2147483647.";
export const INVITE_CREATE_ERROR = "Could not create an invite. Please retry.";
export const INVITE_LIST_ERROR = "Could not load invites. Please refresh.";
export const LOAD_REQUESTS_ERROR = "Could not load requests.";

export const MAX_INVITE_USES = 2147483647;
const DAY_MS = 86_400_000;

/** Web `slugFromLabel` (src/components/review-requests.tsx): suggested slug while typing a label. */
export const slugFromLabel = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Owner only (RLS): number of requests waiting for review. 0 on any error, like web. */
export async function pendingCount(): Promise<number> {
  try {
    const { count, error } = await db
      .from("topic_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export type PendingReview = {
  pending: TopicRequest[];
  /** Last 10 decided requests, newest decision first. */
  history: TopicRequest[];
  /** user_id to email, for display. */
  emails: Record<string, string>;
};

/** Owner review queue (web /admin/requests). Throws the error message on failure. */
export async function listPending(): Promise<PendingReview> {
  const [pending, history, members] = await Promise.all([
    db.from("topic_requests").select("*").eq("status", "pending").order("created_at"),
    db
      .from("topic_requests")
      .select("*")
      .neq("status", "pending")
      .not("decided_at", "is", null)
      .order("decided_at", { ascending: false })
      .limit(10),
    db.from("members").select("user_id, email"),
  ]);
  for (const result of [pending, history, members])
    if (result.error) throw new Error(result.error.message || LOAD_REQUESTS_ERROR);
  return {
    pending: (pending.data ?? []) as TopicRequest[],
    history: (history.data ?? []) as TopicRequest[],
    emails: Object.fromEntries(
      ((members.data ?? []) as { user_id: string; email: string }[]).map((m) => [m.user_id, m.email]),
    ),
  };
}

export type ReviewInput = {
  requestId: string;
  decision: "new_category" | "existing" | "reject";
  slug?: string;
  label?: string;
  description?: string;
};

/**
 * Owner decision on a topic request via the `review_topic_request` RPC. The slug is validated client-side
 * first (the RPC re-checks). Returns "" on success, an error message otherwise.
 */
export async function reviewRequest(input: ReviewInput): Promise<string> {
  const { requestId, decision } = input;
  const slug = input.slug?.trim() ?? "";
  const label = input.label?.trim() ?? "";
  if (decision !== "reject" && !isValidSlug(slug)) return SLUG_ERROR;
  if (decision === "new_category" && (label.length < 1 || label.length > 60)) return LABEL_ERROR;
  const { error } = await db.rpc("review_topic_request", {
    request_id: requestId,
    decision,
    slug: decision === "reject" ? null : slug,
    label: decision === "new_category" ? label : null,
    description: input.description?.trim() || null,
  });
  return error ? error.message || REVIEW_ERROR : "";
}

export type Invite = { code: string; uses: number; max_uses: number; expires_at: string | null; note?: string | null };

/** 10 uppercase hex characters, same format as `npm run invite -- create`. */
export function inviteCode(): string {
  return Array.from(getRandomBytes(5), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Owner only (RLS `invites_owner_all`). Returns the new invite code; throws an Error with friendly copy
 * when the input is invalid or the insert fails.
 */
export async function createInvite(input: { uses: number; days?: number; note?: string }): Promise<string> {
  const { uses, days } = input;
  if (!Number.isSafeInteger(uses) || uses < 1 || uses > MAX_INVITE_USES) throw new Error(INVITE_USES_ERROR);
  if (days !== undefined && (!Number.isFinite(days) || days <= 0)) throw new Error(INVITE_CREATE_ERROR);
  const code = inviteCode();
  const { error } = await db.from("invites").insert({
    code,
    note: input.note?.trim() || null,
    max_uses: uses,
    expires_at: days === undefined ? null : new Date(Date.now() + days * DAY_MS).toISOString(),
  });
  if (error) throw new Error(INVITE_CREATE_ERROR);
  return code;
}

/** Owner only: invites newest first. Throws friendly copy on failure. */
export async function listInvites(): Promise<Invite[]> {
  const { data, error } = await db
    .from("invites")
    .select("code, uses, max_uses, expires_at, note")
    .order("created_at", { ascending: false });
  if (error) throw new Error(INVITE_LIST_ERROR);
  return (data ?? []) as Invite[];
}
