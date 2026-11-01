/**
 * Shared jest setup for the motion kit tests. Import it first in each test file:
 * `import { renderMotion, tapGesture } from "./testSetup";`
 *
 * - Gesture Handler jest mocks (no native module)
 * - Gesture Handler installs UI runtime bindings in a microtask that the Worklets jest resolver
 *   (web build) cannot serve: stub that one call
 */
import "react-native-gesture-handler/jestSetup";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";

jest.mock("react-native-gesture-handler/lib/module/handlers/gestures/installUIRuntimeBindings", () => ({
  installUIRuntimeBindings: () => {},
}));

/** Render inside the Gesture Handler root. `rerender` keeps the wrapper so children are not remounted. */
export async function renderMotion(ui: ReactElement) {
  const wrap = (el: ReactElement) => <GestureHandlerRootView>{el}</GestureHandlerRootView>;
  const result = await render(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}
