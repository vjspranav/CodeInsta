import { NextResponse } from "next/server";
import { createInvitedAccount } from "@/lib/supabase/signup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

/**
 * Invited email signup for the native app. Runs exactly the same checks as the web
 * login action (shared `createInvitedAccount`): the account is created server-side,
 * pre-confirmed. The client then signs in with its own session and redeems the invite.
 * The password is never echoed or logged.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof input.email !== "string" || typeof input.password !== "string" || typeof input.invite !== "string") {
    return json({ error: "Invalid request." }, 400);
  }
  try {
    const result = await createInvitedAccount(input.email, input.password, input.invite);
    if ("error" in result) return json({ error: result.error }, 400);
    return json({ ok: true });
  } catch {
    return json({ error: "Could not create your account. Please retry." }, 500);
  }
}
