import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export async function GET() {
  const raw = randomBytes(32).toString("hex");
  const response = NextResponse.json(
    { nonce: createHash("sha256").update(raw).digest("hex") },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set("g_nonce", raw, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/auth/google",
    maxAge: 600,
  });
  return response;
}
