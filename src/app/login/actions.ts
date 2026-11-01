"use server";
import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase/server";
import { getMembershipAdmin, bootstrapOwner } from "@/lib/supabase/membership";
import { validInvite } from "@/lib/supabase/invites";
import { isAllowed } from "@/lib/supabase/allowlist";
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
    if (!invite) return { error: "Enter an invite code to create an account." };
    // An invite proves membership eligibility, not ownership of an email address.
    // Never pre-confirm an owner address through the password signup path.
    if (isAllowed(email)) return { error: "Use Google to sign in with an owner email." };
    const { data, error } = await getMembershipAdmin().from("invites").select("max_uses, uses, expires_at").eq("code", invite).maybeSingle();
    if (error) return { error: "Could not check your invite. Please retry." };
    if (!validInvite(data)) return { error: "This invite is invalid, expired, or fully used." };
  }
  if (password.length < 8)
    return { error: "Use a password with at least 8 characters." };
  const db = await serverDb();
  // Invited accounts are created server-side (pre-confirmed). Anything signed up
  // through the public auth API must confirm its email, so it can't claim the
  // owner's address or get auto-linked to the owner's Google identity.
  if (signup) {
    const { error: createError } = await getMembershipAdmin().auth.admin.createUser({ email, password, email_confirm: true });
    if (createError) return { error: createError.message };
  }
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
