"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getMembershipAdmin, requireOwner } from "@/lib/supabase/membership";
export async function createInvite(_previous: { error: string }, form: FormData) {
  await requireOwner();
  const uses = Number(form.get("uses"));
  if (!Number.isSafeInteger(uses) || uses < 1 || uses > 2147483647)
    return { error: "Enter a whole number of uses between 1 and 2147483647." };
  const { error } = await getMembershipAdmin().from("invites").insert({ code: randomBytes(10).toString("hex").toUpperCase(), max_uses: uses });
  if (error) return { error: "Could not create an invite. Please retry." };
  revalidatePath("/invites");
  return { error: "" };
}
