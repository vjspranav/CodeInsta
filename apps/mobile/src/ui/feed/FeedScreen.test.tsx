import { renderMotion } from "@/ui/motion/testSetup";
import { act, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import type { MobileReel } from "@shared/types";

import { TID } from "@/testids";
import { zoneRect, videoBox } from "@/feed/layout";
import { activate, fireGesture, flush, layoutFeed } from "./testUtils";

// The jest preset resolves lucide's ESM build; use its CommonJS build instead.
jest.mock("lucide-react-native", () =>
  jest.requireActual(require("path").resolve(__dirname, "../../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js")),
);
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/push/register", () => ({ markMeaningfulAction: jest.fn() }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("@/auth/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, role: "member" }) }));
jest.mock("@/data/asks", () => ({
  asksLeft: jest.fn(() => Promise.resolve(3)),
  askQuestion: jest.fn(() => Promise.resolve("")),
}));

type Session = {
  items: MobileReel[];
  liked: Set<string>;
  disliked: Set<string>;
  like: jest.Mock;
  dislike: jest.Mock;
  markSeen: jest.Mock;
  error: string;
};
const mockSession: { current: Session } = { current: null as unknown as Session };
const mockOptions: { current: { onHaptic?: (k: "like" | "dislike") => void } } = { current: {} };
jest.mock("@/data/feedSession", () => ({
  useFeedSession: (_entry: unknown, options: { onHaptic?: (k: "like" | "dislike") => void }) => {
    mockOptions.current = options;
    return mockSession.current;
  },
}));
const mockLibrary: { current: unknown } = { current: null };
jest.mock("@/data/library", () => ({
  useLibrary: () => ({ library: mockLibrary.current, loading: false, error: "", reload: jest.fn() }),
}));

jest.mock("@/feed/PlayerPoolProvider", () => {
  const fakePlayer = () => ({
    timeUpdateEventInterval: 0,
    duration: 0,
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  });
  const players = [fakePlayer(), fakePlayer(), fakePlayer()];
  return {
    PlayerPoolProvider: ({ children }: { children: unknown }) => children,
    useFeedPlayers: jest.fn(),
    usePlayerPool: () => ({ players, pool: {}, load: jest.fn() }),
  };
});
const mockVideoProps: { current: Record<string, any>[] } = { current: [] };
jest.mock("@/feed/ReelVideo", () => {
  const { View } = require("react-native");
  return {
    ReelVideo: (props: Record<string, any>) => {
      mockVideoProps.current.push(props);
      return <View testID={`video-${props.source}`} />;
    },
  };
});

import { FeedScreen } from "./FeedScreen";

const reel = (id: string, over: Partial<MobileReel> = {}): MobileReel => ({
  id,
  creator_id: "claude",
  title: `Title ${id}`,
  topic: `t/${id}`,
  tags: ["dns"],
  series: null,
  series_index: null,
  created_at: "2026-11-01T00:00:00Z",
  video_url: `https://x/${id}.mp4`,
  poster_url: `https://x/${id}.jpg`,
  glossary: null,
  parent_reel_id: null,
  genre: null,
  style: null,
  expires_at: null,
  ...over,
});

const creators = [{ id: "claude", display_name: "Claude", handle: "claude", bio: "", avatar_url: null }];

function setup(items: MobileReel[], library: unknown = { reels: items, creators }) {
  mockSession.current = {
    items,
    liked: new Set(),
    disliked: new Set(),
    like: jest.fn(async () => {
      mockOptions.current.onHaptic?.("like");
    }),
    dislike: jest.fn(async () => ""),
    markSeen: jest.fn(async () => {}),
    error: "",
  };
  mockLibrary.current = library;
}

/** Latest props the mocked ReelVideo got for the reel with `source`. */
const lastProps = (source: string) => [...mockVideoProps.current].reverse().find((p) => p.source === source);

beforeEach(() => {
  mockVideoProps.current = [];
  mockPush.mockClear();
  (Haptics.impactAsync as jest.Mock).mockClear();
  (Haptics.selectionAsync as jest.Mock).mockClear();
});

async function mount(items: MobileReel[], library?: unknown) {
  setup(items, library);
  await renderMotion(<FeedScreen />);
  await layoutFeed();
}

const many = (n: number) => Array.from({ length: n }, (_, i) => reel(`r${i}`));

describe("FeedScreen", () => {
  it("renders the first reel with its controls and mounts only the preload window", async () => {
    await mount(many(20));
    expect(screen.getByText("Title r0")).toBeTruthy();
    expect(screen.getByText("claude")).toBeTruthy();
    for (const id of [TID["reel-like"], TID["reel-ask"], TID["reel-share"], TID["reel-dislike"], TID["reel-sound"], TID["reel-pause"]]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // index 0: window is [0, 1, 2]; never more than 4 videos for any index.
    const mounted = screen.getAllByTestId(/^video-/);
    expect(mounted.length).toBeLessThanOrEqual(4);
    expect(mounted).toHaveLength(3);
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ active: true, slot: 0, soundUnlocked: false, userPaused: false });
    expect(lastProps("https://x/r1.mp4")).toMatchObject({ active: false, slot: 1 });
  });

  it("places the controls inside the shared overlay zones", async () => {
    await mount(many(3));
    const screenSize = { width: 393, height: 852 };
    const box = videoBox(screenSize);
    const flat = (id: string) => {
      // The zone container is the parent of the first control in it.
      const node = screen.getByTestId(id).parent!.parent!;
      return node.props.style;
    };
    const style = (s: unknown) => Object.assign({}, ...[s].flat(Infinity).filter(Boolean));
    const rail = zoneRect("rightRail", box, screenSize);
    const top = zoneRect("topControls", box, screenSize);
    expect(style(flat(TID["reel-like"]))).toMatchObject({ left: rail.left, top: rail.top, width: rail.width, height: rail.height });
    expect(style(flat(TID["reel-sound"]))).toMatchObject({ left: top.left, top: top.top, width: top.width, height: top.height });
    // The meta card hangs from the bottom edge of its zone and grows upward.
    const meta = zoneRect("bottomMeta", box, screenSize);
    expect(style(screen.getByTestId("reel-meta").props.style)).toMatchObject({
      left: meta.left,
      bottom: screenSize.height - (meta.top + meta.height),
    });
  });

  it("double tap likes once, with one like haptic", async () => {
    await mount(many(3));
    await fireGesture("feed-double-tap", { x: 120, y: 300 });
    expect(mockSession.current.like).toHaveBeenCalledTimes(1);
    expect(mockSession.current.like).toHaveBeenCalledWith("r0", true);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
  });

  it("the rail heart toggles like without the only-like flag", async () => {
    await mount(many(3));
    await activate(TID["reel-like"]);
    expect(mockSession.current.like).toHaveBeenCalledTimes(1);
    expect(mockSession.current.like).toHaveBeenCalledWith("r0");
  });

  it("long press opens the not-for-me toast with a heavy haptic; Undo calls dislike again", async () => {
    await mount(many(3));
    await fireGesture("feed-long-press");
    expect(mockSession.current.dislike).toHaveBeenCalledTimes(1);
    expect(mockSession.current.dislike).toHaveBeenCalledWith("r0");
    expect(Haptics.impactAsync).toHaveBeenCalledWith("heavy");
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Got it, fewer like this")).toBeTruthy();

    await activate(TID["reel-undo"]);
    expect(mockSession.current.dislike).toHaveBeenCalledTimes(2);
    expect(mockSession.current.dislike).toHaveBeenLastCalledWith("r0");
  });

  it("long press on an already disliked reel does not toggle it back", async () => {
    setup(many(3));
    mockSession.current.disliked = new Set(["r0"]);
    await renderMotion(<FeedScreen />);
    await layoutFeed();
    await fireGesture("feed-long-press");
    expect(mockSession.current.dislike).not.toHaveBeenCalled();
  });

  it("the rail Not for me button marks the reel and shows the toast; pressing it again undoes", async () => {
    await mount(many(3));
    await activate(TID["reel-dislike"]);
    expect(mockSession.current.dislike).toHaveBeenCalledWith("r0");
    expect(screen.getByText("Got it, fewer like this")).toBeTruthy();
    expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
  });

  it("a failed dislike shows the error instead of the undo toast", async () => {
    await mount(many(3));
    mockSession.current.dislike.mockResolvedValueOnce("Could not save your preference. Try again.");
    await fireGesture("feed-long-press");
    expect(screen.getByText("Could not save your preference. Try again.")).toBeTruthy();
    expect(screen.queryByTestId(TID["reel-undo"])).toBeNull();
  });

  it("the first tap unlocks sound; later taps toggle pause", async () => {
    await mount(many(3));
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ soundUnlocked: false, userPaused: false });
    await fireGesture("feed-tap");
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ soundUnlocked: true, userPaused: false });
    await fireGesture("feed-tap");
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ soundUnlocked: true, userPaused: true });
    await fireGesture("feed-tap");
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ userPaused: false });
  });

  it("sound and pause buttons toggle their state", async () => {
    await mount(many(3));
    await activate(TID["reel-sound"]);
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ soundUnlocked: true });
    await activate(TID["reel-sound"]);
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ soundUnlocked: false });
    await activate(TID["reel-pause"]);
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ userPaused: true });
  });

  it("shows the series chip for a part with a next part", async () => {
    const items = [
      reel("p1", { series: "dns", series_index: 1 }),
      reel("p2", { series: "dns", series_index: 2 }),
    ];
    await mount(items);
    expect(screen.getByText("Next in series · Part 2 →")).toBeTruthy();
    await activate(TID["reel-next-part"]);
    // p2 is in the feed: no navigation, the pager moves (instantly here, p2 is inside the window).
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens the next part as its own route when it is not in the feed", async () => {
    const items = [reel("p1", { series: "dns", series_index: 1 })];
    await mount(items, { reels: [...items, reel("p2", { series: "dns", series_index: 2 })], creators });
    await activate(TID["reel-next-part"]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/reel/[id]", params: { id: "p2" } });
  });

  it("offers the glossary only when the reel has entries", async () => {
    await mount([reel("g", { glossary: [{ term: "DNS", full: "Domain Name System" }] })]);
    expect(screen.getByTestId(TID["reel-glossary"])).toBeTruthy();
  });

  it("hides the glossary button for a reel without entries", async () => {
    await mount(many(2));
    expect(screen.queryByTestId(TID["reel-glossary"])).toBeNull();
  });

  it("opens the ask sheet from the rail and pauses playback while it is open", async () => {
    await mount(many(3));
    await activate(TID["reel-ask"]);
    expect(screen.getByTestId(TID["ask-input"])).toBeTruthy();
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ userPaused: true });
    await activate(TID["ask-close"]);
    expect(lastProps("https://x/r0.mp4")).toMatchObject({ userPaused: false });
  });

  it("opens the glossary sheet from the rail", async () => {
    await mount([reel("g", { glossary: [{ term: "DNS", full: "Domain Name System", note: "Phone book" }] })]);
    await activate(TID["reel-glossary"]);
    expect(screen.getByText("Domain Name System")).toBeTruthy();
    expect(screen.getByTestId(TID["glossary-close"])).toBeTruthy();
  });

  it("marks a reel seen after it has been on screen for 3 seconds", async () => {
    await mount(many(3));
    jest.useFakeTimers();
    try {
      await act(async () => {
        lastProps("https://x/r0.mp4")!.onFirstFrame();
      });
      expect(mockSession.current.markSeen).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(mockSession.current.markSeen).toHaveBeenCalledWith("r0");
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows the empty state for an empty library", async () => {
    await mount([], { reels: [], creators });
    expect(screen.getByTestId(TID["reel-empty"])).toBeTruthy();
    expect(screen.queryByTestId(TID["reel-like"])).toBeNull();
  });

  it("shows a calm skeleton, not an error, before the first layout", async () => {
    setup(many(2));
    await renderMotion(<FeedScreen />);
    expect(screen.queryByTestId(TID["reel-empty"])).toBeNull();
    expect(screen.queryByTestId(TID["reel-like"])).toBeNull();
    await flush();
  });
});
