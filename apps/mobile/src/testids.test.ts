import { inboxThreadId, reelPageId, TID } from "./testids";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("TID", () => {
  const values = Object.values(TID) as string[];

  it("has unique values", () => {
    expect(new Set(values).size).toBe(values.length);
  });

  it("uses kebab-case values", () => {
    expect(values.filter((v) => !KEBAB.test(v))).toEqual([]);
  });

  it("keys equal values (so TID[\"x\"] reads like the Maestro id)", () => {
    for (const [k, v] of Object.entries(TID)) expect(v).toBe(k);
  });

  it("contains every id the plan and the Maestro flows name", () => {
    const required = [
      "login-google", "login-email", "login-password", "login-submit",
      "join-code", "join-submit",
      "tab-feed", "tab-explore", "tab-inbox", "tab-profiles",
      "reel-page", "reel-like", "reel-dislike", "reel-ask", "reel-sound", "reel-pause",
      "reel-undo", "reel-glossary", "reel-share", "reel-next-part", "reel-retry",
      "ask-input", "ask-send", "dm-input", "dm-send",
      "request-input", "request-send", "review-approve", "review-reject",
      "pending-badge", "streak-chip", "inbox-thread",
    ];
    expect(required.filter((id) => !values.includes(id))).toEqual([]);
  });

  it("builds dynamic ids", () => {
    expect(reelPageId(0)).toBe("reel-page-0");
    expect(reelPageId(12)).toBe("reel-page-12");
    expect(inboxThreadId("abc-123")).toBe("inbox-thread-abc-123");
    expect(TID["reel-page-3"]).toBe("reel-page-3");
    expect(TID["inbox-thread-xyz"]).toBe("inbox-thread-xyz");
  });
});
