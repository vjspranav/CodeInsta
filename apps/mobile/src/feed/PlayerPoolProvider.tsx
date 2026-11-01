import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Image } from "expo-image";
import { useVideoPlayer, type VideoPlayer, type VideoSource } from "expo-video";
import { PlayerPool, POOL_SIZE, type SyncStep } from "./playerPool";
import { preloadWindow } from "./preload";

/** Cached source so a replayed or preloaded reel does not hit the network twice. */
export function toVideoSource(uri: string): VideoSource {
  return { uri, useCaching: true };
}

/** One-time player setup. Forward buffer is bounded so 3 players stay light on memory. */
function configurePlayer(player: VideoPlayer) {
  player.loop = false;
  player.muted = true;
  player.bufferOptions = {
    preferredForwardBufferDuration: 12,
    minBufferForPlayback: 1,
    waitsToMinimizeStalling: false,
    prioritizeTimeOverSizeThreshold: true,
  };
}

type PoolApi = {
  players: VideoPlayer[];
  pool: PlayerPool;
  /** Loads `source` into the slot's player and tracks the result in the pool. */
  load: (slot: number, source: string) => void;
};

const PoolContext = createContext<PoolApi | null>(null);

/**
 * Owns the 3 native players for the whole feed. Hooks are called a fixed 3 times, never per row,
 * and rows borrow a player by slot (index % 3).
 */
export function PlayerPoolProvider({ children }: { children: ReactNode }) {
  const p0 = useVideoPlayer(null, configurePlayer);
  const p1 = useVideoPlayer(null, configurePlayer);
  const p2 = useVideoPlayer(null, configurePlayer);
  const poolRef = useRef<PlayerPool | null>(null);
  if (!poolRef.current) poolRef.current = new PlayerPool(POOL_SIZE);
  const pool = poolRef.current;
  const players = useMemo(() => [p0, p1, p2], [p0, p1, p2]);

  const load = useCallback(
    (slot: number, source: string) => {
      const player = players[slot];
      player.pause();
      player.muted = true;
      pool.mark(slot, source, "loading");
      player.replaceAsync(toVideoSource(source)).then(
        () => pool.mark(slot, source, "ready"),
        () => pool.mark(slot, source, "error"),
      );
    },
    [players, pool],
  );

  const api = useMemo(() => ({ players, pool, load }), [players, pool, load]);
  return <PoolContext.Provider value={api}>{children}</PoolContext.Provider>;
}

export function usePlayerPool(): PoolApi {
  const api = useContext(PoolContext);
  if (!api) throw new Error("usePlayerPool must be used inside PlayerPoolProvider");
  return api;
}

export type FeedReel = { source: string | null; poster: string | null };

/**
 * Warms the pool for the pager's settled index. Call it with the index the pager reports once a
 * swipe settles, never from scroll events: the effect runs only when `settledIndex` or the list
 * changes, so nothing happens during scroll. Posters for the window (plus one behind) are
 * prefetched into the expo-image cache.
 */
export function useFeedPlayers(reels: ReadonlyArray<FeedReel>, settledIndex: number): void {
  const { pool, load } = usePlayerPool();
  useEffect(() => {
    const steps: SyncStep[] = pool.sync(settledIndex, reels.map((r) => r.source));
    for (const step of steps) load(step.slot, step.source);
    const posters = preloadWindow(settledIndex, reels.length, 3, 1)
      .map((i) => reels[i].poster)
      .filter((u): u is string => !!u);
    if (posters.length) void Image.prefetch(posters, "memory-disk");
  }, [reels, settledIndex, pool, load]);
}
