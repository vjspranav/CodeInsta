import { describe, expect, it } from "vitest";
import { checkVoicing, lineCandidates, normalizeTokens, scoreLine } from "./voice-check";

const ok = (want: string[] | string, heard: string, nb: { prev?: string; next?: string } = {}) => scoreLine(([] as string[]).concat(want), heard, nb).ok;

describe("normalizeTokens", () => {
  it("unifies digits and number words", () => {
    expect(normalizeTokens("4800")).toEqual(normalizeTokens("forty-eight hundred"));
    expect(normalizeTokens("100,000")).toEqual(normalizeTokens("a hundred thousand"));
    expect(normalizeTokens("20")).toEqual(normalizeTokens("twenty"));
    expect(normalizeTokens("600 million")).toEqual(normalizeTokens("six hundred million"));
    expect(normalizeTokens("4,812")).toEqual(normalizeTokens("four thousand eight hundred twelve"));
    expect(normalizeTokens("p99")).toEqual(normalizeTokens("p ninety-nine"));
    expect(normalizeTokens("nine nine nine")).toEqual(["#9", "#9", "#9"]);
  });
  it("joins spelled letters and ignores hyphens/ellipses", () => {
    expect(normalizeTokens("U R L")).toEqual(normalizeTokens("URL"));
    expect(normalizeTokens("T C P")).toEqual(normalizeTokens("TCP"));
    expect(normalizeTokens("well... eight-second wait")).toEqual(normalizeTokens("well eight second wait"));
  });
});

describe("scoreLine: tolerated differences", () => {
  it("numbers", () => {
    expect(ok("It took 4800 ms on 20 hosts", "It took forty-eight hundred ms on twenty hosts")).toBe(true);
    expect(ok("Over 100,000 opens a second", "Over a hundred thousand opens a second.")).toBe(true);
    expect(ok("Launched in 2026", "Launched in twenty twenty-six")).toBe(true);
  });
  it("acronyms vs spelled letters, in either direction", () => {
    expect(ok("Type a URL, open a TCP socket", "Type a U R L, open a T C P socket.")).toBe(true);
    expect(ok("Type a U R L, open a T C P socket", "Type a URL, open a TCP socket")).toBe(true);
  });
  it("syn/sin, cache/cash, hyphens and ellipses", () => {
    expect(ok("The SYN arrives first", "The sin arrives first.")).toBe(true);
    expect(ok("Check the cache first", "Check the cash first")).toBe(true);
    expect(ok("Wait... what? Sort-of fine", "Wait, what? Sort of fine.")).toBe(true);
  });
  it("compound words split differently", () => {
    expect(ok("Then reading is one cheap lookup.", "Then reading is one cheap look-up.")).toBe(true);
    expect(ok("Works on hotel Wi-Fi", "Works on hotel wifi")).toBe(true);
  });
  it("matches either say or text", () => {
    expect(lineCandidates({ text: "Hit the API.", say: "Hit the A P I." }).length).toBeGreaterThan(1);
    expect(ok(lineCandidates({ text: "Use 4800 ms", say: "Use forty-eight hundred milliseconds" }), "Use 4800 ms")).toBe(true);
  });
});

describe("scoreLine: real failures", () => {
  it("garbled words fail", () => {
    expect(ok("Sort by newest", "Destroy by noise.")).toBe(false);
  });
  it("dropped words fail", () => {
    expect(ok("The database is on fire again", "The database")).toBe(false);
  });
  it("a clip that holds the next line fails", () => {
    const prevText = "Six hundred million writes. For one selfie.";
    const own = "Six hundred million writes. For one selfie.";
    const next = "The database is on fire. Again.";
    expect(ok(own, "Six hundred million writes for one selfie. The database is on fire again.", { next })).toBe(false);
    expect(ok(prevText, own)).toBe(true);
  });
  it("a clip that starts or ends with a neighbour's first/last word fails", () => {
    expect(ok("The database is on fire. Again.", "The database is on fire again. Hybrid.", { next: "Hybrid. Regular accounts fan out." })).toBe(false);
    expect(ok("Hybrid. Regular accounts fan out.", "Again. Hybrid. Regular accounts fan out.", { prev: "The database is on fire. Again." })).toBe(false);
  });
});

describe("checkVoicing", () => {
  it("uses the injected transcriber and reports failing lines", async () => {
    const beats = [{ text: "Sort by newest" }, { text: "The cache is cold", say: "The cash is cold" }];
    const heard: Record<string, string> = { "a.wav": "Destroy by noise", "b.wav": "The cache is cold" };
    const r = await checkVoicing(beats, [{ beat_index: 0, wav: "a.wav" }, { beat_index: 1, wav: "b.wav" }], async (w) => heard[w]);
    expect(r.ok).toBe(false);
    expect(r.checks.map((c) => c.ok)).toEqual([false, true]);
  });
});
