import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn(), signOut: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({
  auth: { getUser: mocks.getUser, signOut: mocks.signOut },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
}) }));
// Use the real allowlist (alias is not configured in vitest, so point it at the actual module).
vi.mock("@/lib/supabase/allowlist", async () => await import("../lib/supabase/allowlist"));
import { middleware } from "../middleware";
import { isOwnerUser } from "../lib/supabase/allowlist";
const googleOwner = { id: "owner", email: "owner@example.com", app_metadata: { provider: "google", providers: ["google"] } };
const passwordOwner = { id: "owner", email: "owner@example.com", app_metadata: { provider: "email", providers: ["email"] } };
const request = (path: string) => new NextRequest(`https://codeinsta.test${path}`);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user", email: "friend@example.com" } } });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
});
describe("membership gate", () => {
  it("routes authenticated nonmembers to join without signing them out", async () => {
    const response = await middleware(request("/"));
    expect(response.headers.get("location")).toBe("https://codeinsta.test/join");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("allows members through", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { role: "member" }, error: null });
    expect((await middleware(request("/"))).headers.get("location")).toBeNull();
  });
  it("bootstraps owners missing an owner row and preserves their destination", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: googleOwner } });
    mocks.maybeSingle.mockResolvedValue({ data: { role: "member" }, error: null });
    expect((await middleware(request("/profiles"))).headers.get("location")).toBe("https://codeinsta.test/auth/bootstrap?next=%2Fprofiles");
    mocks.maybeSingle.mockResolvedValue({ data: { role: "owner" }, error: null });
    expect((await middleware(request("/profiles"))).headers.get("location")).toBeNull();
  });
  it("does not treat a password user with the owner email as owner", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: passwordOwner } });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await middleware(request("/profiles"))).headers.get("location")).toBe("https://codeinsta.test/join");
    mocks.maybeSingle.mockResolvedValue({ data: { role: "member" }, error: null });
    expect((await middleware(request("/profiles"))).headers.get("location")).toBeNull();
  });
  it("does not bootstrap a Google user whose email is not allowlisted", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...googleOwner, email: "stranger@example.com" } } });
    expect((await middleware(request("/"))).headers.get("location")).toBe("https://codeinsta.test/join");
  });
  it("allows public auth and join pages", async () => {
    for (const path of ["/join", "/login", "/auth/callback", "/auth/google", "/auth/google/nonce", "/not-invited", "/auth/bootstrap"])
      expect((await middleware(request(path))).headers.get("location")).toBeNull();
  });
  it("allows Google endpoints for signed-out users and owners awaiting bootstrap", async () => {
    for (const user of [null, googleOwner]) {
      mocks.getUser.mockResolvedValue({ data: { user } });
      for (const path of ["/auth/google", "/auth/google/nonce"])
        expect((await middleware(request(path))).headers.get("location")).toBeNull();
    }
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
  it("does not touch agent API authentication", async () => {
    expect((await middleware(request("/api/agent/reels"))).headers.get("location")).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("routes signed-out users to login", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await middleware(request("/"))).headers.get("location")).toBe("https://codeinsta.test/login");
  });
  it("fails closed on a membership lookup error", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await middleware(request("/"))).status).toBe(503);
  });
});

describe("isOwnerUser", () => {
  it("is true for a Google user with an allowlisted email", () => {
    expect(isOwnerUser(googleOwner)).toBe(true);
    expect(isOwnerUser({ email: "OWNER@example.com", app_metadata: { providers: ["email", "google"] } })).toBe(true);
  });
  it("is false for a password user with the owner email", () => {
    expect(isOwnerUser(passwordOwner)).toBe(false);
  });
  it("is false for a Google user whose email is not allowlisted", () => {
    expect(isOwnerUser({ email: "stranger@example.com", app_metadata: { providers: ["google"] } })).toBe(false);
  });
  it("is false for missing user, email or provider metadata", () => {
    expect(isOwnerUser(null)).toBe(false);
    expect(isOwnerUser(undefined)).toBe(false);
    expect(isOwnerUser({ app_metadata: { providers: ["google"] } })).toBe(false);
    expect(isOwnerUser({ email: "owner@example.com" })).toBe(false);
    expect(isOwnerUser({ email: "owner@example.com", app_metadata: {} })).toBe(false);
  });
});
