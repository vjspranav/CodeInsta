import { renderMotion } from "@/ui/motion/testSetup";
import { act, screen } from "@testing-library/react-native";
import { createRef } from "react";
import type { MutableRefObject } from "react";
import { Text } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { getAnimatedStyle, setUpTests, useSharedValue } from "react-native-reanimated";

setUpTests();

import { fireGesture, flush } from "./testUtils";

jest.mock("lucide-react-native", () =>
  jest.requireActual(require("path").resolve(__dirname, "../../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js")),
);

import { FeedPager } from "./FeedPager";
import type { PagerController } from "./FeedPager";

type Handlers = {
  onSettle?: jest.Mock;
  onTap?: jest.Mock;
  onDoubleTap?: jest.Mock;
  onLongPress?: jest.Mock;
  controller?: MutableRefObject<PagerController | null>;
  chromeRef?: { current: { value: number } | null };
};

function Harness({ index, count = 20, handlers }: { index: number; count?: number; handlers: Handlers }) {
  const chrome = useSharedValue(1);
  if (handlers.chromeRef) handlers.chromeRef.current = chrome;
  return (
    <FeedPager
      count={count}
      width={393}
      height={700}
      index={index}
      onSettle={handlers.onSettle ?? jest.fn()}
      renderPage={(i) => <Text testID={`page-${i}`}>{`page ${i}`}</Text>}
      keyFor={(i) => `reel-${i}`}
      chrome={chrome}
      onTap={handlers.onTap ?? jest.fn()}
      onDoubleTap={handlers.onDoubleTap ?? jest.fn()}
      onLongPress={handlers.onLongPress ?? jest.fn()}
      controllerRef={handlers.controller}
    />
  );
}

/** Runs `fn` with jest fake timers, which also drive Reanimated's JS animation frames. */
async function withFakeTimers(fn: () => Promise<void>) {
  jest.useFakeTimers();
  try {
    await fn();
  } finally {
    jest.useRealTimers();
  }
}
async function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
  }
}

const pages = () => screen.queryAllByTestId(/^page-/).map((n) => Number(String(n.props.testID).slice(5)));

describe("FeedPager window", () => {
  it("mounts one behind and two ahead of the settled reel (never more than 4)", async () => {
    await renderMotion(<Harness index={10} handlers={{}} />);
    expect(pages()).toEqual([9, 10, 11, 12]);
  });

  it("clamps the window at both ends of the list", async () => {
    await renderMotion(<Harness index={0} handlers={{}} />);
    expect(pages()).toEqual([0, 1, 2]);
    await renderMotion(<Harness index={19} handlers={{}} />);
    expect(pages()).toContain(19);
    expect(pages().length).toBeLessThanOrEqual(4);
  });

  it("renders nothing for an empty list", async () => {
    await renderMotion(<Harness index={0} count={0} handlers={{}} />);
    expect(pages()).toEqual([]);
  });
});

describe("FeedPager gestures", () => {
  it("routes tap, double tap and long press to their callbacks", async () => {
    const handlers = { onTap: jest.fn(), onDoubleTap: jest.fn(), onLongPress: jest.fn() };
    await renderMotion(<Harness index={0} handlers={handlers} />);
    await fireGesture("feed-tap");
    await fireGesture("feed-double-tap", { x: 50, y: 60 });
    await fireGesture("feed-long-press");
    expect(handlers.onTap).toHaveBeenCalledTimes(1);
    expect(handlers.onDoubleTap).toHaveBeenCalledTimes(1);
    expect(handlers.onLongPress).toHaveBeenCalledTimes(1);
  });

  it("pops the heart at the tap point on a double tap", async () => {
    await renderMotion(<Harness index={0} handlers={{}} />);
    await fireGesture("feed-double-tap", { x: 200, y: 300 });
    const merged = (getAnimatedStyle as (el: unknown) => any)(screen.getByTestId("feed-heart"));
    expect(merged.opacity).toBe(1);
    // Centered on the tap: translate = tap - half the heart.
    const [tx, ty] = merged.transform;
    expect(tx.translateX).toBe(200 - 48);
    expect(ty.translateY).toBe(300 - 48);
  });

  it("jumps straight to a reel outside the mounted window", async () => {
    const onSettle = jest.fn();
    const controller = createRef<PagerController | null>() as MutableRefObject<PagerController | null>;
    await renderMotion(<Harness index={0} handlers={{ onSettle, controller }} />);
    await act(async () => controller.current!.scrollTo(15));
    expect(onSettle).toHaveBeenCalledWith(15);
  });

  it("ignores a scroll to the current or an invalid index", async () => {
    const onSettle = jest.fn();
    const controller = createRef<PagerController | null>() as MutableRefObject<PagerController | null>;
    await renderMotion(<Harness index={3} handlers={{ onSettle, controller }} />);
    await act(async () => {
      controller.current!.scrollTo(3);
      controller.current!.scrollTo(-1);
      controller.current!.scrollTo(99);
    });
    expect(onSettle).not.toHaveBeenCalled();
  });

  it("settles on the next reel after an upward swipe and brings the overlay back", async () => {
    await withFakeTimers(async () => {
      const onSettle = jest.fn();
      const chromeRef: Handlers["chromeRef"] = { current: null };
      await renderMotion(<Harness index={0} handlers={{ onSettle, chromeRef }} />);
      fireGestureHandler(getByGestureTestId("feed-pan"), [
        { state: State.BEGAN },
        { state: State.ACTIVE, changeY: 0, translationY: 0 },
        { changeY: -250, translationY: -250, velocityY: -800 },
        { state: State.END, velocityY: -800, translationY: -250 },
      ]);
      // Dragging: the overlay is faded out.
      await advance(250);
      expect(chromeRef.current!.value).toBe(0);
      await advance(1200);
      expect(onSettle).toHaveBeenCalledTimes(1);
      expect(onSettle).toHaveBeenCalledWith(1);
    });
  });

  it("stays on the reel after a short drag and restores the overlay", async () => {
    await withFakeTimers(async () => {
      const onSettle = jest.fn();
      const chromeRef: Handlers["chromeRef"] = { current: null };
      await renderMotion(<Harness index={0} handlers={{ onSettle, chromeRef }} />);
      fireGestureHandler(getByGestureTestId("feed-pan"), [
        { state: State.BEGAN },
        { state: State.ACTIVE, changeY: 0, translationY: 0 },
        { changeY: -40, translationY: -40, velocityY: -50 },
        { state: State.END, velocityY: -50, translationY: -40 },
      ]);
      await advance(1200);
      expect(onSettle).not.toHaveBeenCalled();
      expect(chromeRef.current!.value).toBe(1);
    });
  });
});
