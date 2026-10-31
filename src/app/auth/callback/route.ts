import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { bootstrapOwner } from "@/lib/supabase/membership";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await serverDb();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await bootstrapOwner(db, data.user);
      return NextResponse.redirect(new URL("/", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}
