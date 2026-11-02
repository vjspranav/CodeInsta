import { canShip } from "./ship-gate";

const NOW = new Date("2026-11-02T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const HASH = "a".repeat(64);

describe("canShip", () => {
  it("is not ok without a pass file", () => {
    const r = canShip({ pass: null, apkSha256: HASH, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no passing Maestro run");
  });

  it("is not ok when the pass is older than 24 hours", () => {
    const r = canShip({ pass: { passedAt: hoursAgo(25), buildSha256: HASH }, apkSha256: HASH, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/older than 24 h/);
  });

  it("honours maxAgeHours", () => {
    const pass = { passedAt: hoursAgo(5), buildSha256: HASH };
    expect(canShip({ pass, apkSha256: HASH, now: NOW, maxAgeHours: 4 }).ok).toBe(false);
    expect(canShip({ pass, apkSha256: HASH, now: NOW, maxAgeHours: 6 }).ok).toBe(true);
  });

  it("is not ok when the pass is for a different build", () => {
    const r = canShip({ pass: { passedAt: hoursAgo(1), buildSha256: "b".repeat(64) }, apkSha256: HASH, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("pass is for a different build");
  });

  it("is not ok for an unparseable or future timestamp", () => {
    expect(canShip({ pass: { passedAt: "nonsense", buildSha256: HASH }, apkSha256: HASH, now: NOW }).ok).toBe(false);
    expect(canShip({ pass: { passedAt: hoursAgo(-2), buildSha256: HASH }, apkSha256: HASH, now: NOW }).ok).toBe(false);
  });

  it("is ok for a fresh, matching pass (hash compare ignores case)", () => {
    const r = canShip({ pass: { passedAt: hoursAgo(2), buildSha256: HASH.toUpperCase() }, apkSha256: HASH, now: NOW });
    expect(r.ok).toBe(true);
  });
});
