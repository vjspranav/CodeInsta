import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const createUser = vi.fn();
  const db = { auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() }, rpc: vi.fn() };
  return { db, maybeSingle, createUser, bootstrap: vi.fn(), admin: vi.fn(() => ({ auth: { admin: { createUser } }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) })) };
});
vi.mock("@/lib/supabase/server", () => ({ serverDb: async () => mocks.db }));
vi.mock("@/lib/supabase/membership", () => ({ getMembershipAdmin: mocks.admin, bootstrapOwner: mocks.bootstrap }));
vi.mock("@/lib/supabase/invites", async () => await import("../../lib/supabase/invites"));
vi.mock("@/lib/supabase/allowlist", async () => await import("../../lib/supabase/allowlist"));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { authenticate } from "./actions";
afterEach(() => vi.unstubAllEnvs());
function form(email: string, mode = "signup", invite = "CODE") {
  const data = new FormData();
  Object.entries({ email, mode, invite, password: "password123" }).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
  mocks.maybeSingle.mockResolvedValue({ data: { uses: 0, max_uses: 1, expires_at: null }, error: null });
  const response = { data: { user: { id: "user", email: "member@example.com" }, session: {} }, error: null };
  mocks.createUser.mockResolvedValue({ data: {}, error: null });
  mocks.db.auth.signInWithPassword.mockResolvedValue(response);
  mocks.db.rpc.mockResolvedValue({ data: true, error: null });
});
describe("signup membership boundary", () => {
  it("rejects a missing invite before creating an account", async () => {
    expect((await authenticate({ error: "" }, form("member@example.com", "signup", ""))).error).toContain("invite");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("rejects an exhausted invite before creating an account", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { uses: 1, max_uses: 1, expires_at: null }, error: null });
    expect((await authenticate({ error: "" }, form("member@example.com"))).error).toContain("fully used");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("redeems a validated invite using the newly authenticated session", async () => {
    await expect(authenticate({ error: "" }, form("member@example.com"))).rejects.toThrow("redirect:/");
    expect(mocks.db.rpc).toHaveBeenCalledWith("redeem_invite", { invite: "CODE" });
  });
  it("sends a redemption race to join without claiming membership", async () => {
    mocks.db.rpc.mockResolvedValue({ data: false, error: null });
    await expect(authenticate({ error: "" }, form("member@example.com"))).rejects.toThrow("redirect:/join?error=invite");
  });
  it("creates the account server-side, signs in, then redeems, never using public signUp", async () => {
    const order: string[] = [];
    mocks.createUser.mockImplementation(async () => { order.push("create"); return { data: {}, error: null }; });
    mocks.db.auth.signInWithPassword.mockImplementation(async () => { order.push("signin"); return { data: { user: { id: "user", email: "member@example.com" }, session: {} }, error: null }; });
    mocks.db.rpc.mockImplementation(async () => { order.push("redeem"); return { data: true, error: null }; });
    await expect(authenticate({ error: "" }, form("member@example.com"))).rejects.toThrow("redirect:/");
    expect(mocks.createUser).toHaveBeenCalledWith({ email: "member@example.com", password: "password123", email_confirm: true });
    expect(mocks.db.auth.signUp).not.toHaveBeenCalled();
    expect(order).toEqual(["create", "signin", "redeem"]);
  });
  it("requires an invite even for the owner email (no owner exemption)", async () => {
    const result = await authenticate({ error: "" }, form(" OWNER@example.com ", "signup", ""));
    expect(result.error).toContain("invite");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.db.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
  it("rejects an owner-email password signup even with a valid invite", async () => {
    const result = await authenticate({ error: "" }, form(" OWNER@example.com "));
    expect(result.error).toContain("Google");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.db.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.db.rpc).not.toHaveBeenCalled();
  });
  it("returns the createUser error and does not sign in or redeem", async () => {
    mocks.createUser.mockResolvedValue({ data: null, error: { message: "already registered" } });
    expect((await authenticate({ error: "" }, form("member@example.com"))).error).toBe("already registered");
    expect(mocks.db.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.db.rpc).not.toHaveBeenCalled();
  });
  it("lets nonowners sign in without checking invites", async () => {
    await expect(authenticate({ error: "" }, form("member@example.com", "signin", ""))).rejects.toThrow("redirect:/");
    expect(mocks.db.auth.signInWithPassword).toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});
