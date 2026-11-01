import { createInvite, inviteCode, listInvites, listPending, pendingCount, reviewRequest, slugFromLabel } from "./owner";

type Result = { data?: unknown; error?: unknown; count?: number | null };
type Call = [string, unknown[]];
function builder(result: Result) {
  const calls: Call[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return { proxy, calls };
}
const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({ db: { from: (...a: unknown[]) => mockFrom(...a), rpc: (...a: unknown[]) => mockRpc(...a) } }), { virtual: true });
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256)),
}));
beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("reviewRequest", () => {
  it("rejects an invalid slug before any RPC call", async () => {
    for (const slug of ["A", "Bad Slug", "x", "has_underscore", "a".repeat(41), ""]) {
      const msg = await reviewRequest({ requestId: "r1", decision: "new_category", slug, label: "Label" });
      expect(msg).not.toBe("");
    }
    expect(await reviewRequest({ requestId: "r1", decision: "existing", slug: "NOPE" })).not.toBe("");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls review_topic_request with the exact parameter names (new category)", async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await reviewRequest({ requestId: "r1", decision: "new_category", slug: "graphics", label: " Graphics ", description: "GPU stuff" })).toBe("");
    expect(mockRpc).toHaveBeenCalledWith("review_topic_request", {
      request_id: "r1",
      decision: "new_category",
      slug: "graphics",
      label: "Graphics",
      description: "GPU stuff",
    });
    expect(Object.keys(mockRpc.mock.calls[0][1]).sort()).toEqual(["decision", "description", "label", "request_id", "slug"]);
  });

  it("passes the existing slug and a null label", async () => {
    mockRpc.mockResolvedValue({ error: null });
    await reviewRequest({ requestId: "r2", decision: "existing", slug: "aosp" });
    expect(mockRpc).toHaveBeenCalledWith("review_topic_request", { request_id: "r2", decision: "existing", slug: "aosp", label: null, description: null });
  });

  it("rejects without a slug or label", async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await reviewRequest({ requestId: "r3", decision: "reject" })).toBe("");
    expect(mockRpc).toHaveBeenCalledWith("review_topic_request", { request_id: "r3", decision: "reject", slug: null, label: null, description: null });
  });

  it("requires a label for a new category", async () => {
    expect(await reviewRequest({ requestId: "r1", decision: "new_category", slug: "graphics", label: "  " })).not.toBe("");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC error message", async () => {
    mockRpc.mockResolvedValue({ error: { message: "only the owner can review" } });
    expect(await reviewRequest({ requestId: "r1", decision: "reject" })).toBe("only the owner can review");
  });
});

describe("pendingCount", () => {
  it("counts pending requests with a head request", async () => {
    const b = builder({ count: 3, error: null });
    mockFrom.mockReturnValue(b.proxy);
    expect(await pendingCount()).toBe(3);
    expect(mockFrom).toHaveBeenCalledWith("topic_requests");
    expect(b.calls).toEqual([
      ["select", ["id", { count: "exact", head: true }]],
      ["eq", ["status", "pending"]],
    ]);
  });

  it("is 0 on error", async () => {
    mockFrom.mockReturnValue(builder({ count: null, error: { message: "x" } }).proxy);
    expect(await pendingCount()).toBe(0);
  });

  it("is 0 when the call throws", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("offline");
    });
    expect(await pendingCount()).toBe(0);
  });
});

describe("listPending", () => {
  it("returns pending, history and an email map", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "members"
        ? builder({ data: [{ user_id: "u1", email: "a@b.c" }], error: null }).proxy
        : builder({ data: [{ id: "r1", user_id: "u1", body: "topic" }], error: null }).proxy,
    );
    const out = await listPending();
    expect(out.pending).toHaveLength(1);
    expect(out.history).toHaveLength(1);
    expect(out.emails).toEqual({ u1: "a@b.c" });
  });

  it("throws when any query fails", async () => {
    mockFrom.mockImplementation((table: string) =>
      builder(table === "members" ? { data: null, error: { message: "denied" } } : { data: [], error: null }).proxy,
    );
    await expect(listPending()).rejects.toThrow("denied");
  });
});

describe("invites", () => {
  it("code is 10 uppercase hex characters", () => {
    for (let i = 0; i < 20; i++) expect(inviteCode()).toMatch(/^[A-F0-9]{10}$/);
  });

  it("inserts into invites and returns the code", async () => {
    const b = builder({ error: null });
    mockFrom.mockReturnValue(b.proxy);
    const code = await createInvite({ uses: 3, days: 7, note: " for alice " });
    expect(code).toMatch(/^[A-F0-9]{10}$/);
    expect(mockFrom).toHaveBeenCalledWith("invites");
    const row = b.calls[0][1][0] as { code: string; max_uses: number; note: string; expires_at: string };
    expect(row).toMatchObject({ code, max_uses: 3, note: "for alice" });
    expect(Date.parse(row.expires_at)).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  it("has no expiry or note by default", async () => {
    const b = builder({ error: null });
    mockFrom.mockReturnValue(b.proxy);
    await createInvite({ uses: 1 });
    expect(b.calls[0][1][0]).toMatchObject({ max_uses: 1, note: null, expires_at: null });
  });

  it("rejects bad use counts without a request", async () => {
    for (const uses of [0, -1, 1.5, NaN, 2147483648]) await expect(createInvite({ uses })).rejects.toThrow("whole number of uses");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("throws friendly copy when the insert fails", async () => {
    mockFrom.mockReturnValue(builder({ error: { message: "rls" } }).proxy);
    await expect(createInvite({ uses: 1 })).rejects.toThrow("Could not create an invite. Please retry.");
  });

  it("lists invites newest first", async () => {
    const b = builder({ data: [{ code: "AAAAAAAAAA", uses: 0, max_uses: 1, expires_at: null }], error: null });
    mockFrom.mockReturnValue(b.proxy);
    expect(await listInvites()).toHaveLength(1);
    expect(b.calls).toEqual(expect.arrayContaining([["order", ["created_at", { ascending: false }]]]));
  });

  it("throws friendly copy when listing fails", async () => {
    mockFrom.mockReturnValue(builder({ data: null, error: { message: "x" } }).proxy);
    await expect(listInvites()).rejects.toThrow("Could not load invites. Please refresh.");
  });
});

describe("slugFromLabel", () => {
  it("matches the web suggestion", () => {
    expect(slugFromLabel("Graphics & GPUs!")).toBe("graphics-gpus");
    expect(slugFromLabel("Café Internals")).toBe("cafe-internals");
  });
});
