// Owner tooling for invite-only membership.
//   npm run invite -- create [--uses N] [--note "for alice"] [--days D]
//   npm run invite -- list
//   npm run invite -- owner-sync   # mark ALLOWED_EMAILS users as owners
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "create") {
    const code = randomBytes(5).toString("hex").toUpperCase();
    const days = flag("days");
    const { error } = await db.from("invites").insert({
      code,
      note: flag("note") ?? null,
      max_uses: Number(flag("uses") ?? 1),
      expires_at: days ? new Date(Date.now() + Number(days) * 864e5).toISOString() : null,
    });
    if (error) throw error;
    console.log(code);
  } else if (cmd === "list") {
    const { data, error } = await db.from("invites").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    console.table(data);
  } else if (cmd === "owner-sync") {
    const owners = (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const rows = data.users
      .filter((u) => u.email && owners.includes(u.email.toLowerCase()))
      .map((u) => ({ user_id: u.id, email: u.email!, role: "owner" }));
    if (rows.length) {
      const { error: upErr } = await db.from("members").upsert(rows);
      if (upErr) throw upErr;
    }
    console.log(`owners synced: ${rows.length}`);
  } else {
    console.log("usage: invite create [--uses N] [--note text] [--days D] | list | owner-sync");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
