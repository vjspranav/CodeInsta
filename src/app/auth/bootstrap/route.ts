import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { bootstrapOwner } from "@/lib/supabase/membership";
import { safeReturnPath } from "@/lib/supabase/invites";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));
  await bootstrapOwner(db, user);
  return NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("next")), url.origin));
}
