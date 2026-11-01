import { describe, expect, it } from "vitest";
import { computeStreak } from "./streak";

const today = new Date("2026-11-01T12:00:00Z");
const at = (day: string) => `${day}T09:00:00Z`;

describe("computeStreak", () => {
  it("is 0 with no views", () => {
    expect(computeStreak([], today, "UTC")).toBe(0);
  });
  it("is 1 when seen today only", () => {
    expect(computeStreak([at("2026-11-01")], today, "UTC")).toBe(1);
  });
  it("is 2 for today and yesterday", () => {
    expect(computeStreak([at("2026-11-01"), at("2026-10-31")], today, "UTC")).toBe(2);
  });
  it("keeps the streak alive until local midnight when only yesterday and the day before are seen", () => {
    expect(computeStreak([at("2026-10-31"), at("2026-10-30")], today, "UTC")).toBe(2);
  });
  it("counts only the run ending today or yesterday", () => {
    expect(computeStreak([at("2026-11-01"), at("2026-10-30"), at("2026-10-29")], today, "UTC")).toBe(1);
    expect(computeStreak([at("2026-10-29"), at("2026-10-28")], today, "UTC")).toBe(0);
  });
  it("counts several views on one day once", () => {
    expect(computeStreak([at("2026-11-01"), "2026-11-01T10:00:00Z", at("2026-10-31")], today, "UTC")).toBe(2);
  });
  it("uses the local calendar day of the time zone", () => {
    // 19:00 UTC on Nov 1 is already Nov 2 in Kolkata (UTC+5:30).
    const now = new Date("2026-11-02T03:00:00Z");
    expect(computeStreak(["2026-11-01T19:00:00Z"], now, "Asia/Kolkata")).toBe(1);
    // Same instants: two local days in Kolkata (Nov 1 07:30, Nov 2 00:30), one in UTC (Nov 1, yesterday).
    expect(computeStreak(["2026-11-01T19:00:00Z", "2026-11-01T02:00:00Z"], now, "Asia/Kolkata")).toBe(2);
    expect(computeStreak(["2026-11-01T19:00:00Z", "2026-11-01T02:00:00Z"], now, "UTC")).toBe(1);
  });
});
