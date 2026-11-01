import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppState } from "react-native";
import type { ReactNode } from "react";

type Listener = (payload?: any) => void;
const mockPlayers: any[] = [];
let mockReplaceBehavior: () => Promise<void> = () => Promise.resolve();
let mockVideoViewProps: any = null;

function mockMakePlayer() {
  const listeners: Record<string, Set<Listener>> = {};
  const player = {
    status: "idle",
    currentTime: 0,
    muted: true,
    loop: false,
    bufferOptions: {},
    play: jest.fn(),
    pause: jest.fn(),
    replaceAsync: jest.fn(() => mockReplaceBehavior()),
    addListener: jest.fn((name: string, fn: Listener) => {
      (listeners[name] ??= new Set()).add(fn);
      return { remove: () => listeners[name].delete(fn) };
    }),
    emit: (name: string, payload?: any) => listeners[name]?.forEach((fn) => fn(payload)),
  };
  mockPlayers.push(player);
  return player;
}

jest.mock("expo-video", () => {
  const { View } = require("react-native");
  const { useRef } = require("react");
  return {
    useVideoPlayer: (_s: unknown, setup?: (p: any) => void) => {
      const ref: { current: any } = useRef(null);
      if (!ref.current) {
        ref.current = mockMakePlayer();
        setup?.(ref.current);
      }
      return ref.current;
    },
    VideoView: (props: any) => {
      mockVideoViewProps = props;
      return <View testID="video-view" />;
    },
  };
});

const mockShared: { value: number }[] = [];
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const { useRef } = require("react");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (init: number) => {
      const ref: { current: any } = useRef(null);
      if (!ref.current) {
        ref.current = { value: init };
        mockShared.push(ref.current);
      }
      return ref.current;
    },
    useAnimatedStyle: (fn: () => object) => fn(),
  };
});

jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: Object.assign((props: any) => <View testID="poster-image" {...props} />, {
      prefetch: jest.fn(() => Promise.resolve(true)),
    }),
  };
});

import { ReelVideo, type ReelVideoProps } from "./ReelVideo";
import { PlayerPoolProvider, useFeedPlayers } from "./PlayerPoolProvider";
import { videoBox } from "./layout";
import { slotFor } from "./playerPool";

const reels = [
  { source: "https://cdn/0.mp4", poster: "https://cdn/0.jpg" },
  { source: "https://cdn/1.mp4", poster: "https://cdn/1.jpg" },
  { source: "https://cdn/2.mp4", poster: "https://cdn/2.jpg" },
  { source: "https://cdn/3.mp4", poster: "https://cdn/3.jpg" },
];

function Harness({ index = 0, active = true, settled = 0, extra }: { index?: number; active?: boolean; settled?: number; extra?: Partial<ReelVideoProps> }) {
  useFeedPlayers(reels, settled);
  return (
    <ReelVideo
      source={reels[index].source}
      poster={reels[index].poster}
      active={active}
      slot={slotFor(index)}
      box={videoBox({ width: 393, height: 852 })}
      soundUnlocked
      userPaused={false}
      onFirstFrame={() => {}}
      onEnd={() => {}}
      onError={() => {}}
      {...extra}
    />
  );
}

const wrap = (node: ReactNode) => <PlayerPoolProvider>{node}</PlayerPoolProvider>;
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const posterOpacity = () => mockShared[mockShared.length - 1].value;

const setAppState = (state: string) => {
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });
};

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  setAppState("active");
  mockPlayers.length = 0;
  mockShared.length = 0;
  mockVideoViewProps = null;
  mockReplaceBehavior = () => Promise.resolve();
});

describe("ReelVideo", () => {
  it("creates exactly 3 players and loads the active reel plus the next two ahead of time", async () => {
    await render(wrap(<Harness />));
    await flush();
    expect(mockPlayers).toHaveLength(3);
    expect(mockPlayers[0].replaceAsync).toHaveBeenCalledWith({ uri: reels[0].source, useCaching: true });
    expect(mockPlayers[1].replaceAsync).toHaveBeenCalledWith({ uri: reels[1].source, useCaching: true });
    expect(mockPlayers[2].replaceAsync).toHaveBeenCalledWith({ uri: reels[2].source, useCaching: true });
  });

  it("keeps the poster (opacity 1) until the first rendered frame, then hides it and reports it", async () => {
    const onFirstFrame = jest.fn();
    await render(wrap(<Harness extra={{ onFirstFrame }} />));
    await flush();
    expect(screen.getByTestId("poster-image")).toBeTruthy();
    expect(posterOpacity()).toBe(1);
    expect(onFirstFrame).not.toHaveBeenCalled();
    await act(async () => { mockVideoViewProps.onFirstFrameRender(); });
    expect(posterOpacity()).toBe(0);
    expect(onFirstFrame).toHaveBeenCalledTimes(1);
  });

  it("uses a cached poster with no transition and never mounts the video before its slot is loaded", async () => {
    const resolvers: (() => void)[] = [];
    mockReplaceBehavior = () => new Promise<void>((r) => { resolvers.push(r); });
    await render(wrap(<Harness />));
    expect(screen.queryByTestId("video-view")).toBeNull();
    expect(screen.getByTestId("poster-image").props.cachePolicy).toBe("memory-disk");
    expect(screen.getByTestId("poster-image").props.transition).toBe(0);
    await act(async () => { resolvers.forEach((r) => r()); await Promise.resolve(); });
    expect(screen.getByTestId("video-view")).toBeTruthy();
  });

  it("plays when active, pauses when active turns false, and mutes off-screen players", async () => {
    const view = await render(wrap(<Harness active />));
    await flush();
    const player = mockPlayers[0];
    expect(player.play).toHaveBeenCalled();
    expect(player.muted).toBe(false);
    player.pause.mockClear();
    await view.rerender(wrap(<Harness active={false} />));
    expect(player.pause).toHaveBeenCalled();
    expect(player.muted).toBe(true);
  });

  it("pauses when the app goes to the background", async () => {
    let change: ((s: string) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, fn: (s: string) => void) => {
      change = fn;
      return { remove: jest.fn() };
    }) as never);
    await render(wrap(<Harness />));
    await flush();
    const player = mockPlayers[0];
    expect(player.play).toHaveBeenCalled();
    player.pause.mockClear();
    setAppState("background");
    await act(async () => { change?.("background"); });
    expect(player.pause).toHaveBeenCalled();
  });

  it("user pause and sound lock are respected", async () => {
    const view = await render(wrap(<Harness extra={{ soundUnlocked: false }} />));
    await flush();
    expect(mockPlayers[0].muted).toBe(true);
    await view.rerender(wrap(<Harness extra={{ userPaused: true }} />));
    expect(mockPlayers[0].pause).toHaveBeenCalled();
  });

  it("shows Retry (not a spinner) after a load error and reloads on press", async () => {
    const onError = jest.fn();
    mockReplaceBehavior = () => Promise.reject(new Error("net"));
    await render(wrap(<Harness extra={{ onError }} />));
    await flush();
    expect(onError).toHaveBeenCalled();
    const retry = screen.getByTestId("reel-retry");
    expect(screen.queryByTestId("video-view")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    mockReplaceBehavior = () => Promise.resolve();
    await fireEvent.press(retry);
    await flush();
    expect(mockPlayers[0].replaceAsync).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("reel-retry")).toBeNull();
    expect(screen.getByTestId("video-view")).toBeTruthy();
  });

  it("shows Retry when the player reports an error status", async () => {
    await render(wrap(<Harness />));
    await flush();
    await act(async () => { mockPlayers[0].emit("statusChange", { status: "error" }); });
    expect(screen.getByTestId("reel-retry")).toBeTruthy();
  });

  it("reports the end of an active reel only", async () => {
    const onEnd = jest.fn();
    const view = await render(wrap(<Harness extra={{ onEnd }} />));
    await flush();
    await act(async () => { mockPlayers[0].emit("playToEnd"); });
    expect(onEnd).toHaveBeenCalledTimes(1);
    await view.rerender(wrap(<Harness active={false} extra={{ onEnd }} />));
    await act(async () => { mockPlayers[0].emit("playToEnd"); });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("swiping on replaces a single player and a row whose slot was reused falls back to its poster", async () => {
    const first = await render(wrap(<Harness index={0} settled={0} />));
    await flush();
    expect(mockPlayers[0].replaceAsync).toHaveBeenCalledTimes(1);
    await first.rerender(wrap(<Harness index={0} settled={1} />));
    await flush();
    // reel 3 took slot 0; reel 0 no longer owns a player
    expect(mockPlayers[0].replaceAsync).toHaveBeenCalledTimes(2);
    expect(mockPlayers[0].replaceAsync).toHaveBeenLastCalledWith({ uri: reels[3].source, useCaching: true });
    expect(mockPlayers[1].replaceAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("video-view")).toBeNull();
    expect(posterOpacity()).toBe(1);
  });
});
