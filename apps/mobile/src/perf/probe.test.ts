import { createPerf } from "./probe";

let clock = 0;
const now = () => clock;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  clock = 1000;
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  delete process.env.EXPO_PUBLIC_PERF;
});

describe("with the flag off", () => {
  it("prints nothing, records nothing", () => {
    const perf = createPerf(now);
    perf.mark("a");
    clock += 50;
    expect(Number.isNaN(perf.measure("x", "a"))).toBe(true);
    perf.log("x", 12);
    perf.playing();
    perf.pageChanged();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("does not print for any value other than 1", () => {
    process.env.EXPO_PUBLIC_PERF = "0";
    createPerf(now).log("x", 1);
    process.env.EXPO_PUBLIC_PERF = "true";
    createPerf(now).log("x", 1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe("with EXPO_PUBLIC_PERF=1", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_PERF = "1";
  });

  it("measure returns elapsed ms from a mark on the injected clock", () => {
    const perf = createPerf(now);
    perf.mark("a");
    clock += 42.5;
    expect(perf.measure("x", "a")).toBe(42.5);
    clock += 10;
    expect(perf.measure("x", "a")).toBe(52.5);
  });

  it("measure of an unknown mark is NaN and never logs", () => {
    const perf = createPerf(now);
    expect(Number.isNaN(perf.measure("x", "missing"))).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("log prints the CI_PERF line", () => {
    createPerf(now).log("swipe_to_play", 87.456);
    expect(logSpy).toHaveBeenCalledWith("CI_PERF swipe_to_play 87.5");
  });

  it("log ignores non-finite values", () => {
    createPerf(now).log("x", NaN);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("first playing reel logs first_frame_playing from app_start, once", () => {
    const perf = createPerf(now);
    clock += 900;
    perf.playing();
    clock += 500;
    perf.playing();
    expect(logSpy.mock.calls).toEqual([["CI_PERF first_frame_playing 900.0"]]);
  });

  it("a page change then playing logs swipe_to_play once", () => {
    const perf = createPerf(now);
    perf.playing();
    logSpy.mockClear();
    clock += 2000;
    perf.pageChanged();
    clock += 120;
    perf.playing();
    perf.playing();
    expect(logSpy.mock.calls).toEqual([["CI_PERF swipe_to_play 120.0"]]);
  });

  it("the initial page change before the first frame does not log a swipe", () => {
    const perf = createPerf(now);
    perf.pageChanged();
    clock += 300;
    perf.playing();
    expect(logSpy.mock.calls).toEqual([["CI_PERF first_frame_playing 300.0"]]);
    perf.playing();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
