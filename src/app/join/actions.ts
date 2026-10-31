"use server";
import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase/server";
export async function join(_previous: { error: string }, form: FormData) {
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const invite = String(form.get("invite") ?? "").trim();
  if (!invite) return { error: "Enter your invite code." };
  const { data, error } = await db.rpc("redeem_invite", { invite });
  if (error) return { error: "Could not redeem your invite. Please retry." };
  if (!data) return { error: "This invite is invalid, expired, or fully used." };
  redirect("/");
}
