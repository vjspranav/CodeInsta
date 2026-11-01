import { PlayerPool, slotFor, POOL_SIZE } from "./playerPool";
import { preloadWindow } from "./preload";

describe("slotFor", () => {
  it("is index modulo pool size", () => {
    expect(POOL_SIZE).toBe(3);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => slotFor(i))).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(slotFor(7, 4)).toBe(3);
  });

  it("gives active and the next two reels distinct slots", () => {
    for (let active = 0; active < 30; active++) {
      const slots = [active, active + 1, active + 2].map((i) => slotFor(i));
      expect(new Set(slots).size).toBe(3);
    }
  });
});

describe("PlayerPool.assign", () => {
  it("reports replaced=true for a fresh slot or a new source, false for a no-op", () => {
    const pool = new PlayerPool();
    expect(pool.assign(0, "a")).toEqual({ slot: 0, replaced: true });
    expect(pool.assign(0, "a")).toEqual({ slot: 0, replaced: false });
    expect(pool.assign(3, "d")).toEqual({ slot: 0, replaced: true });
    expect(pool.holder(0)).toEqual({ index: 3, source: "d", state: "loading" });
  });

  it("reassigns the same slot when the same index gets a new source", () => {
    const pool = new PlayerPool();
    pool.assign(1, "a");
    expect(pool.assign(1, "b")).toEqual({ slot: 1, replaced: true });
  });

  it("never exceeds 3 live players across 100 random moves", () => {
    const pool = new PlayerPool();
    let seed = 7;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 100; n++) {
      const index = Math.floor(rand() * 40);
      const { slot } = pool.assign(index, `s${index}`);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(3);
      expect(pool.liveCount()).toBeLessThanOrEqual(3);
    }
  });

  it("notifies subscribers only when a holder changes", () => {
    const pool = new PlayerPool();
    const fn = jest.fn();
    const off = pool.subscribe(fn);
    pool.assign(0, "a");
    pool.assign(0, "a");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    pool.assign(1, "b");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("PlayerPool load state", () => {
  it("tracks loading, ready and error per slot and source", () => {
    const pool = new PlayerPool();
    pool.assign(0, "a");
    expect(pool.stateOf(0, "a")).toBe("loading");
    expect(pool.stateOf(0, "other")).toBe("none");
    pool.mark(0, "a", "ready");
    expect(pool.stateOf(0, "a")).toBe("ready");
    pool.mark(0, "a", "error");
    expect(pool.stateOf(0, "a")).toBe("error");
  });

  it("ignores a late result for a source the slot no longer holds", () => {
    const pool = new PlayerPool();
    const fn = jest.fn();
    pool.assign(0, "a");
    pool.assign(3, "d");
    pool.subscribe(fn);
    pool.mark(0, "a", "ready");
    expect(fn).not.toHaveBeenCalled();
    expect(pool.stateOf(0, "d")).toBe("loading");
  });

  it("a new assignment resets the state to loading", () => {
    const pool = new PlayerPool();
    pool.assign(0, "a");
    pool.mark(0, "a", "ready");
    pool.assign(3, "d");
    expect(pool.stateOf(0, "d")).toBe("loading");
  });
});

describe("PlayerPool.sync", () => {
  const sources = (n: number) => Array.from({ length: n }, (_, i) => `src-${i}`);

  it("loads active then the next two, in that order", () => {
    const pool = new PlayerPool();
    const plan = pool.sync(0, sources(10));
    expect(plan.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(plan.map((p) => p.slot)).toEqual([0, 1, 2]);
  });

  it("swiping one reel replaces only the one slot that fell out of the window", () => {
    const pool = new PlayerPool();
    const list = sources(10);
    pool.sync(0, list);
    const plan = pool.sync(1, list);
    expect(plan).toEqual([{ index: 3, slot: 0, source: "src-3" }]);
    expect(pool.holder(1)?.index).toBe(1);
    expect(pool.holder(2)?.index).toBe(2);
  });

  it("is a no-op when nothing changed", () => {
    const pool = new PlayerPool();
    const list = sources(5);
    pool.sync(2, list);
    expect(pool.sync(2, list)).toEqual([]);
  });

  it("clamps for 0, 1 and 2 reels", () => {
    expect(new PlayerPool().sync(0, [])).toEqual([]);
    expect(new PlayerPool().sync(0, ["a"]).map((p) => p.index)).toEqual([0]);
    expect(new PlayerPool().sync(1, ["a", "b"]).map((p) => p.index)).toEqual([1]);
  });

  it("skips reels without a source and never loads outside the window", () => {
    const pool = new PlayerPool();
    const plan = pool.sync(0, ["a", null, "c", "d"]);
    expect(plan.map((p) => p.index)).toEqual([0, 2]);
    expect(pool.liveCount()).toBe(2);
  });

  it("stays within 3 live players while walking the whole feed both ways", () => {
    const pool = new PlayerPool();
    const list = sources(25);
    const walk = [...Array(25).keys(), ...[...Array(25).keys()].reverse()];
    for (const active of walk) {
      pool.sync(active, list);
      expect(pool.liveCount()).toBeLessThanOrEqual(3);
      for (const i of preloadWindow(active, list.length, 2, 0)) {
        expect(pool.holder(slotFor(i))?.index).toBe(i);
      }
    }
  });
});
