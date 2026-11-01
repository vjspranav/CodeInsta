const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

import { secureStorage } from "./secure-storage";

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

beforeEach(() => mockStore.clear());

describe("secureStorage", () => {
  it("round-trips a value much larger than one SecureStore entry", async () => {
    const value = "x".repeat(5000);
    await secureStorage.setItem("sb-auth", value);
    expect(await secureStorage.getItem("sb-auth")).toBe(value);
    for (const v of mockStore.values()) expect(bytes(v)).toBeLessThanOrEqual(1800);
    expect(mockStore.get("sb-auth.n")).toBe("3");
  });

  it("never splits a multi-byte character across chunks", async () => {
    const value = "é漢字\u{1D4B3}".repeat(600);
    await secureStorage.setItem("sb-auth", value);
    for (const [k, v] of mockStore) if (k !== "sb-auth.n") expect(bytes(v)).toBeLessThanOrEqual(1800);
    expect(await secureStorage.getItem("sb-auth")).toBe(value);
  });

  it("leaves no stale chunks when a shorter value replaces a longer one", async () => {
    await secureStorage.setItem("sb-auth", "a".repeat(5000));
    await secureStorage.setItem("sb-auth", "short");
    expect(await secureStorage.getItem("sb-auth")).toBe("short");
    expect([...mockStore.keys()].sort()).toEqual(["sb-auth.0", "sb-auth.n"]);
  });

  it("removeItem clears every chunk and the count", async () => {
    await secureStorage.setItem("sb-auth", "a".repeat(5000));
    await secureStorage.removeItem("sb-auth");
    expect(mockStore.size).toBe(0);
    expect(await secureStorage.getItem("sb-auth")).toBeNull();
  });

  it("returns null for a missing key", async () => {
    expect(await secureStorage.getItem("missing")).toBeNull();
  });

  it("returns null when a chunk is missing instead of a corrupt session", async () => {
    await secureStorage.setItem("sb-auth", "a".repeat(5000));
    mockStore.delete("sb-auth.1");
    expect(await secureStorage.getItem("sb-auth")).toBeNull();
  });
});
