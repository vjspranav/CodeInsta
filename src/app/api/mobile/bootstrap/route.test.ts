import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getUser: vi.fn(),
  bootstrap: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
vi.mock("@/lib/supabase/membership", () => ({ bootstrapOwner: mocks.bootstrap }));
import { POST } from "./route";

const owner = { id: "owner-id", email: "me@example.com", app_metadata: { providers: ["google"] } };
function request(headers: Record<string, string> = { authorization: "Bearer access-token" }) {
  return new Request("https://codeinsta.test/api/mobile/bootstrap", { method: "POST", headers });
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  mocks.getUser.mockResolvedValue({ data: { user: owner }, error: null });
  mocks.bootstrap.mockResolvedValue(undefined);
  mocks.maybeSingle.mockResolvedValue({ data: { role: "owner" }, error: null });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.create.mockReturnValue({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: mocks.eq }) }),
  });
});

describe("POST /api/mobile/bootstrap", () => {
  it.each([[{}], [{ authorization: "" }], [{ authorization: "Basic abc" }], [{ authorization: "Bearer" }]])(
    "returns 401 without a bearer token (%o)",
    async (headers) => {
      const response = await POST(request(headers));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.bootstrap).not.toHaveBeenCalled();
    },
  );

  it("returns 401 for an invalid token and does not bootstrap", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("builds a user-scoped client from the bearer header and verifies the token server-side", async () => {
    await POST(request());
    const [url, key, options] = mocks.create.mock.calls[0];
    expect(url).toBe("https://project.supabase.test");
    expect(key).toBe("anon");
    expect(options.global.headers.Authorization).toBe("Bearer access-token");
    expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
    expect(mocks.getUser).toHaveBeenCalledWith("access-token");
  });

  it("bootstraps the owner once and returns the role re-read from members", async () => {
    const response = await POST(request());
    expect(mocks.bootstrap).toHaveBeenCalledTimes(1);
    expect(mocks.bootstrap).toHaveBeenCalledWith(expect.anything(), owner);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner-id");
    expect(mocks.bootstrap.mock.invocationCallOrder[0]).toBeLessThan(mocks.maybeSingle.mock.invocationCallOrder[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: "owner" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns role null for a non-allowlisted user without throwing", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: null });
  });

  it("returns a plain member role", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { role: "member" }, error: null });
    expect(await (await POST(request())).json()).toEqual({ role: "member" });
  });

  it("ignores anything the client sends about its role", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { role: "member" }, error: null });
    const response = await POST(
      new Request("https://codeinsta.test/api/mobile/bootstrap?role=owner", {
        method: "POST",
        headers: { authorization: "Bearer access-token", "x-role": "owner", "x-ci-owner": "1", "content-type": "application/json" },
        body: JSON.stringify({ role: "owner", isOwner: true }),
      }),
    );
    expect(await response.json()).toEqual({ role: "member" });
    expect(mocks.bootstrap).toHaveBeenCalledWith(expect.anything(), owner);
  });

  it("returns a generic 500 when bootstrapOwner throws", async () => {
    mocks.bootstrap.mockRejectedValue(new Error("secret internal detail access-token"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain("secret");
    expect(text).not.toContain("access-token");
  });

  it("returns a generic 500 when the members read fails", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("db down");
  });

  it("never echoes the token or provider details", async () => {
    const text = await (await POST(request())).text();
    expect(text).not.toContain("access-token");
    expect(text).not.toContain("google");
    expect(text).not.toContain("me@example.com");
  });
});
