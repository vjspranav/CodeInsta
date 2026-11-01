import { describe, expect, it } from "vitest";
import { isLabReel, isValidSlug, validInvite } from "./validation";

describe("invite validation before signup", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  it("rejects missing, exhausted, expired, and malformed expiry invites", () => {
    expect(validInvite(null, now)).toBe(false);
    expect(validInvite({ uses: 2, max_uses: 2, expires_at: null }, now)).toBe(false);
    for (const expires_at of ["2026-10-31T12:00:00Z", "2020-01-01", "invalid"])
      expect(validInvite({ uses: 0, max_uses: 1, expires_at }, now)).toBe(false);
  });
  it("accepts unexpired invites with capacity", () => {
    for (const expires_at of [null, "2026-11-01T00:00:00Z"])
      expect(validInvite({ uses: 1, max_uses: 2, expires_at }, now)).toBe(true);
  });
});

describe("isLabReel", () => {
  it("matches lab and lab-v3 topics only", () => {
    expect(isLabReel({ topic: "lab/x" })).toBe(true);
    expect(isLabReel({ topic: "lab-v3/x" })).toBe(true);
    expect(isLabReel({ topic: "os/x" })).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts 2-40 chars of a-z, 0-9 and dash", () => {
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("tech-news")).toBe(true);
    expect(isValidSlug("Tech")).toBe(false);
  });
});
