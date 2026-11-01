import { renderMotion } from "./testSetup";
import { act, cleanup, fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { createGestureController, fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { State } from "react-native-gesture-handler";
import { MotionTabBar, TabIconPop } from "./tabBar";
import type { MotionTab } from "./tabBar";
import { useReducedMotion } from "./reducedMotion";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("./reducedMotion", () => ({
  ...jest.requireActual("./reducedMotion"),
  useReducedMotion: jest.fn(() => false),
}));
const reduced = useReducedMotion as jest.Mock;

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
function styleOf(el: { props: { style?: unknown; jestAnimatedStyle?: { value?: object } } }) {
  return { ...(StyleSheet.flatten(el.props.style as never) ?? {}), ...(el.props.jestAnimatedStyle?.value ?? {}) } as Record<string, any>;
}
const tx = (id: string) => (styleOf(screen.getByTestId(id)).transform ?? []).find((t: any) => t.translateX !== undefined)?.translateX ?? 0;
const tap = (id: string) =>
  fireGestureHandler(getByGestureTestId(id), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]);

const tabs: MotionTab[] = ["feed", "explore", "inbox", "profiles"].map((k) => ({
  key: k,
  label: k,
  testID: `tab-${k}`,
  icon: () => <Text>{k}</Text>,
}));

beforeEach(() => {
  jest.useFakeTimers();
  reduced.mockReturnValue(false);
  jest.clearAllMocks();
});
afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
});

const bar = (activeIndex: number, onSelect = jest.fn()) => (
  <MotionTabBar testID="bar" tabs={tabs} activeIndex={activeIndex} onSelect={onSelect} />
);
const measure = () =>
  fireEvent(screen.getByTestId("bar"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 64 } } });

describe("MotionTabBar", () => {
  it("renders every tab as an accessible tab with its testID and selected state", async () => {
    await renderMotion(bar(1));
    expect(screen.getByTestId("tab-explore").props.accessibilityRole).toBe("tab");
    expect(screen.getByTestId("tab-explore").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("tab-feed").props.accessibilityState).toMatchObject({ selected: false });
  });

  it("selects the tapped tab and fires a selection haptic only when the tab changes", async () => {
    const onSelect = jest.fn();
    await renderMotion(bar(0, onSelect));
    tap("tab-inbox");
    await advance(50);
    expect(onSelect).toHaveBeenCalledWith(2, expect.objectContaining({ key: "inbox" }));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    tap("tab-feed"); // already selected
    await advance(50);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("slides the indicator to the active tab on a spring, without jumping on first measure", async () => {
    const { rerender } = await renderMotion(bar(0));
    await measure();
    await advance(50);
    expect(tx("bar-indicator")).toBe(0);
    await rerender(bar(3));
    await advance(30);
    const mid = tx("bar-indicator");
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(300);
    await advance(2000);
    expect(tx("bar-indicator")).toBeCloseTo(300, 0);
  });

  it("starts the indicator on the initial tab without sliding in from zero", async () => {
    await renderMotion(bar(2));
    await measure();
    await advance(30);
    expect(tx("bar-indicator")).toBeCloseTo(200, 0);
  });
});

describe("TabIconPop", () => {
  const pop = (focused: boolean) => (
    <TabIconPop focused={focused}>
      <Text testID="icon">i</Text>
    </TabIconPop>
  );
  const scale = () => (styleOf(screen.getByTestId("icon").parent!).transform ?? []).find((t: any) => t.scale !== undefined)?.scale ?? 1;

  it("does not pop on first render", async () => {
    await renderMotion(pop(true));
    await advance(100);
    expect(scale()).toBe(1);
  });

  it("overshoots past 1 then settles back to 1 when it becomes focused", async () => {
    const { rerender } = await renderMotion(pop(false));
    await rerender(pop(true));
    let peak = 1;
    for (let i = 0; i < 40; i++) {
      await advance(16);
      peak = Math.max(peak, scale());
    }
    expect(peak).toBeGreaterThan(1.05);
    await advance(2000);
    expect(scale()).toBeCloseTo(1, 2);
  });

  it("does not scale with Reduce Motion", async () => {
    reduced.mockReturnValue(true);
    const { rerender } = await renderMotion(pop(false));
    await rerender(pop(true));
    await advance(200);
    expect(scale()).toBe(1);
  });
});
