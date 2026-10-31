import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { bootstrapOwner } from "@/lib/supabase/membership";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?error=google", request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("g_nonce", "", {
    httpOnly: true, secure: true, sameSite: "none", path: "/auth/google", maxAge: 0,
  });
  try {
    const form = await request.formData();
    const csrf = form.get("g_csrf_token");
    if (typeof csrf !== "string" || !csrf || csrf !== request.cookies.get("g_csrf_token")?.value) {
      return new NextResponse("Invalid CSRF token", { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const credential = form.get("credential");
    const raw = request.cookies.get("g_nonce")?.value;
    if (typeof credential !== "string" || !credential || !raw || !/^[a-f0-9]{64}$/.test(raw)) return response;

    const db = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (values) => {
            for (const { name, value, options } of values) {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    // Supabase verifies the signed token, including SHA-256(raw) against its nonce claim.
    const { data, error } = await db.auth.signInWithIdToken({ provider: "google", token: credential, nonce: raw });
    if (error || !data.user) return response;
    await bootstrapOwner(db, data.user);
    response.headers.set("Location", new URL("/", request.url).toString());
  } catch {
    // Do not expose credentials or provider error details in the redirect.
  }
  return response;
}
