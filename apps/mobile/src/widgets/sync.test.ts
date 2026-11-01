import { parseSnapshot } from "@shared/widget-snapshot";
import type { Library } from "../data/library";

const mockSetSnapshot = jest.fn();
const mockClearSnapshot = jest.fn();
jest.mock("../../modules/widget-bridge", () => ({
  setSnapshot: (json: string) => mockSetSnapshot(json),
  clearSnapshot: () => mockClearSnapshot(),
}));

const mockDefineTask = jest.fn();
const mockIsRegistered = jest.fn();
jest.mock("expo-task-manager", () => ({
  defineTask: (...args: unknown[]) => mockDefineTask(...args),
  isTaskRegisteredAsync: (...args: unknown[]) => mockIsRegistered(...args),
}));

const mockGetStatus = jest.fn();
const mockRegisterTask = jest.fn();
jest.mock("expo-background-task", () => ({
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: () => mockGetStatus(),
  registerTaskAsync: (...args: unknown[]) => mockRegisterTask(...args),
}));

const mockFetchLibrary = jest.fn();
jest.mock("../data/library", () => ({ fetchLibrary: (id: string) => mockFetchLibrary(id) }), { virtual: true });

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({
  db: { auth: { getSession: () => mockGetSession() }, rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// Required (not imported) so the mock consts above exist when the module body runs defineTask.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  WIDGET_REFRESH_TASK,
  clearWidgetSnapshot,
  fetchStreak,
  refreshWidgetSnapshotInBackground,
  registerWidgetRefresh,
  syncWidgetAfterLoad,
  syncWidgetSnapshot,
} = require("./sync") as typeof import("./sync");

// Captured at import, before any beforeEach clears the mock.
const definedTask = mockDefineTask.mock.calls[0];

const library = {
  reels: [
    {
      id: "r1",
      creator_id: "c1",
      title: "How a ROM boots",
      topic: "android/boot",
      tags: [],
      series: null,
      series_index: null,
      created_at: "2026-11-01T10:00:00Z",
      video_url: "https://x.test/v.mp4",
      poster_url: null,
      glossary: null,
      parent_reel_id: null,
      genre: null,
      style: null,
      expires_at: null,
    },
  ],
  creators: [{ id: "c1", display_name: "Claude", handle: "claude", bio: "", avatar_url: null }],
  categories: [{ slug: "android", label: "Android", description: "" }],
} as unknown as Library;

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: 4, error: null });
  mockGetStatus.mockResolvedValue(2);
  mockIsRegistered.mockResolvedValue(false);
  mockRegisterTask.mockResolvedValue(undefined);
});

describe("syncWidgetSnapshot", () => {
  it("writes JSON that parseSnapshot accepts", () => {
    syncWidgetSnapshot(library, 3);
    expect(mockSetSnapshot).toHaveBeenCalledTimes(1);
    const parsed = parseSnapshot(mockSetSnapshot.mock.calls[0][0]);
    expect(parsed).not.toBeNull();
    expect(parsed?.streak).toBe(3);
    expect(parsed?.newest).toMatchObject({ id: "r1", creator: "Claude", category: "Android", deepLink: "codeinsta://reel/r1" });
  });

  it("an empty library still writes a valid snapshot (Nothing new yet)", () => {
    syncWidgetSnapshot({ ...library, reels: [] } as Library, 0);
    const parsed = parseSnapshot(mockSetSnapshot.mock.calls[0][0]);
    expect(parsed).toMatchObject({ newest: null, headline: null, streak: 0 });
  });

  it("a throwing bridge never breaks the caller", () => {
    mockSetSnapshot.mockImplementation(() => {
      throw new Error("native down");
    });
    expect(() => syncWidgetSnapshot(library, 1)).not.toThrow();
  });
});

describe("clearWidgetSnapshot", () => {
  it("calls clearSnapshot exactly once", () => {
    clearWidgetSnapshot();
    expect(mockClearSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the bridge throws", () => {
    mockClearSnapshot.mockImplementation(() => {
      throw new Error("native down");
    });
    expect(() => clearWidgetSnapshot()).not.toThrow();
  });
});

describe("fetchStreak / syncWidgetAfterLoad", () => {
  it("passes the device time zone and returns the RPC value", async () => {
    expect(await fetchStreak()).toBe(4);
    expect(mockRpc).toHaveBeenCalledWith("learning_streak", { tz: expect.any(String) });
  });

  it("returns 0 on an RPC error or a thrown error", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await fetchStreak()).toBe(0);
    mockRpc.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchStreak()).toBe(0);
  });

  it("writes the snapshot with the fetched streak", async () => {
    await syncWidgetAfterLoad(library);
    expect(parseSnapshot(mockSetSnapshot.mock.calls[0][0])?.streak).toBe(4);
  });
});

describe("background task", () => {
  it("is defined at import under the shared task name", () => {
    expect(definedTask[0]).toBe(WIDGET_REFRESH_TASK);
    expect(definedTask[1]).toBe(refreshWidgetSnapshotInBackground);
  });

  it("without a session writes nothing and clears the snapshot", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(refreshWidgetSnapshotInBackground()).resolves.toBe(1);
    expect(mockSetSnapshot).not.toHaveBeenCalled();
    expect(mockFetchLibrary).not.toHaveBeenCalled();
    expect(mockClearSnapshot).toHaveBeenCalledTimes(1);
  });

  it("with a session fetches the library and streak and writes the snapshot", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockFetchLibrary.mockResolvedValue(library);
    await expect(refreshWidgetSnapshotInBackground()).resolves.toBe(1);
    expect(mockFetchLibrary).toHaveBeenCalledWith("u1");
    expect(parseSnapshot(mockSetSnapshot.mock.calls[0][0])?.streak).toBe(4);
    expect(mockClearSnapshot).not.toHaveBeenCalled();
  });

  it("reports failure instead of throwing when the fetch fails", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockFetchLibrary.mockRejectedValue(new Error("offline"));
    await expect(refreshWidgetSnapshotInBackground()).resolves.toBe(2);
    expect(mockSetSnapshot).not.toHaveBeenCalled();
  });
});

describe("registerWidgetRefresh", () => {
  it("registers once at the minimum interval", async () => {
    await registerWidgetRefresh();
    expect(mockRegisterTask).toHaveBeenCalledWith(WIDGET_REFRESH_TASK, { minimumInterval: 15 });
  });

  it("skips when already registered or restricted", async () => {
    mockIsRegistered.mockResolvedValueOnce(true);
    await registerWidgetRefresh();
    mockGetStatus.mockResolvedValueOnce(1);
    await registerWidgetRefresh();
    expect(mockRegisterTask).not.toHaveBeenCalled();
  });

  it("never rejects when registration throws", async () => {
    mockRegisterTask.mockRejectedValue(new Error("Expo Go"));
    await expect(registerWidgetRefresh()).resolves.toBeUndefined();
  });
});
