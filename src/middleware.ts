import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/supabase/allowlist";
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/agent/") || path === "/api/agent")
    return NextResponse.next();
  let response = NextResponse.next({ request });
  const publicPage = ["/login", "/auth/callback", "/not-invited"].includes(
    path,
  );
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return publicPage
      ? response
      : NextResponse.redirect(new URL("/login", request.url));
  }
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  const {
    data: { user },
  } = await db.auth.getUser();
  const redirect = (to: string) => {
    const result = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    return result;
  };
  if (user && !isAllowed(user.email)) {
    await db.auth.signOut();
    return path === "/not-invited" ? response : redirect("/not-invited");
  }
  if (!user && !publicPage) return redirect("/login");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/).*)",
  ],
};
