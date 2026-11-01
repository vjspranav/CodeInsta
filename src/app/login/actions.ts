"use server";
import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase/server";
import { bootstrapOwner } from "@/lib/supabase/membership";
import { createInvitedAccount } from "@/lib/supabase/signup";
export async function authenticate(
  _previous: { error: string },
  form: FormData,
) {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const signup = form.get("mode") === "signup";
  const invite = String(form.get("invite") ?? "").trim();
  if (signup) {
    const created = await createInvitedAccount(email, password, invite);
    if ("error" in created) return { error: created.error };
  } else if (password.length < 8) {
    return { error: "Use a password with at least 8 characters." };
  }
  const db = await serverDb();
  const { error, data } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (!data.session)
    return { error: "Check your email to confirm your account, then sign in." };
  await bootstrapOwner(db, data.user!);
  if (signup) {
    const { data: redeemed, error: redeemError } = await db.rpc("redeem_invite", { invite });
    if (redeemError || !redeemed) redirect("/join?error=invite");
  }
  redirect("/");
}
export async function signOut() {
  const db = await serverDb();
  await db.auth.signOut();
  redirect("/login");
}
