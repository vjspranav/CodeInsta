"use server";
import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/supabase/allowlist";
export async function authenticate(
  _previous: { error: string },
  form: FormData,
) {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!isAllowed(email))
    return {
      error: "This email is not invited. Use your invited email address.",
    };
  if (password.length < 8)
    return { error: "Use a password with at least 8 characters." };
  const db = await serverDb();
  const { error, data } =
    form.get("mode") === "signup"
      ? await db.auth.signUp({ email, password })
      : await db.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (!data.session)
    return { error: "Check your email to confirm your account, then sign in." };
  redirect("/");
}
export async function signOut() {
  const db = await serverDb();
  await db.auth.signOut();
  redirect("/login");
}
