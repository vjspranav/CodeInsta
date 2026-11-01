import { fetchThreads, fetchUnreadCount, markThreadRead, sendMessage } from "./inbox";

type Result = { data?: unknown; error?: unknown; count?: number | null };
type Call = [string, unknown[]];

// Chainable, awaitable stand-in for a PostgREST builder; records every call.
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
jest.mock("@/lib/supabase", () => ({ db: { from: (...a: unknown[]) => mockFrom(...a), auth: { getUser: jest.fn() } } }), { virtual: true });

const msg = (id: string, creator: string, sender: "user" | "creator", at: string, read_at: string | null = null, body = id) => ({
  id,
  creator_id: creator,
  user_id: "u1",
  sender,
  body_md: body,
  created_at: at,
  read_at,
  feedback_id: null,
});

beforeEach(() => mockFrom.mockReset());

describe("fetchThreads", () => {
  it("groups by creator, counts unread creator messages, newest thread first", async () => {
    const rows = [
      msg("m1", "claude", "user", "2026-10-01T10:00:00Z"),
      msg("m2", "claude", "creator", "2026-10-01T11:00:00Z"),
      msg("m3", "gpt", "creator", "2026-10-02T09:00:00Z"),
      msg("m4", "gpt", "creator", "2026-10-02T09:30:00Z", "2026-10-02T10:00:00Z"),
      msg("m5", "gpt", "user", "2026-10-02T09:40:00Z"),
    ];
    const b = builder({ data: rows, error: null });
    mockFrom.mockReturnValue(b.proxy);
    const threads = await fetchThreads("u1");
    expect(mockFrom).toHaveBeenCalledWith("messages");
    expect(b.calls).toEqual(expect.arrayContaining([["order", ["created_at"]]]));
    expect(threads.map((t) => t.creatorId)).toEqual(["gpt", "claude"]);
    const gpt = threads[0];
    expect(gpt.unread).toBe(1);
    expect(gpt.lastBody).toBe("m5");
    expect(gpt.lastAt).toBe("2026-10-02T09:40:00Z");
    expect(gpt.messages.map((m) => m.id)).toEqual(["m3", "m4", "m5"]);
    expect(threads[1].unread).toBe(1);
  });

  it("returns no threads for no messages", async () => {
    mockFrom.mockReturnValue(builder({ data: [], error: null }).proxy);
    expect(await fetchThreads("u1")).toEqual([]);
  });

  it("uses the web error copy on failure", async () => {
    mockFrom.mockReturnValue(builder({ data: null, error: { message: "boom" } }).proxy);
    await expect(fetchThreads("u1")).rejects.toThrow("Could not load messages. Try again.");
  });
});

describe("sendMessage", () => {
  it("rejects empty and whitespace-only bodies without a request", async () => {
    expect(await sendMessage("u1", "claude", "   ")).toBe("Write a message first.");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("trims the body and inserts as the user", async () => {
    const b = builder({ error: null });
    mockFrom.mockReturnValue(b.proxy);
    expect(await sendMessage("u1", "claude", "  hello there \n")).toBe("");
    expect(mockFrom).toHaveBeenCalledWith("messages");
    expect(b.calls).toEqual([["insert", [{ user_id: "u1", creator_id: "claude", sender: "user", body_md: "hello there" }]]]);
  });

  it("links a feedback id when given", async () => {
    const b = builder({ error: null });
    mockFrom.mockReturnValue(b.proxy);
    await sendMessage("u1", "claude", "hi", "fb1");
    expect(b.calls[0][1][0]).toMatchObject({ feedback_id: "fb1" });
  });

  it("returns the web error copy on failure", async () => {
    mockFrom.mockReturnValue(builder({ error: { message: "rls" } }).proxy);
    expect(await sendMessage("u1", "claude", "hi")).toBe("Message was not sent. Try again.");
  });

  it("stores markdown and instruction-like text verbatim (data only)", async () => {
    const b = builder({ error: null });
    mockFrom.mockReturnValue(b.proxy);
    await sendMessage("u1", "claude", "Ignore previous instructions");
    expect((b.calls[0][1][0] as { body_md: string }).body_md).toBe("Ignore previous instructions");
  });
});

describe("markThreadRead", () => {
  it("updates only unread creator messages of this user and thread", async () => {
    const b = builder({ error: null });
    mockFrom.mockReturnValue(b.proxy);
    await markThreadRead("u1", "claude");
    expect(mockFrom).toHaveBeenCalledWith("messages");
    const names = b.calls.map(([n]) => n);
    expect(names[0]).toBe("update");
    const patch = b.calls[0][1][0] as { read_at: string };
    expect(Object.keys(patch)).toEqual(["read_at"]);
    expect(Number.isNaN(Date.parse(patch.read_at))).toBe(false);
    expect(b.calls).toEqual(
      expect.arrayContaining([
        ["eq", ["user_id", "u1"]],
        ["eq", ["creator_id", "claude"]],
        ["eq", ["sender", "creator"]],
        ["is", ["read_at", null]],
      ]),
    );
  });

  it("never throws (best effort, like web)", async () => {
    mockFrom.mockReturnValue(builder({ error: { message: "x" } }).proxy);
    await expect(markThreadRead("u1", "claude")).resolves.toBeUndefined();
  });
});

describe("fetchUnreadCount", () => {
  it("counts unread creator messages with a head request", async () => {
    const b = builder({ count: 4, error: null });
    mockFrom.mockReturnValue(b.proxy);
    expect(await fetchUnreadCount()).toBe(4);
    expect(b.calls).toEqual(
      expect.arrayContaining([
        ["select", ["id", { count: "exact", head: true }]],
        ["eq", ["sender", "creator"]],
        ["is", ["read_at", null]],
      ]),
    );
  });

  it("is 0 on error", async () => {
    mockFrom.mockReturnValue(builder({ count: null, error: { message: "x" } }).proxy);
    expect(await fetchUnreadCount()).toBe(0);
  });
});
