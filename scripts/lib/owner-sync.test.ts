import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAllUsers, ownerRows } from "./owner-sync";

const user = (id: string, email: string | undefined, providers?: string[]) => ({ id, email, app_metadata: { providers } });

describe("ownerRows (same predicate as isOwnerUser)", () => {
  const saved = process.env.ALLOWED_EMAILS;
  beforeEach(() => {
    process.env.ALLOWED_EMAILS = "Boss@Example.com, other@example.com";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ALLOWED_EMAILS;
    else process.env.ALLOWED_EMAILS = saved;
  });

  it("promotes only allowlisted emails with a google provider", () => {
    const rows = ownerRows([
      user("1", "boss@example.com", ["email", "google"]),
      user("2", "other@example.com", ["google"]),
    ]);
    expect(rows.map((r) => r.user_id)).toEqual(["1", "2"]);
    expect(rows.every((r) => r.role === "owner")).toBe(true);
  });

  it("rejects allowlisted password-only, missing-provider and non-allowlisted google accounts", () => {
    expect(
      ownerRows([
        user("1", "boss@example.com", ["email"]),
        user("2", "boss@example.com", undefined),
        user("3", "boss@example.com", []),
        user("4", "stranger@example.com", ["google"]),
        user("5", undefined, ["google"]),
      ]),
    ).toEqual([]);
  });
});

describe("listAllUsers", () => {
  it("paginates until a short page", async () => {
    const pages = [[user("a", "a@x")], [user("b", "b@x")], []];
    const seen: number[] = [];
    const all = await listAllUsers(async (page) => {
      seen.push(page);
      return { users: pages[page - 1] ?? [] };
    }, 1);
    expect(all.map((u) => u.id)).toEqual(["a", "b"]);
    expect(seen).toEqual([1, 2, 3]);
  });
});
