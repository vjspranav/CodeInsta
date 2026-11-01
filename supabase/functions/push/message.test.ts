import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPush, chunk, isExpoToken, safeEqual, shouldDeleteToken, type PushEvent } from "./message";

// Same character classes as src/no-emoji.test.ts (owner rule: no emojis anywhere).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;

const T1 = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const T2 = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";
const USER = "11111111-1111-4111-8111-111111111111";

describe("buildPush copy", () => {
  it("creator message: title uses the creator display name, body is fixed, route is the inbox thread", () => {
    const out = buildPush(
      { kind: "creator_message", user_id: USER, creator_id: "claude", creator_name: "Claude" },
      [T1, T2],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      to: T1,
      title: "Claude replied",
      body: "Open your inbox to read it.",
      data: { route: "/inbox/claude" },
    });
    expect(out[1].to).toBe(T2);
  });

  it("request approved", () => {
    const [m] = buildPush({ kind: "request_status", user_id: USER, status: "approved" }, [T1]);
    expect(m).toMatchObject({
      title: "Topic approved",
      body: "A creator is working on your request.",
      data: { route: "/requests" },
    });
  });

  it("request done", () => {
    const [m] = buildPush({ kind: "request_status", user_id: USER, status: "done" }, [T1]);
    expect(m).toMatchObject({
      title: "Your topic is ready",
      body: "Your requested reel is in your feed.",
      data: { route: "/" },
    });
  });

  it("other request statuses produce nothing", () => {
    const ev = { kind: "request_status", user_id: USER, status: "rejected" } as unknown as PushEvent;
    expect(buildPush(ev, [T1])).toEqual([]);
  });

  it("no tokens produce nothing", () => {
    expect(buildPush({ kind: "request_status", user_id: USER, status: "done" }, [])).toEqual([]);
  });

  it("a hostile creator id never becomes a route", () => {
    const [m] = buildPush(
      { kind: "creator_message", user_id: USER, creator_id: "../admin/requests", creator_name: "X" },
      [T1],
    );
    expect(m.data.route).toBe("/");
  });
});

describe("privacy: message text never reaches Expo", () => {
  it("ignores body fields on the event, whatever they are called", () => {
    const secret = "secret text from a member or creator";
    const events = [
      { kind: "creator_message", user_id: USER, creator_id: "claude", creator_name: "Claude", body: secret },
      { kind: "creator_message", user_id: USER, creator_id: "gpt", body_md: secret, text: secret, message: secret },
      { kind: "request_status", user_id: USER, status: "approved", body: secret },
      { kind: "request_status", user_id: USER, status: "done", body: secret, request_body: secret },
    ] as unknown as PushEvent[];
    for (const ev of events) {
      const json = JSON.stringify(buildPush(ev, [T1]));
      expect(json).not.toContain("secret");
      expect(json).not.toContain(secret);
    }
  });

  it("migration trigger payloads never reference message or request text columns", () => {
    const sql = readFileSync("supabase/migrations/0013_push_tokens.sql", "utf8");
    const bodies = sql.match(/jsonb_build_object\([^;]*\)/gs) ?? [];
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const b of bodies) {
      expect(b).not.toMatch(/body/i);
    }
  });
});

describe("no emoji", () => {
  it("every copy string is emoji free", () => {
    const all = [
      ...buildPush({ kind: "creator_message", user_id: USER, creator_id: "claude", creator_name: "Claude" }, [T1]),
      ...buildPush({ kind: "request_status", user_id: USER, status: "approved" }, [T1]),
      ...buildPush({ kind: "request_status", user_id: USER, status: "done" }, [T1]),
    ];
    for (const m of all) {
      expect(EMOJI.test(JSON.stringify(m))).toBe(false);
    }
  });

  it("source files are emoji free", () => {
    for (const f of ["message.ts", "index.ts", "message.test.ts"]) {
      const text = readFileSync(`supabase/functions/push/${f}`, "utf8");
      expect(EMOJI.test(text)).toBe(false);
    }
    expect(EMOJI.test(readFileSync("supabase/migrations/0013_push_tokens.sql", "utf8"))).toBe(false);
  });
});

describe("chunk", () => {
  it("splits at 100", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    expect(chunk(items, 100).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunk([], 100)).toEqual([]);
    expect(chunk(items.slice(0, 100), 100)).toHaveLength(1);
  });
});

describe("shouldDeleteToken", () => {
  it("true only for DeviceNotRegistered", () => {
    expect(shouldDeleteToken({ details: { error: "DeviceNotRegistered" } })).toBe(true);
    expect(shouldDeleteToken({ status: "error", details: { error: "MessageRateExceeded" } })).toBe(false);
    expect(shouldDeleteToken({ status: "ok", id: "x" })).toBe(false);
    expect(shouldDeleteToken(null)).toBe(false);
    expect(shouldDeleteToken(undefined)).toBe(false);
  });
});

describe("isExpoToken", () => {
  it("accepts Expo tokens only", () => {
    expect(isExpoToken(T1)).toBe(true);
    expect(isExpoToken("ExpoPushToken[abc]")).toBe(true);
    expect(isExpoToken('x"),user_id.neq.(')).toBe(false);
    expect(isExpoToken("")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares secrets", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
