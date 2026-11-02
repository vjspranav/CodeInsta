import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useIsFocused, useRouter } from "expo-router";
import { Film } from "lucide-react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileReel } from "@shared/types";

import { useFeedSession } from "@/data/feedSession";
import type { HapticKind } from "@/data/feedSession";
import { useLibrary } from "@/data/library";
import { videoBox, zoneRect } from "@/feed/layout";

import { PlayerPoolProvider, useFeedPlayers } from "@/feed/PlayerPoolProvider";
import { slotFor } from "@/feed/playerPool";
import { ReelVideo } from "@/feed/ReelVideo";
import { perf } from "@/perf/probe";
import { TID, reelPageId } from "@/testids";
import { haptic, tokens } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { AskSheet } from "@/ui/sheets/AskSheet";
import { GlossarySheet } from "@/ui/sheets/GlossarySheet";
import { FeedPager } from "./FeedPager";
import type { PagerController } from "./FeedPager";
import { FeedSkeleton } from "./FeedSkeleton";
import { nextPartMap } from "./nextPart";
import { clampIndex } from "./pagerMath";
import { ReelOverlay } from "./ReelOverlay";
import type { OverlayRects } from "./ReelOverlay";
import { Toast } from "./Toast";
import type { ToastData } from "./Toast";

/** A reel counts as seen after this long on screen (the same 3 s as web). */
export const SEEN_AFTER_MS = 3000;
export const DISLIKE_COPY = "Got it, fewer like this";
const UNAVAILABLE_COPY = "This reel is not available.";

/** The pager fires the heavy long-press haptic and the rail its own; only the like haptic comes from the session. */
function sessionHaptic(kind: HapticKind): void {
  if (kind === "like") haptic("like");
}

type Size = { width: number; height: number };
type SheetKind = "ask" | "glossary";

export type FeedScreenProps = {
  /** Deep link: the reel (and any unseen earlier parts of its story) that leads the feed. */
  entryReelId?: string;
};

/** The feed tab and the `reel/[id]` deep link. Owns the 3 native players for as long as it is mounted. */
export function FeedScreen(props: FeedScreenProps) {
  return (
    <PlayerPoolProvider>
      <FeedScreenBody {...props} />
    </PlayerPoolProvider>
  );
}

function FeedScreenBody({ entryReelId }: FeedScreenProps) {
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { library, loading, error: loadError, reload } = useLibrary();
  const { items, liked, disliked, like, dislike, markSeen, error } = useFeedSession(entryReelId, {
    onHaptic: sessionHaptic,
  });

  const [size, setSize] = useState<Size | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  // The settled reel is tracked by id so a background refresh that reorders `items` never moves
  // the user to a different reel.
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastIndex = useRef(0);
  const index = useMemo(() => {
    if (!items.length) return 0;
    const found = activeId ? items.findIndex((r) => r.id === activeId) : 0;
    return clampIndex(found >= 0 ? found : lastIndex.current, items.length);
  }, [items, activeId]);
  lastIndex.current = index;
  const active: MobileReel | undefined = items[index];

  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [openSheet, setOpenSheet] = useState<SheetKind | null>(null);
  const [sheetReel, setSheetReel] = useState<MobileReel | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastId = useRef(0);
  const firstTouch = useRef(true);
  const seenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pager = useRef<PagerController | null>(null);
  const chrome = useSharedValue(1);

  const live = useRef({ active, items, index, disliked });
  live.current = { active, items, index, disliked };

  const feedReels = useMemo(
    () => items.map((r) => ({ source: r.video_url, poster: r.poster_url })),
    [items],
  );
  useFeedPlayers(feedReels, index);

  const nextByReel = useMemo(() => nextPartMap(library?.reels ?? []), [library]);
  const creator = useMemo(
    () => library?.creators.find((c) => c.id === active?.creator_id),
    [library, active?.creator_id],
  );

  const geometry = useMemo(() => {
    if (!size) return null;
    const box = videoBox(size);
    const topControls = zoneRect("topControls", box, size);
    const rects: OverlayRects = {
      // Keep the sound and pause chips below the status bar on screens that crop the video.
      topControls: { ...topControls, top: Math.max(topControls.top, insets.top) },
      rightRail: zoneRect("rightRail", box, size),
      bottomMeta: zoneRect("bottomMeta", box, size),
    };
    return { box, rects };
  }, [size, insets.top]);

  const showToast = useCallback((data: Omit<ToastData, "id">) => {
    toastId.current += 1;
    setToast({ ...data, id: toastId.current });
  }, []);
  const dismissToast = useCallback((id: number) => setToast((t) => (t?.id === id ? null : t)), []);

  useEffect(() => {
    if (error) showToast({ message: error });
  }, [error, showToast]);

  useEffect(
    () => () => {
      if (seenTimer.current) clearTimeout(seenTimer.current);
    },
    [],
  );

  /** The first interaction of any kind unlocks sound (web does the same). True when it was the first. */
  const unlockSound = useCallback((): boolean => {
    if (!firstTouch.current) return false;
    firstTouch.current = false;
    setSoundUnlocked(true);
    return true;
  }, []);

  const undoDislike = useCallback(
    async (id: string) => {
      haptic("refresh");
      const failure = await dislike(id);
      if (failure) showToast({ message: failure });
    },
    [dislike, showToast],
  );

  const markNotForMe = useCallback(
    async (id: string) => {
      const failure = await dislike(id);
      if (failure) {
        showToast({ message: failure });
        return;
      }
      showToast({
        message: DISLIKE_COPY,
        actionLabel: "Undo",
        actionTestID: TID["reel-undo"],
        onAction: () => void undoDislike(id),
      });
    },
    [dislike, showToast, undoDislike],
  );

  const onSettle = useCallback((i: number) => {
    const reel = live.current.items[i];
    if (!reel) return;
    perf.pageChanged();
    if (seenTimer.current) clearTimeout(seenTimer.current);
    setActiveId(reel.id);
    setUserPaused(false);
  }, []);

  const onTap = useCallback(() => {
    if (unlockSound()) return;
    setUserPaused((paused) => !paused);
  }, [unlockSound]);

  const onDoubleTap = useCallback(() => {
    unlockSound();
    const reel = live.current.active;
    if (reel) void like(reel.id, true);
  }, [like, unlockSound]);

  const onLongPress = useCallback(() => {
    const reel = live.current.active;
    if (!reel) return;
    unlockSound();
    haptic("longPress");
    if (!live.current.disliked.has(reel.id)) void markNotForMe(reel.id);
  }, [markNotForMe, unlockSound]);

  const onLike = useCallback(() => {
    unlockSound();
    const reel = live.current.active;
    if (reel) void like(reel.id);
  }, [like, unlockSound]);

  const onDislike = useCallback(() => {
    unlockSound();
    const reel = live.current.active;
    if (!reel) return;
    if (live.current.disliked.has(reel.id)) {
      void undoDislike(reel.id);
      return;
    }
    void markNotForMe(reel.id);
  }, [markNotForMe, undoDislike, unlockSound]);

  const openSheetFor = useCallback((kind: SheetKind) => {
    const reel = live.current.active;
    if (!reel) return;
    firstTouch.current = false;
    setSheetReel(reel);
    setOpenSheet(kind);
  }, []);
  const onAsk = useCallback(() => openSheetFor("ask"), [openSheetFor]);
  const onGlossary = useCallback(() => openSheetFor("glossary"), [openSheetFor]);
  const closeSheet = useCallback(() => setOpenSheet(null), []);

  const onToggleSound = useCallback(() => {
    firstTouch.current = false;
    setSoundUnlocked((on) => !on);
  }, []);
  const onTogglePause = useCallback(() => {
    firstTouch.current = false;
    setUserPaused((paused) => !paused);
  }, []);

  const onNextPart = useCallback(
    (next: MobileReel) => {
      const target = live.current.items.findIndex((r) => r.id === next.id);
      if (target >= 0) pager.current?.scrollTo(target);
      else router.push({ pathname: "/reel/[id]", params: { id: next.id } });
    },
    [router],
  );

  const onFirstFrame = useCallback(() => {
    perf.playing();
    const reel = live.current.active;
    if (!reel) return;
    if (seenTimer.current) clearTimeout(seenTimer.current);
    seenTimer.current = setTimeout(() => void markSeen(reel.id), SEEN_AFTER_MS);
  }, [markSeen]);
  const onEnd = useCallback(() => pager.current?.scrollTo(live.current.index + 1), []);
  const onError = useCallback(() => {}, []);

  const videoPaused = userPaused || openSheet !== null || !focused;

  const keyFor = useCallback((i: number) => live.current.items[i]?.id ?? String(i), []);
  const renderPage = useCallback(
    (i: number) => {
      const reel = items[i];
      if (!reel || !geometry) return null;
      return (
        <View style={StyleSheet.absoluteFill} testID={reelPageId(i)}>
          <ReelVideo
            source={reel.video_url}
            poster={reel.poster_url}
            active={i === index}
            slot={slotFor(i)}
            box={geometry.box}
            soundUnlocked={soundUnlocked}
            userPaused={videoPaused}
            onFirstFrame={onFirstFrame}
            onEnd={onEnd}
            onError={onError}
          />
        </View>
      );
    },
    [items, geometry, index, soundUnlocked, videoPaused, onFirstFrame, onEnd, onError],
  );

  const entryMissing = Boolean(entryReelId && library && !library.reels.some((r) => r.id === entryReelId));

  let body;
  if (!size || !geometry) {
    body = null;
  } else if (!library) {
    body = loading ? (
      <FeedSkeleton rail={geometry.rects.rightRail} meta={geometry.rects.bottomMeta} height={size.height} />
    ) : (
      <View style={styles.error}>
        <EmptyState
          title="Could not load your feed"
          body={loadError || undefined}
          icon={<Film size={tokens.layout.controlHeight / 2} color={tokens.color.muted} />}
        />
        <Button label="Try again" onPress={reload} variant="secondary" style={styles.retry} />
      </View>
    );
  } else if (entryMissing || items.length === 0) {
    body = (
      <EmptyState
        testID={TID["reel-empty"]}
        title={entryMissing ? UNAVAILABLE_COPY : "No reels yet"}
        body={entryMissing ? undefined : "New reels show up here as soon as they are published."}
        icon={<Film size={tokens.layout.controlHeight / 2} color={tokens.color.muted} />}
      />
    );
  } else if (active) {
    body = (
      <>
        <FeedPager
          testID="feed-pager"
          count={items.length}
          width={size.width}
          height={size.height}
          index={index}
          onSettle={onSettle}
          renderPage={renderPage}
          keyFor={keyFor}
          chrome={chrome}
          onTap={onTap}
          onDoubleTap={onDoubleTap}
          onLongPress={onLongPress}
          controllerRef={pager}
        />
        <ReelOverlay
          chrome={chrome}
          rects={geometry.rects}
          width={size.width}
          height={size.height}
          reel={active}
          creator={creator}
          next={nextByReel.get(active.id)}
          slot={slotFor(index)}
          liked={liked.has(active.id)}
          disliked={disliked.has(active.id)}
          soundOn={soundUnlocked}
          paused={userPaused}
          onLike={onLike}
          onAsk={onAsk}
          onGlossary={onGlossary}
          onDislike={onDislike}
          onToggleSound={onToggleSound}
          onTogglePause={onTogglePause}
          onNextPart={onNextPart}
        />
        {toast ? (
          <Toast
            key={toast.id}
            {...toast}
            bottom={size.height - geometry.rects.bottomMeta.top + tokens.space[2]}
            onDismiss={dismissToast}
            testID="reel-toast"
          />
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.root} onLayout={onLayout} testID="feed-screen">
      {body}
      <AskSheet
        visible={openSheet === "ask"}
        onClose={closeSheet}
        reel={sheetReel}
        onSent={(message) => showToast({ message })}
      />
      <GlossarySheet visible={openSheet === "glossary"} onClose={closeSheet} entries={sheetReel?.glossary ?? []} />
    </View>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.reelBg },
  error: { flex: 1 },
  retry: { alignSelf: "center", marginBottom: tokens.space[8] },
});
