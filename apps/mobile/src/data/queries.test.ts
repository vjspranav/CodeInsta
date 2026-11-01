import { REEL_COLUMNS, usableReels } from "./queries";

const reel = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  creator_id: "claude",
  title: "T",
  topic: "os/scheduling",
  tags: ["a"],
  series: null,
  series_index: null,
  created_at: "2026-11-01T00:00:00Z",
  video_url: "https://cdn.example/r1.mp4",
  glossary: null,
  parent_reel_id: null,
  genre: null,
  style: null,
  poster_url: null,
  expires_at: null,
  ...over,
});

describe("REEL_COLUMNS", () => {
  it("projects the poster and expiry out of script and never selects script whole", () => {
    expect(REEL_COLUMNS).toContain("poster_url:script->>poster_url");
    expect(REEL_COLUMNS).toContain("expires_at:script->>expires_at");
    expect(REEL_COLUMNS.split(",")).not.toContain("script");
    expect(REEL_COLUMNS).not.toContain("*");
  });
});

describe("usableReels", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");

  it("drops rows with no video, lab reels and expired reels", () => {
    const rows = [
      reel({ id: "ok" }),
      reel({ id: "novideo", video_url: null }),
      reel({ id: "blank", video_url: "  " }),
      reel({ id: "lab", topic: "lab/x" }),
      reel({ id: "labv3", topic: "lab-v3/y" }),
      reel({ id: "expired", expires_at: "2026-11-01T00:00:00Z" }),
      reel({ id: "future", expires_at: "2026-12-01T00:00:00Z" }),
    ];
    expect(usableReels(rows, now).map((r) => r.id)).toEqual(["ok", "future"]);
  });

  it("keeps a reel with an unparseable expiry and tolerates junk input", () => {
    expect(usableReels([reel({ expires_at: "soon" })], now)).toHaveLength(1);
    expect(usableReels(null, now)).toEqual([]);
    expect(usableReels([null, {}, 3], now)).toEqual([]);
  });

  it("normalizes null tags", () => {
    expect(usableReels([reel({ tags: null })], now)[0].tags).toEqual([]);
  });
});
