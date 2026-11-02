import { nextPartMap } from "./nextPart";

const r = (id: string, series: string | null, series_index: number | null, creator_id = "claude") => ({
  id,
  creator_id,
  series,
  series_index,
});

describe("nextPartMap", () => {
  it("links each part to the next higher index of the same series", () => {
    const map = nextPartMap([r("c", "s", 3), r("a", "s", 1), r("b", "s", 2)]);
    expect(map.get("a")?.id).toBe("b");
    expect(map.get("b")?.id).toBe("c");
    expect(map.has("c")).toBe(false);
  });

  it("skips gaps and ignores standalone reels", () => {
    const map = nextPartMap([r("a", "s", 1), r("c", "s", 4), r("x", null, null)]);
    expect(map.get("a")?.id).toBe("c");
    expect(map.has("x")).toBe(false);
  });

  it("keeps creators apart even when series names match", () => {
    const map = nextPartMap([r("a", "s", 1), r("g2", "s", 2, "gpt")]);
    expect(map.size).toBe(0);
  });

  it("does not reorder its input", () => {
    const input = [r("b", "s", 2), r("a", "s", 1)];
    nextPartMap(input);
    expect(input.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
