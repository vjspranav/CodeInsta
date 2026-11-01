import { describe, expect, it, vi } from "vitest";
import { syncVideoPlayback } from "./video-playback";

const media = () => ({ muted: false, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("video playback lifecycle", () => {
  it("autoplays silently before the first interaction and audible after unlock", () => {
    const video = media();
    const stop = syncVideoPlayback(video, { running: true, unlocked: false, muted: false }, vi.fn(), vi.fn());
    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalledOnce();
    stop();
    syncVideoPlayback(video, { running: true, unlocked: true, muted: false }, vi.fn(), vi.fn());
    expect(video.muted).toBe(false);
    expect(video.pause).toHaveBeenCalledOnce();
  });
  it("pauses when inactive, hidden, manually paused or covered by feedback", () => {
    const video = media();
    syncVideoPlayback(video, { running: false, unlocked: true, muted: false }, vi.fn(), vi.fn());
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
  });
  it("respects explicit mute after unlocking", () => {
    const video = media();
    syncVideoPlayback(video, { running: true, unlocked: true, muted: true }, vi.fn(), vi.fn());
    expect(video.muted).toBe(true);
  });
  it("falls back to muted autoplay if the browser requires a new gesture", async () => {
    const video = media(), blocked = vi.fn(), failed = vi.fn();
    video.play.mockRejectedValueOnce({ name: "NotAllowedError" });
    syncVideoPlayback(video, { running: true, unlocked: true, muted: false }, blocked, failed);
    await flush();
    expect(video.muted).toBe(true);
    expect(blocked).toHaveBeenCalledOnce();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(failed).not.toHaveBeenCalled();
  });
  it("does not restart an offscreen video after a late rejection", async () => {
    const video = media(), blocked = vi.fn();
    let reject!: (error: unknown) => void;
    video.play.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const stop = syncVideoPlayback(video, { running: true, unlocked: true, muted: false }, blocked, vi.fn());
    stop(); reject({ name: "NotAllowedError" }); await flush();
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(blocked).not.toHaveBeenCalled();
  });
  it("reports media failures but ignores expected pause interruptions", async () => {
    const video = media(), failed = vi.fn();
    video.play.mockRejectedValueOnce({ name: "AbortError" });
    syncVideoPlayback(video, { running: true, unlocked: true, muted: false }, vi.fn(), failed);
    await flush(); expect(failed).not.toHaveBeenCalled();
    video.play.mockRejectedValueOnce({ name: "NotSupportedError" });
    syncVideoPlayback(video, { running: true, unlocked: true, muted: false }, vi.fn(), failed);
    await flush(); expect(failed).toHaveBeenCalledOnce();
  });
});
