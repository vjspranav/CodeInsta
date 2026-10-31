import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOwnerUser } from "./allowlist";
import { serverDb } from "./server";
import { redirect } from "next/navigation";

export const getMembershipAdmin = getSupabaseAdmin;

export async function bootstrapOwner(db: SupabaseClient, user: User) {
  if (!isOwnerUser(user)) return;
  const { data, error } = await db.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("Could not check owner membership.");
  if (data?.role === "owner") return;
  const { error: writeError } = await getMembershipAdmin().from("members").upsert({ user_id: user.id, email: user.email!, role: "owner" });
  if (writeError) throw new Error("Could not initialize owner membership.");
}

export async function requireOwner() {
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  if (!isOwnerUser(user)) redirect("/");
  await bootstrapOwner(db, user);
  return user;
}
