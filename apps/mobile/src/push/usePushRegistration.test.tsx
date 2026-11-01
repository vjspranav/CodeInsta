const mockRegister = jest.fn();
let mockEngagedFlag = false;
const mockListeners = new Set<() => void>();
jest.mock("./register", () => ({
  registerPush: (...a: unknown[]) => mockRegister(...a),
  loadEngaged: async () => mockEngagedFlag,
  isEngaged: () => mockEngagedFlag,
  subscribeEngaged: (l: () => void) => {
    mockListeners.add(l);
    return () => mockListeners.delete(l);
  },
}));

let mockAuth: { status: string; user: { id: string } | null } = { status: "ready", user: { id: "u1" } };
jest.mock("@/auth/useAuth", () => ({ useAuth: () => mockAuth }));

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ router: { navigate: (...a: unknown[]) => mockNavigate(...a) } }));

let mockResponse: unknown = null;
jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  setNotificationHandler: jest.fn(),
  useLastNotificationResponse: () => mockResponse,
}));

import { act, renderHook } from "@testing-library/react-native";
import { usePushRegistration } from "./usePushRegistration";

const tap = (route: unknown, id = "n1", action = "expo.modules.notifications.actions.DEFAULT") => ({
  actionIdentifier: action,
  notification: { request: { identifier: id, content: { data: { route } } } },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEngagedFlag = false;
  mockListeners.clear();
  mockAuth = { status: "ready", user: { id: "u1" } };
  mockResponse = null;
});

describe("usePushRegistration", () => {
  it("does not register on cold start before the first meaningful action", async () => {
    await renderHook(() => usePushRegistration());
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("registers once the gate opens", async () => {
    await renderHook(() => usePushRegistration());
    await act(async () => {
      mockEngagedFlag = true;
      mockListeners.forEach((l) => l());
    });
    expect(mockRegister).toHaveBeenCalledWith("u1");
  });

  it("registers immediately for a returning engaged member, never when signed out", async () => {
    mockEngagedFlag = true;
    mockAuth = { status: "signedOut", user: null };
    const { unmount } = await renderHook(() => usePushRegistration());
    expect(mockRegister).not.toHaveBeenCalled();
    await unmount();
    mockAuth = { status: "ready", user: { id: "u1" } };
    await renderHook(() => usePushRegistration());
    expect(mockRegister).toHaveBeenCalledWith("u1");
  });

  it("routes a tap to a safe route once", async () => {
    mockResponse = tap("/inbox/claude");
    const { rerender } = await renderHook(() => usePushRegistration());
    await rerender({});
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/inbox/claude");
  });

  it("ignores hostile routes, non-default actions and signed-out taps", async () => {
    mockResponse = tap("/admin/requests");
    await renderHook(() => usePushRegistration());
    mockResponse = tap("/requests", "n2", "other");
    await renderHook(() => usePushRegistration());
    mockAuth = { status: "signedOut", user: null };
    mockResponse = tap("/requests", "n3");
    await renderHook(() => usePushRegistration());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
