import { describe, expect, it, vi } from "vitest";
import {
  assertSafeTarget,
  cleanupTestMember,
  createTestMember,
  generatePassword,
  upsertEnv,
} from "./mobile-test-user";

const OWNER = "Owner@Example.com";
const ALLOWED = "owner@example.com, other-owner@example.com";

describe("assertSafeTarget", () => {
  it("throws for an allowlisted owner email (case and spacing insensitive)", () => {
    expect(() => assertSafeTarget(OWNER, ALLOWED)).toThrow(/owner/i);
    expect(() => assertSafeTarget("  other-owner@example.com ", ALLOWED)).toThrow(/owner/i);
  });
  it("throws for an empty or blank email", () => {
    expect(() => assertSafeTarget("", ALLOWED)).toThrow(/empty|MAESTRO_EMAIL/i);
    expect(() => assertSafeTarget("   ", ALLOWED)).toThrow();
  });
  it("passes for a different address", () => {
    expect(() => assertSafeTarget("maestro@inbox.test", ALLOWED)).not.toThrow();
  });
});

describe("upsertEnv", () => {
  it("replaces existing keys, appends missing ones, and keeps other lines", () => {
    const out = upsertEnv("A=1\nMAESTRO_EMAIL=old\nB=2\n", { MAESTRO_EMAIL: "new", MAESTRO_PASSWORD: "pw" });
    expect(out).toBe("A=1\nMAESTRO_EMAIL=new\nB=2\nMAESTRO_PASSWORD=pw\n");
  });
});

describe("generatePassword", () => {
  it("is long and random", () => {
    const a = generatePassword();
    expect(a.length).toBeGreaterThanOrEqual(24);
    expect(a).not.toBe(generatePassword());
  });
});

function fakeDb(existingUserId: string | null = null) {
  const calls: { table: string; op: string; payload?: unknown; match?: unknown }[] = [];
  const table = (name: string) => ({
    upsert: async (payload: unknown) => (calls.push({ table: name, op: "upsert", payload }), { error: null }),
    delete: () => ({
      eq: async (col: string, val: unknown) => (calls.push({ table: name, op: "delete", match: [col, val] }), { error: null }),
    }),
  });
  const admin = {
    createUser: vi.fn(async () => ({ data: { user: { id: "new-user-id" } }, error: null })),
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
  };
  return {
    calls,
    admin,
    db: {
      from: table,
      auth: { admin },
      findUserIdByEmail: async () => existingUserId,
    },
  };
}

describe("createTestMember", () => {
  it("creates the member, writes both env vars, and never logs the password", async () => {
    const { db, calls, admin } = fakeDb();
    const logs: string[] = [];
    const written: Record<string, string> = {};
    const env = { MAESTRO_EMAIL: "maestro@inbox.test", ALLOWED_EMAILS: ALLOWED } as Record<string, string | undefined>;
    await createTestMember({ db, env, log: (m) => logs.push(m), writeEnv: (v) => Object.assign(written, v) });
    expect(admin.createUser).toHaveBeenCalledOnce();
    expect(written.MAESTRO_EMAIL).toBe("maestro@inbox.test");
    expect(written.MAESTRO_PASSWORD.length).toBeGreaterThanOrEqual(24);
    expect(calls.find((c) => c.table === "members")?.payload).toMatchObject({ user_id: "new-user-id", role: "member" });
    expect(calls.find((c) => c.table === "user_interests")?.payload).toMatchObject({ user_id: "new-user-id", onboarded: true });
    const printed = logs.join("\n");
    expect(printed).not.toContain(written.MAESTRO_PASSWORD);
    expect(printed).not.toContain("MAESTRO_PASSWORD=");
  });

  it("reuses an existing user and keeps MAESTRO_PASSWORD when set, without logging it", async () => {
    const { db, admin } = fakeDb("existing-id");
    const logs: string[] = [];
    const written: Record<string, string> = {};
    const env = { MAESTRO_EMAIL: "maestro@inbox.test", MAESTRO_PASSWORD: "preset-secret-value-123456", ALLOWED_EMAILS: ALLOWED };
    await createTestMember({ db, env, log: (m) => logs.push(m), writeEnv: (v) => Object.assign(written, v) });
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.updateUserById).toHaveBeenCalledWith("existing-id", expect.objectContaining({ password: "preset-secret-value-123456" }));
    expect(logs.join("\n")).not.toContain("preset-secret-value-123456");
  });

  it("refuses an owner email before touching the database", async () => {
    const { db, calls, admin } = fakeDb();
    await expect(
      createTestMember({ db, env: { MAESTRO_EMAIL: OWNER, ALLOWED_EMAILS: ALLOWED }, log: () => {}, writeEnv: () => {} }),
    ).rejects.toThrow(/owner/i);
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});

describe("cleanupTestMember", () => {
  it("deletes only the target user's rows in the six tables, never members or the user", async () => {
    const { db, calls, admin } = fakeDb("uid-1");
    await cleanupTestMember({ db, env: { MAESTRO_EMAIL: "maestro@inbox.test", ALLOWED_EMAILS: ALLOWED }, log: () => {} });
    const tables = calls.filter((c) => c.op === "delete").map((c) => c.table);
    expect(tables.sort()).toEqual(["dislikes", "feedback", "likes", "messages", "topic_requests", "views"]);
    for (const c of calls) expect(c.match).toEqual(["user_id", "uid-1"]);
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it("refuses an owner email", async () => {
    const { db, calls } = fakeDb("uid-1");
    await expect(cleanupTestMember({ db, env: { MAESTRO_EMAIL: OWNER, ALLOWED_EMAILS: ALLOWED }, log: () => {} })).rejects.toThrow(/owner/i);
    expect(calls).toHaveLength(0);
  });

  it("is a no-op when the test user does not exist yet", async () => {
    const { db, calls } = fakeDb(null);
    await cleanupTestMember({ db, env: { MAESTRO_EMAIL: "maestro@inbox.test", ALLOWED_EMAILS: ALLOWED }, log: () => {} });
    expect(calls).toHaveLength(0);
  });
});
