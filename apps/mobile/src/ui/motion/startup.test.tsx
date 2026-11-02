import { renderMotion } from "./testSetup";
import { act, cleanup, fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { AnimatedLogo } from "./AnimatedLogo";
import { StartupGate } from "./StartupGate";
import { useReducedMotion } from "./reducedMotion";
import { LOGO_SETTLE_MS, STARTUP_EXTRA_CAP_MS } from "./startupTiming";

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("./reducedMotion", () => ({
  ...jest.requireActual("./reducedMotion"),
  useReducedMotion: jest.fn(() => false),
}));

const reduced = useReducedMotion as jest.Mock;
const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 200 } } };

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

// Captured at import time, before any test clears the mock counters.
const preventedAtImport = (SplashScreen.preventAutoHideAsync as jest.Mock).mock.calls.length;

beforeEach(() => {
  jest.useFakeTimers();
  reduced.mockReturnValue(false);
  (SplashScreen.hideAsync as jest.Mock).mockClear();
});
afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
});

describe("AnimatedLogo", () => {
  it("renders the labelled mark and wordmark and reports layout", async () => {
    const onLayout = jest.fn();
    await renderMotion(<AnimatedLogo testID="logo" onLayout={onLayout} />);
    expect(screen.getByText("CodeInsta")).toBeTruthy();
    await fireEvent(screen.getByTestId("logo"), "layout", layout);
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it("can omit the wordmark and render already settled", async () => {
    await renderMotion(<AnimatedLogo wordmark={false} instant />);
    expect(screen.queryByText("CodeInsta")).toBeNull();
  });
});

describe("StartupGate", () => {
  const app = <Text testID="app">first screen</Text>;
  const gate = (ready: boolean) => (
    <StartupGate ready={ready} testID="gate">
      {app}
    </StartupGate>
  );
  const shown = () => screen.getByTestId("gate-app", { includeHiddenElements: true }).props.pointerEvents === "auto";
  const laidOut = () =>
    fireEvent(screen.getByTestId("gate-mark"), "layout", layout);

  it("keeps the native splash from auto hiding", () => {
    expect(preventedAtImport).toBeGreaterThan(0);
  });

  it("holds the native splash until the logo laid out, then hides it exactly once", async () => {
    await renderMotion(gate(false));
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    await laidOut();
    await laidOut();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it("mounts the app under the logo at once, hidden from touch and screen readers", async () => {
    await renderMotion(gate(false));
    expect(screen.getByTestId("app", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("gate-app", { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    expect(shown()).toBe(false);
  });

  it("shows the logo and not the app before anything is ready", async () => {
    await renderMotion(gate(false));
    await laidOut();
    await advance(100);
    expect(shown()).toBe(false);
    expect(screen.getByTestId("gate-mark")).toBeTruthy();
  });

  it("reveals the app once ready and the logo has settled, not before", async () => {
    await renderMotion(gate(true));
    await laidOut();
    await advance(LOGO_SETTLE_MS - 20);
    expect(shown()).toBe(false);
    await advance(40);
    expect(shown()).toBe(true);
  });

  it("removes the logo after the crossfade", async () => {
    await renderMotion(gate(true));
    await laidOut();
    await advance(LOGO_SETTLE_MS + 40);
    await advance(1000);
    expect(screen.queryByTestId("gate-mark")).toBeNull();
    expect(shown()).toBe(true);
  });

  it("reveals as soon as ready flips true after the settle", async () => {
    const { rerender } = await renderMotion(gate(false));
    await laidOut();
    await advance(LOGO_SETTLE_MS + 300);
    expect(shown()).toBe(false);
    await rerender(gate(true));
    await advance(20);
    expect(shown()).toBe(true);
  });

  it("never holds the logo past the hard cap, even if never ready", async () => {
    await renderMotion(gate(false));
    await laidOut();
    await advance(STARTUP_EXTRA_CAP_MS - 20);
    expect(shown()).toBe(false);
    await advance(40);
    expect(shown()).toBe(true);
  });

  it("hides the splash and reveals within the cap even if the logo never reports a layout", async () => {
    await renderMotion(gate(true));
    await advance(STARTUP_EXTRA_CAP_MS + LOGO_SETTLE_MS + 50);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(true);
  });

  it("with Reduce Motion reveals a ready app without waiting for the settle", async () => {
    reduced.mockReturnValue(true);
    await renderMotion(gate(true));
    await laidOut();
    await advance(20);
    expect(shown()).toBe(true);
  });
});
