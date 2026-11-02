// Ship gate for the Android release APK (plan Task 7.4).
//   npx tsx apps/mobile/scripts/ship-gate.ts <last-pass-android.json> <apk>
// Exit 0 and prints "ok: ..." only when a Maestro pass exists, is fresh, and was recorded for exactly this APK.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export type Pass = { passedAt: string; buildSha256: string };

export function canShip(input: {
  pass: Pass | null;
  apkSha256: string;
  now: Date;
  maxAgeHours?: number;
}): { ok: boolean; reason: string } {
  const { pass, apkSha256, now, maxAgeHours = 24 } = input;
  if (!pass) return { ok: false, reason: "no passing Maestro run" };
  const passedAt = Date.parse(pass.passedAt);
  if (!Number.isFinite(passedAt)) return { ok: false, reason: "pass file has an unreadable timestamp" };
  const ageHours = (now.getTime() - passedAt) / 3_600_000;
  if (ageHours < 0) return { ok: false, reason: "pass file timestamp is in the future" };
  if (ageHours > maxAgeHours) return { ok: false, reason: `last passing Maestro run is older than ${maxAgeHours} h` };
  if (pass.buildSha256.toLowerCase() !== apkSha256.toLowerCase()) return { ok: false, reason: "pass is for a different build" };
  return { ok: true, reason: "fresh passing Maestro run for this build" };
}

function readPass(file: string): Pass | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (typeof raw?.passedAt === "string" && typeof raw?.buildSha256 === "string") return raw;
  } catch {
    // fall through: an unreadable file is the same as no pass
  }
  return null;
}

if (process.argv[1] && /ship-gate\.ts$/.test(process.argv[1])) {
  const [passFile, apk] = process.argv.slice(2);
  if (!passFile || !apk || !existsSync(apk)) {
    console.error("usage: ship-gate.ts <last-pass-android.json> <apk>");
    process.exit(2);
  }
  const apkSha256 = createHash("sha256").update(readFileSync(apk)).digest("hex");
  const result = canShip({ pass: readPass(passFile), apkSha256, now: new Date() });
  console.log(`${result.ok ? "ok" : "refused"}: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}
