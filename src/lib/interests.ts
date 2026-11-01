export const MAX_ONBOARDING_REQUESTS = 3;
export const REQUEST_MIN = 3;
export const REQUEST_MAX = 200;
export const PENDING_LIMIT_MESSAGE =
  "You already have 5 requests waiting for review. Wait for a decision before adding more.";

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

export function requestError(error: { code?: string; message?: string }): string {
  if (error.code === "P0001" || /too many pending/i.test(error.message ?? "")) return PENDING_LIMIT_MESSAGE;
  return "Could not save your request. Try again.";
}
