import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/supabase/allowlist";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await serverDb();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (isAllowed(data.user.email))
        return NextResponse.redirect(new URL("/", url.origin));
      await db.auth.signOut();
      return NextResponse.redirect(new URL("/not-invited", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}
