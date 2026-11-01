/** A cancellable media effect: a late autoplay rejection must not restart an offscreen reel. */
export function syncVideoPlayback(
  media: Pick<HTMLVideoElement, "muted" | "play" | "pause">,
  state: { running: boolean; unlocked: boolean; muted: boolean },
  blocked: () => void,
  failed: () => void,
) {
  let cancelled = false;
  media.muted = !state.unlocked || state.muted;
  if (!state.running) media.pause();
  else void media.play().catch(async (error: { name?: string }) => {
    if (cancelled || error.name === "AbortError") return;
    if (error.name !== "NotAllowedError") { failed(); return; }
    media.muted = true;
    blocked();
    try { await media.play(); } catch { if (!cancelled) failed(); }
  });
  return () => { cancelled = true; media.pause(); };
}
