import { getMembershipAdmin } from "@/lib/supabase/membership";
import { validInvite } from "@/lib/supabase/invites";
import { isAllowed } from "@/lib/supabase/allowlist";

export type InvitedSignupResult = { ok: true } | { error: string };

/**
 * The one definition of invited password signup, shared by the web server action and
 * POST /api/mobile/signup so the rules cannot drift. Validates the invite with the admin
 * client, refuses owner/allowlisted emails, then creates the account server-side
 * pre-confirmed. Anything signed up through the public auth API must confirm its email,
 * so it could claim the owner's address; this path never does. It does not sign in or
 * redeem: the caller does that with the user's own session.
 */
export async function createInvitedAccount(rawEmail: string, password: string, rawInvite: string): Promise<InvitedSignupResult> {
  const email = rawEmail.trim().toLowerCase();
  const invite = rawInvite.trim();
  if (!invite) return { error: "Enter an invite code to create an account." };
  // An invite proves membership eligibility, not ownership of an email address.
  // Never pre-confirm an owner address through the password signup path.
  if (isAllowed(email)) return { error: "Use Google to sign in with an owner email." };
  const admin = getMembershipAdmin();
  const { data, error } = await admin.from("invites").select("max_uses, uses, expires_at").eq("code", invite).maybeSingle();
  if (error) return { error: "Could not check your invite. Please retry." };
  if (!validInvite(data)) return { error: "This invite is invalid, expired, or fully used." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) return { error: createError.message };
  return { ok: true };
}
