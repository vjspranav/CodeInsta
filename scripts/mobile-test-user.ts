// Maestro test member for the mobile ship gate (plan Task 7.2).
//   npx tsx scripts/mobile-test-user.ts create    # create or reuse the member, write MAESTRO_EMAIL/MAESTRO_PASSWORD to .env.local
//   npx tsx scripts/mobile-test-user.ts cleanup   # delete that member's feedback, messages, likes, dislikes, views, topic_requests
// MAESTRO_EMAIL must be an inbox you control and never an owner address. The password is never printed.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { listAllUsers } from "./lib/owner-sync";

const ENV_FILE = ".env.local";

/** The tables the cleanup empties for the test member. messages first: it references feedback. */
export const CLEANUP_TABLES = ["messages", "feedback", "likes", "dislikes", "views", "topic_requests"] as const;

/** Throws when the email is empty or is an owner address (ALLOWED_EMAILS). Same normalisation as src/lib/supabase/allowlist.ts. */
export function assertSafeTarget(email: string, allowed: string): void {
  const target = (email ?? "").trim().toLowerCase();
  if (!target) throw new Error("MAESTRO_EMAIL is empty: set it to an inbox you control (never an owner address)");
  const owners = allowed.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (owners.includes(target)) throw new Error("refusing to run: the target email is an owner address (ALLOWED_EMAILS)");
}

export function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

/** Replace `KEY=` lines in an env file's text, append missing keys, keep every other line. */
export function upsertEnv(text: string, vars: Record<string, string>): string {
  const lines = text.length ? text.replace(/\n$/, "").split("\n") : [];
  const remaining = new Map(Object.entries(vars));
  const out = lines.map((line) => {
    const key = line.split("=", 1)[0];
    if (remaining.has(key) && /^[A-Z0-9_]+$/.test(key)) {
      const v = remaining.get(key)!;
      remaining.delete(key);
      return `${key}=${v}`;
    }
    return line;
  });
  for (const [k, v] of remaining) out.push(`${k}=${v}`);
  return out.join("\n") + "\n";
}

type Result = { error: { message: string } | null };
export interface TestDb {
  from(table: string): {
    upsert(row: unknown): PromiseLike<Result>;
    delete(): { eq(col: string, val: unknown): PromiseLike<Result> };
  };
  auth: {
    admin: {
      createUser(a: { email: string; password: string; email_confirm: boolean }): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
      updateUserById(id: string, a: { password: string; email_confirm: boolean }): PromiseLike<{ error: { message: string } | null }>;
    };
  };
  findUserIdByEmail(email: string): Promise<string | null>;
}

interface Deps {
  db: TestDb;
  env: Record<string, string | undefined>;
  log: (message: string) => void;
}

function check(res: Result, what: string): void {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

export async function createTestMember(deps: Deps & { writeEnv: (vars: Record<string, string>) => void }): Promise<void> {
  const { db, env, log } = deps;
  const email = (env.MAESTRO_EMAIL ?? "").trim();
  assertSafeTarget(email, env.ALLOWED_EMAILS ?? "");
  const password = env.MAESTRO_PASSWORD?.trim() || generatePassword();

  let userId = await db.findUserIdByEmail(email);
  if (userId) {
    check(await db.auth.admin.updateUserById(userId, { password, email_confirm: true }), "update user");
    log("reusing existing test user");
  } else {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`create user: ${error?.message ?? "no user returned"}`);
    userId = data.user.id;
    log("created test user");
  }

  check(await db.from("members").upsert({ user_id: userId, email, role: "member" }), "members upsert");
  check(
    await db.from("user_interests").upsert({ user_id: userId, areas: [], onboarded: true, updated_at: new Date().toISOString() }),
    "user_interests upsert",
  );
  deps.writeEnv({ MAESTRO_EMAIL: email, MAESTRO_PASSWORD: password });
  log("test member ready; MAESTRO_EMAIL and MAESTRO_PASSWORD are in .env.local");
}

export async function cleanupTestMember(deps: Deps): Promise<void> {
  const { db, env, log } = deps;
  const email = (env.MAESTRO_EMAIL ?? "").trim();
  assertSafeTarget(email, env.ALLOWED_EMAILS ?? "");
  const userId = await db.findUserIdByEmail(email);
  if (!userId) {
    log("no test user yet; nothing to clean");
    return;
  }
  for (const table of CLEANUP_TABLES) {
    check(await db.from(table).delete().eq("user_id", userId), `delete ${table}`);
  }
  log(`cleaned ${CLEANUP_TABLES.join(", ")} for the test member`);
}

/** Real client plus an email lookup that walks every page of auth users. */
export function realDeps(): { db: TestDb; env: NodeJS.ProcessEnv } {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const db: TestDb = {
    from: (t) => client.from(t) as unknown as ReturnType<TestDb["from"]>,
    auth: client.auth as unknown as TestDb["auth"],
    async findUserIdByEmail(email) {
      const users = await listAllUsers(async (page, perPage) => {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        return { users: data.users };
      });
      return users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
    },
  };
  return { db, env: process.env };
}

export function writeEnvFile(vars: Record<string, string>): void {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  writeFileSync(ENV_FILE, upsertEnv(text, vars), { mode: 0o600 });
}

async function main() {
  const cmd = process.argv[2];
  if (cmd !== "create" && cmd !== "cleanup") {
    console.log("usage: mobile-test-user create | cleanup");
    process.exit(1);
  }
  const { db, env } = realDeps();
  const log = (m: string) => console.log(m);
  if (cmd === "create") await createTestMember({ db, env, log, writeEnv: writeEnvFile });
  else await cleanupTestMember({ db, env, log });
}

if (process.argv[1] && /mobile-test-user\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "failed");
    process.exit(1);
  });
}
