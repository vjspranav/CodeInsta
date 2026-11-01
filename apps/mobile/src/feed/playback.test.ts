import { playbackState } from "./playback";

const base = { active: true, soundUnlocked: true, userPaused: false, appActive: true };

describe("playbackState", () => {
  it("autoplays silently before the first interaction and audible after unlock", () => {
    expect(playbackState({ ...base, soundUnlocked: false })).toEqual({ playing: true, muted: true });
    expect(playbackState(base)).toEqual({ playing: true, muted: false });
  });

  it("pauses when off-screen", () => {
    expect(playbackState({ ...base, active: false }).playing).toBe(false);
  });

  it("user pause wins over everything", () => {
    expect(playbackState({ ...base, userPaused: true }).playing).toBe(false);
    expect(playbackState({ ...base, userPaused: true, soundUnlocked: false }).playing).toBe(false);
  });

  it("pauses when the app is in the background", () => {
    expect(playbackState({ ...base, appActive: false }).playing).toBe(false);
  });

  it("off-screen players stay muted so a preloaded reel never leaks sound", () => {
    expect(playbackState({ ...base, active: false })).toEqual({ playing: false, muted: true });
  });
});
