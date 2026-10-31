import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), bootstrap: vi.fn(), create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("@/lib/supabase/membership", () => ({ bootstrapOwner: mocks.bootstrap }));
import { POST } from "./route";
import { GET } from "./nonce/route";
const raw = "a".repeat(64);
function request(csrf: string | null = "csrf", cookieCsrf: string | null = "csrf", nonce: string | null = raw, credential: string | null = "id-token") {
  const body = new URLSearchParams();
  if (csrf !== null) body.set("g_csrf_token", csrf);
  if (credential !== null) body.set("credential", credential);
  const cookies = [cookieCsrf !== null ? `g_csrf_token=${cookieCsrf}` : "", nonce !== null ? `g_nonce=${nonce}` : ""].filter(Boolean).join("; ");
  return new NextRequest("https://codeinsta.test/auth/google", { method: "POST", body, headers: { cookie: cookies } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bootstrap.mockResolvedValue(undefined);
  mocks.signIn.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.create.mockImplementation((_url, _key, options) => ({ auth: { signInWithIdToken: async (input: unknown) => {
    const result = await mocks.signIn(input);
    if (!result.error) options.cookies.setAll([{ name: "sb-session", value: "session", options: { path: "/", httpOnly: true } }]);
    return result;
  } } }));
});
describe("Google redirect boundary", () => {
  it.each([[null, "csrf"], ["csrf", null], ["", ""], ["wrong", "csrf"]])("rejects absent or mismatched CSRF (%s, %s)", async (body, cookie) => {
    expect((await POST(request(body, cookie))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([null, "", "malformed"])("rejects a missing or malformed nonce (%s) before authentication", async (nonce) => {
    const response = await POST(request("csrf", "csrf", nonce));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://codeinsta.test/login?error=google");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("passes the raw nonce for signed-token verification and preserves session cookies", async () => {
    const response = await POST(request());
    expect(mocks.signIn).toHaveBeenCalledWith({ provider: "google", token: "id-token", nonce: raw });
    expect(mocks.bootstrap).toHaveBeenCalledWith(expect.anything(), { id: "user" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://codeinsta.test/");
    expect(response.cookies.get("sb-session")?.value).toBe("session");
    expect(response.cookies.get("g_nonce")?.maxAge).toBe(0);
  });
  it("fails closed when Supabase rejects a token/nonce mismatch", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: "nonce mismatch" } });
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/login?error=google");
    expect(response.cookies.get("g_nonce")?.maxAge).toBe(0);
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
  it("rejects missing credentials", async () => {
    expect((await POST(request("csrf", "csrf", raw, null))).headers.get("location")).toContain("/login?error=google");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("redirects to login on bootstrap failure", async () => {
    mocks.bootstrap.mockRejectedValue(new Error("unavailable"));
    expect((await POST(request())).headers.get("location")).toContain("/login?error=google");
  });
});
describe("Google nonce issuance", () => {
  it("returns only the hash and sets a short-lived cross-site POST cookie", async () => {
    const response = await GET();
    const cookie = response.cookies.get("g_nonce")!;
    expect(cookie.value).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "none", path: "/auth/google", maxAge: 600 });
    expect(await response.json()).toEqual({ nonce: createHash("sha256").update(cookie.value).digest("hex") });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await GET()).cookies.get("g_nonce")?.value).not.toBe(cookie.value);
  });
});
