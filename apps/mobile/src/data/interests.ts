import { db } from "@/lib/supabase";

export const SAVE_INTERESTS_ERROR = "Could not save your interests. Try again.";

/** Upserts the member's interests and marks onboarding done (web `saveInterests`). "" on success. */
export async function saveInterests(userId: string, areas: string[]): Promise<string> {
  const { error } = await db
    .from("user_interests")
    .upsert({ user_id: userId, areas, onboarded: true }, { onConflict: "user_id" });
  return error ? SAVE_INTERESTS_ERROR : "";
}
