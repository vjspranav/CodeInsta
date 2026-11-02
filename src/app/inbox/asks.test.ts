import { describe, expect, it } from "vitest";
import {
  askStatusLabel,
  ASKS_LOAD_ERROR,
  buildAsks,
  fetchAsks,
  sentCopy,
  threadTimeline,
  waitingPreview,
  type Ask,
  type AsksDb,
  type FeedbackRow,
} from "./asks";

type Result = { data?: unknown; error?: unknown };

// Chainable, awaitable stand-in for a PostgREST builder; records every call.
function builder(result: Result) {
  const calls: [string, unknown[]][] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return (res: (v: Result) => unknown) => Promise.resolve(result).then(res);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return { proxy, calls };
}
const dbOf = (tables: Record<string, ReturnType<typeof builder>>) =>
  ({ from: (table: string) => tables[table].proxy }) as unknown as AsksDb;

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
    expect(byId.b).toMatchObject({ status: "answered", wants: "reel", answerReel: { id: "ans-b", title: "Deeper b" } });
    expect(byId.c).toMatchObject({ status: "waiting", answerMessageId: null, answerReel: null });
    expect(byId.d.status).toBe("answered");
  });
});

describe("fetchAsks", () => {
  it("reads own questions, creator answers and live answer reels", async () => {
    const feedback = builder({ data: [fb("a", "2026-11-01T10:00:00Z")], error: null });
    const messages = builder({ data: [{ id: "m", feedback_id: "a", created_at: "2026-11-01T11:00:00Z" }], error: null });
    const reels = builder({ data: [], error: null });
    const asks = await fetchAsks(dbOf({ feedback, messages, reels }), "u1");
    expect(asks[0]).toMatchObject({ id: "a", status: "answered", answerMessageId: "m" });
    expect(feedback.calls).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(feedback.calls).toContainEqual(["eq", ["kind", "question"]]);
    expect(String(feedback.calls[0][1][0])).toContain("reels!feedback_reel_id_fkey(id, title)");
    expect(messages.calls).toContainEqual(["eq", ["sender", "creator"]]);
    expect(reels.calls).toContainEqual(["in", ["answers_feedback_id", ["a"]]]);
    expect(reels.calls).toContainEqual(["is", ["archived_at", null]]);
  });

  it("throws the load copy on error", async () => {
    const bad = builder({ data: null, error: { message: "boom" } });
    await expect(fetchAsks(dbOf({ feedback: bad, messages: bad, reels: bad }), "u1")).rejects.toThrow(ASKS_LOAD_ERROR);
  });
});

describe("threadTimeline", () => {
  const ask = (id: string, creatorId: string, createdAt: string): Ask => ({
    id,
    creatorId,
    reelId: null,
    reelTitle: null,
    body: id,
    wants: "dm",
    createdAt,
    status: "waiting",
    answerMessageId: null,
    answerReel: null,
  });
  it("merges this creator's asks with messages, oldest first", () => {
    const items = threadTimeline(
      [
        { id: "m1", creator_id: "claude", created_at: "2026-10-01T11:00:00Z" },
        { id: "m2", creator_id: "gpt", created_at: "2026-10-01T11:00:00Z" },
      ],
      [ask("a1", "claude", "2026-10-01T10:00:00Z"), ask("a2", "gpt", "2026-10-01T10:30:00Z"), ask("a3", "claude", "2026-10-01T12:00:00Z")],
      "claude",
    );
    expect(items.map((i) => i.key)).toEqual(["a:a1", "m:m1", "a:a3"]);
  });
});

describe("copy", () => {
  it("matches the mobile app", () => {
    expect(askStatusLabel({ status: "waiting" }, "GPT")).toBe("Waiting for GPT");
    expect(askStatusLabel({ status: "answered" }, "GPT")).toBe("Answered");
    expect(waitingPreview(1, "Claude")).toBe("1 question waiting for Claude");
    expect(waitingPreview(2, "Claude")).toBe("2 questions waiting for Claude");
    expect(sentCopy("Claude", "dm")).toBe("Claude will answer in your Inbox, usually within the hour.");
    expect(sentCopy("GPT", "reel")).toBe("GPT will make a reel about it. Track it in your Inbox.");
  });
});
