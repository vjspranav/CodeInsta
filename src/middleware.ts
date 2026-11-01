import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwnerUser } from "@/lib/supabase/allowlist";
import {
  createMembershipCookie,
  MEMBERSHIP_COOKIE,
  MEMBERSHIP_TTL_SECONDS,
  readMembershipCookie,
} from "@/lib/supabase/membership-cookie";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/agent/") || path === "/api/agent")
    return NextResponse.next();
  // Native app bootstrap authenticates itself with a bearer token (no cookies).
  if (path === "/api/mobile/bootstrap" || path === "/api/mobile/signup") return NextResponse.next();
  let response = NextResponse.next({ request });
  const publicPage = ["/login", "/join", "/auth/callback", "/auth/google", "/auth/google/nonce", "/auth/bootstrap", "/not-invited", "/privacy", "/about"].includes(
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
  // The one unavoidable network call: verify the session with Supabase Auth.
  const {
    data: { user },
  } = await db.auth.getUser();
  const isOwner = isOwnerUser(user);
  const redirect = (to: string) => {
    const result = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    return result;
  };
  const cacheMembership = async (role: "owner" | "member", uid: string) => {
    const value = await createMembershipCookie(role, uid);
    if (value)
      response.cookies.set(MEMBERSHIP_COOKIE, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: MEMBERSHIP_TTL_SECONDS,
      });
  };
  if (user && path !== "/auth/bootstrap" && path !== "/auth/callback" && path !== "/auth/google" && path !== "/auth/google/nonce") {
    let role: "owner" | "member" | null = await readMembershipCookie(
      request.cookies.get(MEMBERSHIP_COOKIE)?.value,
      user.id,
    );
    // An owner whose cached role isn't `owner` must be re-checked, or bootstrap could loop.
    if (!role || (isOwner && role !== "owner")) {
      const { data: member, error } = await db.from("members").select("role").eq("user_id", user.id).maybeSingle();
      if (error) return new NextResponse("Unable to check membership. Please retry.", { status: 503 });
      role = member?.role === "owner" || member?.role === "member" ? member.role : null;
      if (role) await cacheMembership(role, user.id);
    }
    if (isOwner && role !== "owner")
      return redirect(`/auth/bootstrap?next=${encodeURIComponent(path + request.nextUrl.search)}`);
    if (!isOwner && !role && !publicPage) return redirect("/join");
  }
  if (!user && !publicPage) return redirect("/login");
  if (!user && request.cookies.has(MEMBERSHIP_COOKIE)) response.cookies.delete(MEMBERSHIP_COOKIE);
  // Hand the verified owner flag to the root layout so it doesn't repeat the auth call.
  // The header is always overwritten here, so a client-supplied value is never trusted.
  const headers = new Headers(request.headers);
  headers.set("x-ci-owner", isOwner ? "1" : "0");
  const final = NextResponse.next({ request: { headers } });
  response.cookies.getAll().forEach((cookie) => final.cookies.set(cookie));
  final.headers.set("Cache-Control", "private, no-store");
  return final;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/).*)",
  ],
};
