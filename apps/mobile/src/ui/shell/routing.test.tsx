import { renderMotion } from "../motion/testSetup";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text as MockText } from "react-native";
import { TID } from "@/testids";

const mockAuth = { status: "signedOut" as string, error: "" };
const mockListeners = new Set<() => void>();
const mockSetStatus = (status: string) => {
  mockAuth.status = status;
  mockListeners.forEach((l) => l());
};
jest.mock("@/auth/useAuth", () => {
  const { useSyncExternalStore } = jest.requireActual("react");
  return {
    AuthProvider: ({ children }: { children: ReactNode }) => children,
    useAuth: () => {
      useSyncExternalStore(
        (l: () => void) => {
          mockListeners.add(l);
          return () => mockListeners.delete(l);
        },
        () => mockAuth.status,
      );
      return mockAuth;
    },
  };
});
jest.mock("@/lib/supabase", () => ({ registerAppStateRefresh: () => () => {} }));
const mockRegisterWidgets = jest.fn(async () => {});
jest.mock("@/widgets/sync", () => ({ registerWidgetRefresh: () => mockRegisterWidgets() }));
jest.mock("@/push/usePushRegistration", () => ({ usePushRegistration: () => undefined }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: (_t, name) => (name === "__esModule" ? false : () => null) }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// The router itself is not under test (it needs its ESM navigation stack): stand in for Stack so
// only the screens whose guard is open render, exactly as Stack.Protected admits them.
jest.mock("expo-router", () => {
  const Stack = ({ children }: { children: ReactNode }) => children;
  Stack.Protected = ({ guard, children }: { guard: boolean; children: ReactNode }) => (guard ? children : null);
  Stack.Screen = ({ name }: { name: string }) => <MockText>{`route:${name}`}</MockText>;
  return { Stack };
});
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

import RootLayout from "../../../app/_layout";
import { AppTabBar } from "./AppTabBar";
import { routeForStatus } from "./authRoute";
import { queryClient } from "@/lib/queryClient";

async function open(status: string) {
  mockAuth.status = status;
  const view = await renderMotion(<RootLayout />);
  // The startup gate holds the logo for its settle time, then reveals the app.
  await waitFor(() => expect(screen.queryAllByText(/^route:/).length).toBeGreaterThan(0), { timeout: 4000 });
  return view;
}

beforeEach(() => {
  mockAuth.error = "";
  mockRegisterWidgets.mockClear();
});

describe("root layout auth gate", () => {
  it.each([
    ["signedOut", "login"],
    ["needsInvite", "join"],
    ["needsOnboarding", "onboarding"],
    ["ready", "(tabs)"],
  ])("%s admits only the %s route", async (status, route) => {
    await open(status);
    // The ready group also holds the reel/[id] deep link route.
    expect(screen.getAllByText(/^route:/)).toHaveLength(status === "ready" ? 2 : 1);
    expect(screen.getByText(`route:${route}`)).toBeTruthy();
    expect(routeForStatus(status as never)).toBe(route);
  });

  it("registers widget refresh once, and clears the query cache when the session ends", async () => {
    const clear = jest.spyOn(queryClient, "clear");
    await open("ready");
    await waitFor(() => expect(mockRegisterWidgets).toHaveBeenCalledTimes(1));
    expect(clear).not.toHaveBeenCalled();
    await act(async () => mockSetStatus("signedOut"));
    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(mockRegisterWidgets).toHaveBeenCalledTimes(1);
  });
});

type BarProps = Parameters<typeof AppTabBar>[0];
const barProps = (state: unknown, emitter: unknown, navigateToTab: unknown, insets: unknown) =>
  ({ state, emitter, navigateToTab, insets, descriptors: {} }) as unknown as BarProps;

describe("AppTabBar", () => {
  const names = ["index", "explore", "inbox", "profiles"];
  const state = { index: 0, routes: names.map((name) => ({ key: `${name}-k`, name })) };

  it("renders the four tabs with their test ids and navigates on press", async () => {
    const navigateToTab = jest.fn();
    const emitter = { emit: jest.fn(() => ({ defaultPrevented: false })) };
    await renderMotion(
      <AppTabBar {...barProps(state, emitter, navigateToTab, { top: 0, bottom: 8, left: 0, right: 0 })} />,
    );
    for (const id of [TID["tab-feed"], TID["tab-explore"], TID["tab-inbox"], TID["tab-profiles"]]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByLabelText("Feed").props.accessibilityState.selected).toBe(true);
    await fireEvent(screen.getByTestId(TID["tab-explore"]), "accessibilityAction", {
      nativeEvent: { actionName: "activate" },
    });
    expect(emitter.emit).toHaveBeenCalledWith({ type: "tabPress", target: "explore-k", canPreventDefault: true });
    expect(navigateToTab).toHaveBeenCalledWith("explore-k");
  });

  it("does not navigate when the pressed tab is already active", async () => {
    const navigateToTab = jest.fn();
    const emitter = { emit: jest.fn(() => ({ defaultPrevented: false })) };
    await renderMotion(
      <AppTabBar {...barProps(state, emitter, navigateToTab, { top: 0, bottom: 0, left: 0, right: 0 })} />,
    );
    await fireEvent(screen.getByTestId(TID["tab-feed"]), "accessibilityAction", {
      nativeEvent: { actionName: "activate" },
    });
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});
