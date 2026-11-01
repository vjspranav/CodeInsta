import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { bootstrapOwner } from "@/lib/supabase/membership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

/**
 * Owner bootstrap for native sign-in (mirrors web /auth/google and /auth/callback).
 * The role is decided server-side only: the Supabase access token is verified with
 * Supabase Auth, then `bootstrapOwner` applies the allowlisted-email plus
 * Google-provider rule. Nothing else in the request is read.
 */
export async function POST(request: Request) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return json({ error: "Unauthorized" }, 401);
  const token = match[1];
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return json({ error: "Unauthorized" }, 401);
    await bootstrapOwner(db, data.user);
    const { data: member, error: readError } = await db
      .from("members")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (readError) throw new Error("members read failed");
    const role = member?.role === "owner" || member?.role === "member" ? member.role : null;
    return json({ role });
  } catch {
    return json({ error: "Could not complete bootstrap." }, 500);
  }
}
