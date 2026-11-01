import { renderMotion } from "./testSetup";
import { act, cleanup, fireEvent, screen } from "@testing-library/react-native";
import { createGestureController, fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { State } from "react-native-gesture-handler";
import { StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { EnterStagger } from "./EnterStagger";
import { MorphButton } from "./MorphButton";
import { PressableScale } from "./PressableScale";
import { ShakeOnError } from "./ShakeOnError";
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

/** Static style merged with the latest animated style (Reanimated keeps the live one in jestAnimatedStyle). */
function styleOf(el: { props: { style?: unknown; jestAnimatedStyle?: { value?: object } } }) {
  return { ...(StyleSheet.flatten(el.props.style as never) ?? {}), ...(el.props.jestAnimatedStyle?.value ?? {}) } as Record<
    string,
    any
  >;
}
function flat(testID: string) {
  return styleOf(screen.getByTestId(testID));
}
function scaleOf(testID: string): number {
  const t = flat(testID).transform as { scale?: number }[] | undefined;
  return t?.find((x) => x.scale !== undefined)?.scale ?? 1;
}
function translate(testID: string, key: "translateX" | "translateY"): number {
  const t = flat(testID).transform as Record<string, number>[] | undefined;
  return t?.find((x) => x[key] !== undefined)?.[key] ?? 0;
}
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
function tap(testID: string) {
  fireGestureHandler(getByGestureTestId(testID), [
    { state: State.BEGAN },
    { state: State.ACTIVE },
    { state: State.END },
  ]);
}

beforeEach(() => {
  jest.useFakeTimers();
  reduced.mockReturnValue(false);
  jest.clearAllMocks();
});
afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
});

describe("PressableScale", () => {
  it("is an accessible button and passes label and testID through", async () => {
    await renderMotion(
      <PressableScale testID="btn" accessibilityLabel="Continue">
        <Text>Go</Text>
      </PressableScale>,
    );
    const el = screen.getByTestId("btn");
    expect(el.props.accessible).toBe(true);
    expect(el.props.accessibilityRole).toBe("button");
    expect(el.props.accessibilityLabel).toBe("Continue");
  });

  it("calls onPress and fires the token haptic on a tap", async () => {
    const onPress = jest.fn();
    await renderMotion(
      <PressableScale testID="btn" onPress={onPress} haptic="like">
        <Text>Go</Text>
      </PressableScale>,
    );
    tap("btn");
    await advance(50);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
  });

  it("does not fire when disabled", async () => {
    const onPress = jest.fn();
    await renderMotion(
      <PressableScale testID="btn" onPress={onPress} disabled>
        <Text>Go</Text>
      </PressableScale>,
    );
    tap("btn");
    await advance(50);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId("btn").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("scales to 0.97 while held and back to 1 on release", async () => {
    await renderMotion(
      <PressableScale testID="btn" onPress={() => {}}>
        <Text>Go</Text>
      </PressableScale>,
    );
    const finger = createGestureController(getByGestureTestId("btn"));
    finger.begin();
    await advance(600);
    expect(scaleOf("btn")).toBeCloseTo(0.97, 2);
    finger.fail();
    await advance(600);
    expect(scaleOf("btn")).toBeCloseTo(1, 2);
  });

  it("supports screen reader activation", async () => {
    const onPress = jest.fn();
    await renderMotion(
      <PressableScale testID="btn" onPress={onPress}>
        <Text>Go</Text>
      </PressableScale>,
    );
    fireEvent(screen.getByTestId("btn"), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("uses an opacity dip, no scale, with Reduce Motion", async () => {
    reduced.mockReturnValue(true);
    await renderMotion(
      <PressableScale testID="btn" onPress={() => {}}>
        <Text>Go</Text>
      </PressableScale>,
    );
    createGestureController(getByGestureTestId("btn")).begin();
    await advance(600);
    expect(scaleOf("btn")).toBe(1);
    expect(flat("btn").opacity).toBeLessThan(1);
  });
});

describe("EnterStagger", () => {
  const row = (id: string) => (
    <Text key={id} testID={id}>
      {id}
    </Text>
  );

  it("starts children hidden and offset, then settles them in order", async () => {
    await renderMotion(
      <EnterStagger itemStyle={{}}>
        <Text testID="a">a</Text>
        <Text testID="b">b</Text>
      </EnterStagger>,
    );
    const parentOf = (id: string) => screen.getByTestId(id).parent!;
    const style = (id: string) => styleOf(parentOf(id));
    expect(style("a").opacity).toBe(0);
    await advance(1500);
    expect(style("a").opacity).toBeCloseTo(1, 1);
    expect(style("b").opacity).toBeCloseTo(1, 1);
  });

  it("never replays on re-render, and appended children appear without animating", async () => {
    const { rerender } = await renderMotion(<EnterStagger>{[row("a")]}</EnterStagger>);
    await advance(1500);
    await rerender(<EnterStagger>{[row("a"), row("b")]}</EnterStagger>);
    const style = (id: string) => styleOf(screen.getByTestId(id).parent!);
    expect(style("a").opacity).toBeCloseTo(1, 1);
    expect(style("b").opacity).toBe(1);
  });

  it("only the first six children animate", async () => {
    const ids = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"];
    await renderMotion(<EnterStagger>{ids.map(row)}</EnterStagger>);
    const style = (id: string) => styleOf(screen.getByTestId(id).parent!);
    expect(style("c5").opacity).toBe(0);
    expect(style("c6").opacity).toBe(1);
    expect(style("c7").opacity).toBe(1);
  });
});

describe("ShakeOnError", () => {
  it("does not move on mount, shakes on a new trigger and comes to rest", async () => {
    const { rerender } = await renderMotion(
      <ShakeOnError testID="s" trigger={undefined}>
        <Text>field</Text>
      </ShakeOnError>,
    );
    expect(translate("s", "translateX")).toBe(0);
    await rerender(
      <ShakeOnError testID="s" trigger="Wrong password">
        <Text>field</Text>
      </ShakeOnError>,
    );
    await advance(60);
    expect(Math.abs(translate("s", "translateX"))).toBeGreaterThan(0);
    expect(Math.abs(translate("s", "translateX"))).toBeLessThanOrEqual(6);
    await advance(1000);
    expect(translate("s", "translateX")).toBeCloseTo(0, 5);
  });

  it("pulses opacity instead of moving with Reduce Motion", async () => {
    reduced.mockReturnValue(true);
    const { rerender } = await renderMotion(<ShakeOnError testID="s" trigger={0}>{null}</ShakeOnError>);
    await rerender(<ShakeOnError testID="s" trigger="err">{null}</ShakeOnError>);
    await advance(80);
    expect(translate("s", "translateX")).toBe(0);
    expect(flat("s").opacity).toBeLessThan(1);
    await advance(500);
    expect(flat("s").opacity).toBeCloseTo(1, 2);
  });
});

describe("MorphButton", () => {
  const fixed = { height: 48 };

  it("shows the label when idle and keeps one fixed height through every state", async () => {
    const { rerender } = await renderMotion(<MorphButton testID="m" label="Continue with Google" />);
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    const idle = flat("m");
    expect(idle.height).toBe(fixed.height);
    await rerender(<MorphButton testID="m" label="Continue with Google" busy />);
    await advance(600);
    expect(flat("m").height).toBe(fixed.height);
    expect(flat("m").width).toBe(idle.width);
    expect(screen.getByTestId("m").props.accessibilityState).toMatchObject({ busy: true });
  });

  it("ignores presses while busy", async () => {
    const onPress = jest.fn();
    await renderMotion(<MorphButton testID="m" label="Go" busy onPress={onPress} />);
    tap("m");
    await advance(50);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("calls onPress when idle", async () => {
    const onPress = jest.fn();
    await renderMotion(<MorphButton testID="m" label="Go" onPress={onPress} />);
    tap("m");
    await advance(50);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("draws the check on success and calls onDone exactly once afterwards", async () => {
    const onDone = jest.fn();
    const { rerender } = await renderMotion(<MorphButton testID="m" label="Go" busy onDone={onDone} />);
    await rerender(<MorphButton testID="m" label="Go" success onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    await advance(2000);
    expect(onDone).toHaveBeenCalledTimes(1);
    await rerender(<MorphButton testID="m" label="Go" success onDone={onDone} />);
    await advance(2000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("still reports done with Reduce Motion", async () => {
    reduced.mockReturnValue(true);
    const onDone = jest.fn();
    const { rerender } = await renderMotion(<MorphButton label="Go" onDone={onDone} />);
    await rerender(<MorphButton label="Go" success onDone={onDone} />);
    await advance(1000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
