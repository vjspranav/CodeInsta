import { DAILY_ASKS } from "@shared/validation";

import { asksLeft, askQuestion } from "./asks";
import { makeFakeDb } from "./fakeDb.testutil";

const mockFake = { current: makeFakeDb() };
jest.mock("@/lib/supabase", () => ({
  db: new Proxy({}, { get: (_t, key) => (mockFake.current.db as never)[key] }),
}));

beforeEach(() => {
  mockFake.current = makeFakeDb("user-1");
});

const recent = (n: number, user = "user-1") => {
  mockFake.current.rows.feedback = Array.from({ length: n }, () => ({
    user_id: user,
    created_at: new Date(Date.now() - 3600_000).toISOString(),
  }));
};

describe("asksLeft", () => {
  it("returns DAILY_ASKS with no recent questions, then 0 after three", async () => {
    expect(await asksLeft("user-1", false)).toBe(DAILY_ASKS);
    recent(3);
    expect(await asksLeft("user-1", false)).toBe(0);
  });

  it("counts only the last 24 hours and only this user", async () => {
    mockFake.current.rows.feedback = [
      { user_id: "user-1", created_at: new Date(Date.now() - 25 * 3600_000).toISOString() },
      { user_id: "other", created_at: new Date(Date.now() - 3600_000).toISOString() },
      { user_id: "user-1", created_at: new Date(Date.now() - 3600_000).toISOString() },
    ];
    expect(await asksLeft("user-1", false)).toBe(DAILY_ASKS - 1);
  });

  it("never goes below 0", async () => {
    recent(5);
    expect(await asksLeft("user-1", false)).toBe(0);
  });

  it("owner is unlimited (null) and issues no query", async () => {
    expect(await asksLeft("user-1", true)).toBeNull();
    expect(mockFake.current.calls).toHaveLength(0);
  });

  it("a failed count is best effort: full allowance (the DB trigger is the real limit)", async () => {
    mockFake.current.failures["feedback.select"] = { message: "boom" };
    expect(await asksLeft("user-1", false)).toBe(DAILY_ASKS);
  });
});

describe("askQuestion", () => {
  const input = { reelId: "r1", creatorId: "claude", body: "  why?  ", wants: "dm" as const };

  it("inserts the same column set as web and returns an empty string", async () => {
    expect(await askQuestion(input)).toBe("");
    expect(mockFake.current.rows.feedback).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        creator_id: "claude",
        reel_id: "r1",
        body: "why?",
        kind: "question",
        wants: "dm",
      }),
    ]);
  });

  it("supports wants reel and a null reel id", async () => {
    await askQuestion({ ...input, reelId: null, wants: "reel" });
    expect(mockFake.current.rows.feedback[0]).toMatchObject({ reel_id: null, wants: "reel" });
  });

  it("returns the daily-limit copy when the trigger rejects", async () => {
    mockFake.current.failures["feedback.insert"] = {
      message: "Daily question limit reached (3 per 24 hours). Try again later.",
    };
    expect(await askQuestion(input)).toBe(
      `You've used all ${DAILY_ASKS} questions for today. Try again later.`,
    );
  });

  it("returns the generic copy for any other failure", async () => {
    mockFake.current.failures["feedback.insert"] = { message: "network" };
    expect(await askQuestion(input)).toBe("Could not send. Please try again.");
  });

  it("returns the generic copy and does not insert for an empty body or no session", async () => {
    expect(await askQuestion({ ...input, body: "   " })).toBe("Could not send. Please try again.");
    mockFake.current = makeFakeDb(null);
    expect(await askQuestion(input)).toBe("Could not send. Please try again.");
    expect(mockFake.current.calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });
});
