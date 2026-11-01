export type PlaybackInput = {
  active: boolean;
  soundUnlocked: boolean;
  userPaused: boolean;
  appActive: boolean;
};

/**
 * Pure playback rules (port of the web video-playback rules): off-screen pauses, audio stays muted
 * until the first tap unlocks sound, a user pause wins, and a backgrounded app pauses.
 * An off-screen player is always muted so a preloaded reel can never leak sound.
 */
export function playbackState({ active, soundUnlocked, userPaused, appActive }: PlaybackInput): { playing: boolean; muted: boolean } {
  return {
    playing: active && appActive && !userPaused,
    muted: !active || !soundUnlocked,
  };
}
