import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { VideoView } from "expo-video";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { designColors, designTokens } from "@shared/design-tokens";
import { TID } from "@/testids";
import { playbackState } from "./playback";
import { usePlayerPool } from "./PlayerPoolProvider";
import type { VideoBox } from "./layout";
import { useAppActive } from "./useAppActive";

const colors = designColors("dark");

export type ReelVideoProps = {
  source: string;
  poster: string | null;
  /** True only for the reel the pager has settled on. Never derived from scroll position. */
  active: boolean;
  /** `slotFor(index)`: which pooled player this row borrows. */
  slot: number;
  box: VideoBox;
  soundUnlocked: boolean;
  userPaused: boolean;
  onFirstFrame(): void;
  onEnd(): void;
  onError(): void;
};

/**
 * One reel's video surface. It never creates a player: it borrows pool slot `slot` once the pool
 * reports that slot loaded with `source`. The poster sits underneath and goes transparent on the
 * video's first rendered frame (a shared-value write on the UI thread, no React render), so there
 * is no black or white flash. Failures show a Retry button, never a spinner.
 */
function ReelVideoImpl(props: ReelVideoProps) {
  const { source, poster, active, slot, box, soundUnlocked, userPaused } = props;
  const { players, pool, load } = usePlayerPool();
  const player = players[slot];
  const appActive = useAppActive();
  const state = useSyncExternalStore(
    pool.subscribe,
    () => pool.stateOf(slot, source),
    () => "none" as const,
  );
  const ready = state === "ready";

  const callbacks = useRef(props);
  callbacks.current = props;
  const [playerFailed, setPlayerFailed] = useState(false);
  const posterOpacity = useSharedValue(1);
  const firstFrameSeen = useRef(false);
  const hasBeenActive = useRef(false);
  const posterStyle = useAnimatedStyle(() => ({ opacity: posterOpacity.value }));

  // The poster returns whenever this row no longer owns a loaded player.
  useEffect(() => {
    if (!ready) {
      posterOpacity.value = 1;
      firstFrameSeen.current = false;
      setPlayerFailed(false);
    }
  }, [ready, posterOpacity]);

  // Player events only matter while this row owns a loaded player.
  useEffect(() => {
    if (!ready) return;
    if (player.status === "error") setPlayerFailed(true);
    const status = player.addListener("statusChange", ({ status: next }) => {
      if (next === "error") {
        setPlayerFailed(true);
        callbacks.current.onError();
      }
    });
    const end = player.addListener("playToEnd", () => {
      if (callbacks.current.active) callbacks.current.onEnd();
    });
    return () => {
      status.remove();
      end.remove();
    };
  }, [ready, player]);

  useEffect(() => {
    if (state === "error") callbacks.current.onError();
  }, [state]);

  // Settled-index driven: replay from the start when a reel becomes active again.
  useEffect(() => {
    if (!ready || !active) return;
    if (hasBeenActive.current && player.currentTime > 0.05) player.currentTime = 0;
    hasBeenActive.current = true;
    if (firstFrameSeen.current) callbacks.current.onFirstFrame();
  }, [ready, active, player]);

  useEffect(() => {
    if (!ready || playerFailed) return;
    const { playing, muted } = playbackState({ active, soundUnlocked, userPaused, appActive });
    player.muted = muted;
    if (playing) player.play();
    else player.pause();
  }, [ready, playerFailed, active, soundUnlocked, userPaused, appActive, player]);

  const handleFirstFrame = useCallback(() => {
    posterOpacity.value = 0;
    firstFrameSeen.current = true;
    if (callbacks.current.active) callbacks.current.onFirstFrame();
  }, [posterOpacity]);

  const retry = useCallback(() => {
    setPlayerFailed(false);
    load(slot, source);
  }, [load, slot, source]);

  const failed = playerFailed || state === "error";

  return (
    <View style={styles.fill} pointerEvents={failed ? "auto" : "none"}>
      {ready && !failed ? (
        <VideoView
          player={player}
          style={{ position: "absolute", left: 0, top: box.top, width: box.width, height: box.height }}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
          surfaceType="textureView"
          useExoShutter={false}
          onFirstFrameRender={handleFirstFrame}
          pointerEvents="none"
        />
      ) : null}
      <Animated.View style={[styles.fill, posterStyle]} pointerEvents="none" testID="reel-poster">
        {poster ? (
          <Image
            source={{ uri: poster }}
            style={{ position: "absolute", left: 0, top: box.top, width: box.width, height: box.height }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            recyclingKey={source}
          />
        ) : null}
      </Animated.View>
      {failed ? (
        <View style={styles.retryWrap} pointerEvents="box-none">
          <Pressable testID={TID["reel-retry"]} onPress={retry} accessibilityRole="button" style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export const ReelVideo = memo(ReelVideoImpl);

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  fill: { ...FILL, backgroundColor: colors.reelBg },
  retryWrap: { ...FILL, alignItems: "center", justifyContent: "center" },
  retry: {
    paddingHorizontal: designTokens.space["5"],
    paddingVertical: designTokens.space["3"],
    borderRadius: designTokens.radius.md,
    backgroundColor: colors.overlayChip,
  },
  retryText: { color: colors.text, fontSize: designTokens.type.body.size, fontWeight: "600" },
});
