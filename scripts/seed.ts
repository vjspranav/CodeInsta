import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { validatePath } from "./lib/validate-path";
import { validateReel, type Reel } from "../src/lib/reel-schema";

const CREATORS = ["claude", "gpt"] as const;
const root = resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

function loadEnv() {
  const envFile = join(root, ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

async function main() {
  const rows: Record<string, unknown>[] = [];
  const counts: Record<string, { found: number; valid: number; skipped: number }> = {};

  for (const creator of CREATORS) {
    const dir = join(root, "content/seed", creator);
    counts[creator] = { found: 0, valid: 0, skipped: 0 };
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    const seenTopics = new Set<string>();
    for (const f of files) {
      const path = join(dir, f);
      counts[creator].found++;
      const check = validatePath(path).files[0];
      if (!check.ok) {
        console.warn(`WARN skipping ${creator}/${f}: ${check.errors.join("; ")}`);
        counts[creator].skipped++;
        continue;
      }
      const reel: Reel = (validateReel(JSON.parse(readFileSync(path, "utf8"))) as { ok: true; reel: Reel }).reel;
      if (seenTopics.has(reel.topic)) {
        console.warn(`WARN skipping ${creator}/${f}: duplicate topic ${reel.topic}`);
        counts[creator].skipped++;
        continue;
      }
      seenTopics.add(reel.topic);
      counts[creator].valid++;
      rows.push({
        creator_id: creator,
        topic: reel.topic,
        title: reel.title,
        hook: reel.hook,
        tags: reel.tags,
        level: reel.level,
        series: reel.series ?? null,
        series_index: reel.series_index ?? null,
        script: reel,
      });
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, counts }, null, 2));
    return;
  }

  loadEnv();
  const { getSupabaseAdmin } = await import("../src/lib/supabase-admin");
  const db = getSupabaseAdmin();
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await db.from("reels").upsert(chunk, { onConflict: "creator_id,topic" });
    if (error) throw new Error(`upsert failed: ${error.message}`);
    upserted += chunk.length;
  }
  console.log(JSON.stringify({ dryRun: false, upserted, counts }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
