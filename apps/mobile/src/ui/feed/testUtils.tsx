/**
 * Test helpers for the feed UI (jest only). PressableScale buttons are activated through their
 * accessibility action, like the shell's primitives tests; pager gestures are fired through
 * Gesture Handler's jest utils, then the queue of `scheduleOnRN` calls is flushed.
 */
import { act, fireEvent, screen } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

export const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

export async function activate(testID: string): Promise<void> {
  await fireEvent(screen.getByTestId(testID), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
  await flush();
}

/** Runs a discrete gesture (tap, double tap, long press) registered under `testID`. */
export async function fireGesture(testID: string, data: Record<string, number> = {}): Promise<void> {
  fireGestureHandler(getByGestureTestId(testID), [
    { state: State.BEGAN },
    { state: State.ACTIVE, ...data },
    { state: State.END },
  ]);
  await flush();
}

export async function layoutFeed(width = 393, height = 852): Promise<void> {
  await fireEvent(screen.getByTestId("feed-screen"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
  await flush();
}
