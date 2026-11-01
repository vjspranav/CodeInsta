import { describe, expect, it } from "vitest";
import { isLiteModel, pickEngine, topicBucket } from "./voice-policy";

describe("voice mix policy", () => {
  it("is deterministic per topic", () => {
    expect(pickEngine("distributed/feeds/instagram-feed/part-1")).toBe(pickEngine("distributed/feeds/instagram-feed/part-1"));
    expect(topicBucket(" Os/Scheduler ")).toBe(topicBucket("os/scheduler"));
  });
  it("defaults to Gemini for every reel", () => {
    for (let i = 0; i < 200; i++) expect(pickEngine(`cat/topic-${i}`)).toBe("gemini");
  });
  it("splits about 80/20 across many topics when a share is set", () => {
    const n = 2000;
    let gem = 0;
    for (let i = 0; i < n; i++) if (pickEngine(`cat/topic-${i}`, 80) === "gemini") gem++;
    expect(gem / n).toBeGreaterThan(0.75);
    expect(gem / n).toBeLessThan(0.85);
  });
  it("detects flash-lite", () => {
    expect(isLiteModel("gemini-3.8-flash-lite-tts")).toBe(true);
    expect(isLiteModel("gemini-3.8-flash-tts")).toBe(false);
  });
});
