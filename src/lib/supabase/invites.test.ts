import { describe, expect, it } from "vitest";
import { safeReturnPath, validInvite } from "./invites";
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
describe("owner bootstrap return URLs", () => {
  it("keeps app paths and invite query strings", () => {
    expect(safeReturnPath("/login?invite=ABC")).toBe("/login?invite=ABC");
    expect(safeReturnPath("/profiles")).toBe("/profiles");
  });
  it("rejects external redirects and auth loops", () => {
    for (const path of [null, "https://evil.test", "//evil.test", "/\\evil.test", "/auth/bootstrap?next=/auth/bootstrap"])
      expect(safeReturnPath(path)).toBe("/");
  });
});
