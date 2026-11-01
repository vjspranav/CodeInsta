import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { parsePerf, percentile, run } from "./parse-perf";

const line = (name: string, ms: number) =>
  `11-02 10:00:00.123  1234  1260 I ReactNativeJS: CI_PERF ${name} ${ms}`;

const log = (opts: { cold: number[]; swipe: number[]; jank?: string | null }) =>
  [
    "--------- beginning of main",
    ...opts.cold.map((v) => line("cold_start_to_first_frame", v)),
    ...opts.swipe.map((v) => line("swipe_to_play", v)),
    "unrelated line 99 CI_PERFECT nope",
    ...(opts.jank === null ? [] : [`JANKY ${opts.jank ?? "1.4"}`, "FRAME_P95 9"]),
  ].join("\n");

const good = { cold: [1100, 1200, 1250, 1300, 1400], swipe: [60, 70, 80, 90, 120] };

describe("percentile (nearest rank)", () => {
  it("handles p50 and p95", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 95)).toBe(95);
    expect(percentile([7], 95)).toBe(7);
  });
  it("is NaN for no samples", () => {
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });
});

describe("parsePerf", () => {
  it("groups metrics, reads jank and frame p95", () => {
    const parsed = parsePerf(log(good));
    expect(parsed.metrics.cold_start_to_first_frame).toEqual(good.cold);
    expect(parsed.metrics.swipe_to_play).toEqual(good.swipe);
    expect(parsed.janky).toBe(1.4);
    expect(parsed.frameP95).toBe(9);
  });
});

describe("run", () => {
  it("passing numbers exit 0 and print p50 and p95 per metric", () => {
    const { code, report } = run(log(good));
    expect(code).toBe(0);
    expect(report).toContain("cold_start_to_first_frame");
    expect(report).toContain("p50=1250.0");
    expect(report).toContain("swipe_to_play");
    expect(report).toContain("p95=120.0");
  });

  it("swipe p95 of 180 exits 1", () => {
    const { code, report } = run(log({ ...good, swipe: [60, 70, 80, 90, 180] }));
    expect(code).toBe(1);
    expect(report).toMatch(/FAIL.*swipe_to_play/);
  });

  it("swipe p95 of exactly 150 fails (limit is exclusive)", () => {
    expect(run(log({ ...good, swipe: [150] })).code).toBe(1);
  });

  it("cold start p50 of 1500 exits 1", () => {
    expect(run(log({ ...good, cold: [1500, 1500, 1500] })).code).toBe(1);
  });

  it("only the p50 gates cold start (one slow outlier passes)", () => {
    expect(run(log({ ...good, cold: [1100, 1200, 1250, 1300, 2600] })).code).toBe(0);
  });

  it("jank 4.2 exits 1; exactly 3 passes", () => {
    expect(run(log({ ...good, jank: "4.2" })).code).toBe(1);
    expect(run(log({ ...good, jank: "3" })).code).toBe(0);
  });

  it("a missing metric or missing jank line cannot pass", () => {
    expect(run(log({ cold: [], swipe: good.swipe })).code).toBe(1);
    expect(run(log({ cold: good.cold, swipe: [] })).code).toBe(1);
    expect(run(log({ ...good, jank: null })).code).toBe(1);
  });
});

describe("cli", () => {
  const cli = path.join(__dirname, "parse-perf.ts");
  const tsx = path.join(__dirname, "..", "..", "..", "node_modules", ".bin", "tsx");
  const exec = (text: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perf-"));
    const file = path.join(dir, "out.txt");
    fs.writeFileSync(file, text);
    return spawnSync(tsx, [cli, file], { encoding: "utf8" });
  };
  const available = fs.existsSync(tsx);
  (available ? it : it.skip)("exit codes follow the verdict", () => {
    expect(exec(log(good)).status).toBe(0);
    expect(exec(log({ ...good, jank: "4.2" })).status).toBe(1);
  });
});
