const mockRpc = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
jest.mock("@/lib/supabase", () => ({
  db: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) => ({
      delete: () => {
        mockDelete(table);
        const chain = {
          eq: (col: string, val: unknown) => {
            mockEq(col, val);
            return chain;
          },
          then: (resolve: (v: unknown) => void) => resolve({ error: null }),
        };
        return chain;
      },
    }),
  },
}));

const store = new Map<string, string>();
const mockStore = {
  getItem: jest.fn(async (k: string) => store.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
  removeItem: jest.fn(async (k: string) => void store.delete(k)),
};
jest.mock("@/lib/secure-storage", () => ({
  secureStorage: {
    getItem: (k: string) => mockStore.getItem(k),
    setItem: (k: string, v: string) => mockStore.setItem(k, v),
    removeItem: (k: string) => mockStore.removeItem(k),
  },
}));

const mockGetPerms = jest.fn();
const mockRequestPerms = jest.fn();
const mockGetToken = jest.fn();
const mockChannel = jest.fn();
jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: () => mockGetPerms(),
  requestPermissionsAsync: () => mockRequestPerms(),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
  setNotificationChannelAsync: (...a: unknown[]) => mockChannel(...a),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } }, easConfig: undefined },
}));

import { Platform } from "react-native";
import {
  isEngaged,
  loadEngaged,
  markMeaningfulAction,
  registerPush,
  resetPushStateForTests,
  unregisterPush,
} from "./register";

const TOKEN = "ExponentPushToken[abcdefghijklmnop]";

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  resetPushStateForTests();
  (Platform as { OS: string }).OS = "android";
  mockGetPerms.mockResolvedValue({ granted: true, canAskAgain: true });
  mockGetToken.mockResolvedValue({ data: TOKEN });
  mockRpc.mockResolvedValue({ error: null });
});

describe("registerPush", () => {
  it("claims the token via the RPC with the platform", async () => {
    expect(await registerPush("u1")).toBe("registered");
    expect(mockGetToken).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(mockRpc).toHaveBeenCalledWith("claim_push_token", {
      p_token: TOKEN,
      p_platform: "android",
    });
    expect(store.get("codeinsta.push.token")).toBe(TOKEN);
    expect(mockChannel).toHaveBeenCalled();
  });

  it("asks permission when undecided, then registers", async () => {
    mockGetPerms.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPerms.mockResolvedValue({ granted: true });
    expect(await registerPush("u1")).toBe("registered");
    expect(mockRequestPerms).toHaveBeenCalledTimes(1);
  });

  it("returns denied and writes nothing when permission is refused", async () => {
    mockGetPerms.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPerms.mockResolvedValue({ granted: false });
    expect(await registerPush("u1")).toBe("denied");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("does not re-prompt when the user already blocked it", async () => {
    mockGetPerms.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await registerPush("u1")).toBe("denied");
    expect(mockRequestPerms).not.toHaveBeenCalled();
  });

  it("returns unsupported (silently) when the token fetch throws", async () => {
    mockGetToken.mockRejectedValue(new Error("no push entitlement"));
    await expect(registerPush("u1")).resolves.toBe("unsupported");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns unsupported when the claim fails or throws", async () => {
    mockRpc.mockResolvedValue({ error: { message: "rls" } });
    expect(await registerPush("u1")).toBe("unsupported");
    mockRpc.mockRejectedValue(new Error("network"));
    expect(await registerPush("u1")).toBe("unsupported");
  });

  it("returns unsupported on web", async () => {
    (Platform as { OS: string }).OS = "web";
    expect(await registerPush("u1")).toBe("unsupported");
    expect(mockGetPerms).not.toHaveBeenCalled();
  });
});

describe("unregisterPush", () => {
  it("deletes this device's row by (user_id, token) and forgets the token", async () => {
    store.set("codeinsta.push.token", TOKEN);
    await unregisterPush("u1");
    expect(mockDelete).toHaveBeenCalledWith("push_tokens");
    expect(mockEq).toHaveBeenCalledWith("user_id", "u1");
    expect(mockEq).toHaveBeenCalledWith("token", TOKEN);
    expect(store.has("codeinsta.push.token")).toBe(false);
  });

  it("does nothing without a stored token", async () => {
    await unregisterPush("u1");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    mockStore.getItem.mockRejectedValueOnce(new Error("keychain"));
    await expect(unregisterPush("u1")).resolves.toBeUndefined();
  });
});

describe("first meaningful action gate", () => {
  it("starts closed, opens once, persists", async () => {
    expect(await loadEngaged()).toBe(false);
    markMeaningfulAction();
    expect(isEngaged()).toBe(true);
    expect(store.get("codeinsta.push.engaged")).toBe("1");
  });

  it("restores the persisted flag on a later launch", async () => {
    store.set("codeinsta.push.engaged", "1");
    expect(await loadEngaged()).toBe(true);
  });
});
