import { askStatusLabel, ASKS_LOAD_ERROR, buildAsks, fetchAsks, type FeedbackRow } from "./asks";

type Result = { data?: unknown; error?: unknown };
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
jest.mock("@/lib/supabase", () => ({ db: { from: (...a: unknown[]) => mockFrom(...a) } }));

const fb = (id: string, at: string, over: Partial<FeedbackRow> = {}): FeedbackRow => ({
  id,
  creator_id: "claude",
  reel_id: `r-${id}`,
  wants: "dm",
  body: `question ${id}`,
  status: "open",
  created_at: at,
  reels: { id: `r-${id}`, title: `Reel ${id}` },
  ...over,
});

beforeEach(() => mockFrom.mockReset());

describe("buildAsks", () => {
  it("joins answers, newest first, and marks status", () => {
    const asks = buildAsks(
      [
        fb("a", "2026-11-01T10:00:00Z"),
        fb("b", "2026-11-02T10:00:00Z", { wants: "reel", reels: [{ id: "r-b", title: "Reel b" }] }),
        fb("c", "2026-11-03T10:00:00Z"),
        fb("d", "2026-11-03T11:00:00Z", { status: "answered" }),
      ],
      [{ id: "ans-b", title: "Deeper b", answers_feedback_id: "b" }],
      [
        { id: "m2", feedback_id: "a", created_at: "2026-11-01T12:00:00Z" },
        { id: "m1", feedback_id: "a", created_at: "2026-11-01T11:00:00Z" },
      ],
    );
    expect(asks.map((a) => a.id)).toEqual(["d", "c", "b", "a"]);
    const byId = Object.fromEntries(asks.map((a) => [a.id, a]));
    expect(byId.a).toMatchObject({ status: "answered", answerMessageId: "m1", answerReel: null, reelTitle: "Reel a" });
    expect(byId.b).toMatchObject({ status: "answered", wants: "reel", answerReel: { id: "ans-b", title: "Deeper b" }, reelTitle: "Reel b" });
    expect(byId.c).toMatchObject({ status: "waiting", answerMessageId: null, answerReel: null });
    expect(byId.d.status).toBe("answered");
  });

  it("keeps an ask whose reel was deleted", () => {
    const [ask] = buildAsks([fb("x", "2026-11-01T10:00:00Z", { reel_id: null, reels: null })], [], []);
    expect(ask).toMatchObject({ reelId: null, reelTitle: null, status: "waiting" });
  });
});

describe("fetchAsks", () => {
  it("reads own questions, creator answers, and live answer reels", async () => {
    const feedback = builder({ data: [fb("a", "2026-11-01T10:00:00Z")], error: null });
    const messages = builder({ data: [], error: null });
    const reels = builder({ data: [{ id: "ans", title: "Answer", answers_feedback_id: "a" }], error: null });
    mockFrom.mockImplementation((table: string) => ({ feedback, messages, reels })[table]!.proxy);
    const asks = await fetchAsks("u1");
    expect(asks[0]).toMatchObject({ id: "a", status: "answered", answerReel: { id: "ans", title: "Answer" } });
    expect(feedback.calls).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(feedback.calls).toContainEqual(["eq", ["kind", "question"]]);
    expect(String(feedback.calls[0][1][0])).toContain("reels!feedback_reel_id_fkey(id, title)");
    expect(messages.calls).toContainEqual(["eq", ["sender", "creator"]]);
    expect(reels.calls).toContainEqual(["in", ["answers_feedback_id", ["a"]]]);
    expect(reels.calls).toContainEqual(["is", ["archived_at", null]]);
  });

  it("skips the reel lookup with no questions", async () => {
    const empty = builder({ data: [], error: null });
    mockFrom.mockReturnValue(empty.proxy);
    expect(await fetchAsks("u1")).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalledWith("reels");
  });

  it("throws the load copy on error", async () => {
    mockFrom.mockReturnValue(builder({ data: null, error: { message: "boom" } }).proxy);
    await expect(fetchAsks("u1")).rejects.toThrow(ASKS_LOAD_ERROR);
  });
});

describe("copy", () => {
  it("names the creator while waiting", () => {
    expect(askStatusLabel({ status: "waiting" }, "GPT")).toBe("Waiting for GPT");
    expect(askStatusLabel({ status: "answered" }, "GPT")).toBe("Answered");
  });
});
