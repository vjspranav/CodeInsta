import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const createUser = vi.fn();
  return {
    maybeSingle,
    createUser,
    admin: vi.fn(() => ({ auth: { admin: { createUser } }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) })),
  };
});
vi.mock("@/lib/supabase/membership", () => ({ getMembershipAdmin: mocks.admin }));
vi.mock("@/lib/supabase/invites", async () => await import("../../../../lib/supabase/invites"));
vi.mock("@/lib/supabase/allowlist", async () => await import("../../../../lib/supabase/allowlist"));
vi.mock("@/lib/supabase/signup", async () => await import("../../../../lib/supabase/signup"));
import { POST } from "./route";

function request(body: unknown, raw?: string) {
  return new Request("https://codeinsta.test/api/mobile/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}
const valid = { email: " Member@Example.com ", password: "password123", invite: " CODE " };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
  mocks.maybeSingle.mockResolvedValue({ data: { uses: 0, max_uses: 1, expires_at: null }, error: null });
  mocks.createUser.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/mobile/signup", () => {
  it("creates a pre-confirmed account with a lowercased email and no-store", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.createUser).toHaveBeenCalledWith({ email: "member@example.com", password: "password123", email_confirm: true });
  });

  it("rejects an invalid invite with the web message", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { uses: 1, max_uses: 1, expires_at: null }, error: null });
    const response = await POST(request(valid));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("This invite is invalid, expired, or fully used.");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("requires an invite", async () => {
    const response = await POST(request({ ...valid, invite: "  " }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Enter an invite code to create an account.");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("refuses an owner email even with a valid invite", async () => {
    const response = await POST(request({ ...valid, email: " OWNER@example.com " }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Use Google to sign in with an owner email.");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    const response = await POST(request({ ...valid, password: "short" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Use a password with at least 8 characters.");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("returns the createUser error without echoing the password", async () => {
    mocks.createUser.mockResolvedValue({ data: null, error: { message: "already registered" } });
    const response = await POST(request(valid));
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).toContain("already registered");
    expect(text).not.toContain("password123");
  });

  it.each([[null, "not json"], [{ email: "a@b.c" }, undefined], [{ ...valid, password: 5 }, undefined]])("rejects malformed bodies (%o)", async (body, raw) => {
    const response = await POST(request(body, raw));
    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("returns a generic 500 on unexpected errors", async () => {
    mocks.createUser.mockRejectedValue(new Error("secret db detail password123"));
    const response = await POST(request(valid));
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("password123");
  });
});
