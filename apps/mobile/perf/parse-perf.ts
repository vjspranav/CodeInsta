/**
 * Summarises a perf capture (the file android-perf.sh writes, or any logcat dump) and gates it.
 * Usage: npx tsx apps/mobile/perf/parse-perf.ts <capture.txt>
 *
 * Reads `CI_PERF <name> <ms>` lines, plus `JANKY <pct>` and `FRAME_P95 <ms>` lines. Exit 1 when
 * cold_start_to_first_frame p50 >= 1500 ms, swipe_to_play p95 >= 150 ms, or janky frames > 3 %.
 * A metric with no samples counts as a failure: a capture that cannot show the target is not a pass.
 */
import fs from "fs";

export const LIMITS = { coldStartP50Ms: 1500, swipeP95Ms: 150, jankyPct: 3 } as const;

export type Parsed = {
  metrics: Record<string, number[]>;
  janky: number | null;
  frameP95: number | null;
};

export function parsePerf(text: string): Parsed {
  const metrics: Record<string, number[]> = {};
  let janky: number | null = null;
  let frameP95: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const perf = /\bCI_PERF\s+(\w+)\s+(-?\d+(?:\.\d+)?)\s*$/.exec(raw);
    if (perf) {
      (metrics[perf[1]] ??= []).push(Number(perf[2]));
      continue;
    }
    const jank = /^\s*JANKY\s+(\d+(?:\.\d+)?)\s*$/.exec(raw);
    if (jank) janky = Number(jank[1]);
    const frame = /^\s*FRAME_P95\s+(\d+(?:\.\d+)?)\s*$/.exec(raw);
    if (frame) frameP95 = Number(frame[1]);
  }
  return { metrics, janky, frameP95 };
}

/** Nearest-rank percentile; NaN for an empty list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}

const fmt = (n: number) => n.toFixed(1);

export function run(text: string): { code: 0 | 1; report: string } {
  const { metrics, janky, frameP95 } = parsePerf(text);
  const lines: string[] = [];
  const failures: string[] = [];

  for (const name of Object.keys(metrics).sort()) {
    const v = metrics[name];
    lines.push(`${name}: n=${v.length} p50=${fmt(percentile(v, 50))} p95=${fmt(percentile(v, 95))}`);
  }
  lines.push(`janky_frames_pct: ${janky === null ? "missing" : fmt(janky)}`);
  if (frameP95 !== null) lines.push(`frame_time_p95_ms: ${fmt(frameP95)}`);

  const cold = metrics.cold_start_to_first_frame ?? [];
  const coldP50 = percentile(cold, 50);
  if (cold.length === 0) failures.push("cold_start_to_first_frame: no samples");
  else if (coldP50 >= LIMITS.coldStartP50Ms)
    failures.push(`cold_start_to_first_frame p50 ${fmt(coldP50)} ms >= ${LIMITS.coldStartP50Ms} ms`);

  const swipe = metrics.swipe_to_play ?? [];
  const swipeP95 = percentile(swipe, 95);
  if (swipe.length === 0) failures.push("swipe_to_play: no samples");
  else if (swipeP95 >= LIMITS.swipeP95Ms)
    failures.push(`swipe_to_play p95 ${fmt(swipeP95)} ms >= ${LIMITS.swipeP95Ms} ms`);

  if (janky === null) failures.push("JANKY: no line (gfxinfo capture missing)");
  else if (janky > LIMITS.jankyPct) failures.push(`janky frames ${fmt(janky)} % > ${LIMITS.jankyPct} %`);

  for (const f of failures) lines.push(`FAIL ${f}`);
  lines.push(failures.length ? "RESULT: FAIL" : "RESULT: PASS");
  return { code: failures.length ? 1 : 0, report: lines.join("\n") };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: parse-perf.ts <capture.txt>");
    process.exit(2);
  }
  const { code, report } = run(fs.readFileSync(file, "utf8"));
  console.log(report);
  process.exit(code);
}
