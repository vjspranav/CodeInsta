import { describe, expect, it } from "vitest";
import { isLabReel } from "./reel/playable-content";

describe("lab visibility", () => {
  it("keeps both generations of experiments out of the regular library", () => {
    const rows = [
      { topic: "lab/instagram/dialogue" },
      { topic: "lab-v3/instagram-feed/story" },
      { topic: "databases/query/joins" },
    ];
    expect(rows.filter((row) => !isLabReel(row))).toEqual([{ topic: "databases/query/joins" }]);
  });
});
