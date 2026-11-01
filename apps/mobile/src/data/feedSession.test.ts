import { act, renderHook } from "@testing-library/react-native";
import { orderFeed } from "@shared/feed";
import type { MobileReel } from "@shared/types";

import { makeFakeDb } from "./fakeDb.testutil";
import { useFeedSession } from "./feedSession";

const mockFake = { current: makeFakeDb() };
const mockLibrary: { current: unknown } = { current: null };
const mockMarkSeenInCache = jest.fn();

jest.mock("@/lib/supabase", () => ({
  db: new Proxy({}, { get: (_t, key) => (mockFake.current.db as never)[key] }),
}));
jest.mock(
  "./library",
  () => ({
    useLibrary: () => ({
      library: mockLibrary.current,
      loading: false,
      error: "",
      reload: () => {},
      markSeenInCache: mockMarkSeenInCache,
    }),
  }),
  { virtual: true },
);
jest.mock("@/theme/tokens", () => ({ haptic: jest.fn() }));

const reel = (id: string, over: Partial<MobileReel> = {}): MobileReel => ({
  id,
  creator_id: "claude",
  title: id,
  topic: `t/${id}`,
  tags: [],
  series: null,
  series_index: null,
  created_at: "2026-11-01T00:00:00Z",
  video_url: `https://x/${id}.mp4`,
  poster_url: null,
  glossary: null,
  parent_reel_id: null,
  genre: null,
  style: null,
  expires_at: null,
  ...over,
});

const part = (n: number) =>
  reel(`p${n}`, {
    series: "feeds",
    series_index: n,
    topic: `distributed/feeds/part-${n}`,
    created_at: `2026-11-01T0${n}:00:00Z`,
  });

const makeLibrary = (over: Record<string, unknown> = {}) => ({
  reels: [reel("a"), reel("b", { creator_id: "gpt", created_at: "2026-11-02T00:00:00Z" })],
  creators: [],
  categories: [],
  liked: new Set<string>(),
  disliked: new Set<string>(),
  seen: new Set<string>(),
  areas: [],
  onboarded: true,
  fulfilled: new Set<string>(),
  ...over,
});

const hook = async (entry?: string, onHaptic = jest.fn()) => {
  const view = await renderHook(() => useFeedSession(entry, { onHaptic }));
  await act(async () => {});
  return { ...view, onHaptic };
};

const ops = (table: string) =>
  mockFake.current.calls.filter((c) => c.table === table).map((c) => c.op);

beforeEach(() => {
  mockFake.current = makeFakeDb("user-1");
  mockLibrary.current = makeLibrary();
});

describe("like", () => {
  it("like then unlike issues insert then delete", async () => {
    const { result } = await hook();
    await act(async () => result.current.like("a"));
    expect(result.current.liked.has("a")).toBe(true);
    await act(async () => result.current.like("a"));
    expect(result.current.liked.has("a")).toBe(false);
    expect(ops("likes")).toEqual(["insert", "delete"]);
    expect(mockFake.current.calls[0].payload).toEqual({ user_id: "user-1", reel_id: "a" });
    expect(mockFake.current.calls[1].filters).toEqual([
      ["eq", "user_id", "user-1"],
      ["eq", "reel_id", "a"],
    ]);
  });

  it("is optimistic and haptic before the network answers", async () => {
    let release!: () => void;
    mockFake.current.gates["likes.insert"] = new Promise<void>((r) => (release = r));
    const { result, onHaptic } = await hook();
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.like("a");
    });
    expect(result.current.liked.has("a")).toBe(true);
    expect(onHaptic).toHaveBeenCalledTimes(1);
    expect(onHaptic).toHaveBeenCalledWith("like");
    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.liked.has("a")).toBe(true);
  });

  it("keeps the like when the row already exists (23505)", async () => {
    mockFake.current.failures["likes.insert"] = { code: "23505" };
    const { result } = await hook();
    await act(async () => result.current.like("a"));
    expect(result.current.liked.has("a")).toBe(true);
    expect(result.current.error).toBe("");
  });

  it("rolls back and sets the error when the insert fails", async () => {
    mockFake.current.failures["likes.insert"] = { code: "500", message: "down" };
    const { result } = await hook();
    await act(async () => result.current.like("a"));
    expect(result.current.liked.has("a")).toBe(false);
    expect(result.current.error).toBe("Could not save your like. Try again.");
  });

  it("rolls back an unlike that fails", async () => {
    mockLibrary.current = makeLibrary({ liked: new Set(["a"]) });
    mockFake.current.failures["likes.delete"] = { code: "500" };
    const { result } = await hook();
    expect(result.current.liked.has("a")).toBe(true);
    await act(async () => result.current.like("a"));
    expect(result.current.liked.has("a")).toBe(true);
    expect(result.current.error).not.toBe("");
  });

  it("onlyLike on a liked reel does nothing (double tap never unlikes)", async () => {
    mockLibrary.current = makeLibrary({ liked: new Set(["a"]) });
    const { result, onHaptic } = await hook();
    await act(async () => result.current.like("a", true));
    expect(result.current.liked.has("a")).toBe(true);
    expect(mockFake.current.calls).toHaveLength(0);
    expect(onHaptic).not.toHaveBeenCalled();
  });

  it("ignores a repeated tap while the same like is in flight", async () => {
    let release!: () => void;
    mockFake.current.gates["likes.insert"] = new Promise<void>((r) => (release = r));
    const { result, onHaptic } = await hook();
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.like("a", true);
      void result.current.like("a", true);
    });
    await act(async () => {
      release();
      await first;
    });
    expect(ops("likes")).toEqual(["insert"]);
    expect(onHaptic).toHaveBeenCalledTimes(1);
  });
});

describe("dislike", () => {
  it("is optimistic, haptic, and persists", async () => {
    const { result, onHaptic } = await hook();
    let out!: Promise<string>;
    await act(async () => {
      out = result.current.dislike("a");
    });
    expect(result.current.disliked.has("a")).toBe(true);
    expect(onHaptic).toHaveBeenCalledWith("dislike");
    await act(async () => {
      expect(await out).toBe("");
    });
    expect(ops("dislikes")).toEqual(["insert"]);
  });

  it("a second dislike while pending returns the wait message and issues nothing", async () => {
    let release!: () => void;
    mockFake.current.gates["dislikes.insert"] = new Promise<void>((r) => (release = r));
    const { result } = await hook();
    let first!: Promise<string>;
    let second = "";
    await act(async () => {
      first = result.current.dislike("a");
      second = await result.current.dislike("a");
      release();
      await first;
    });
    expect(second).toBe("Please wait for your previous change.");
    expect(ops("dislikes")).toEqual(["insert"]);
  });

  it("rolls back and returns the error copy on failure", async () => {
    mockFake.current.failures["dislikes.insert"] = { code: "500" };
    const { result } = await hook();
    let msg = "";
    await act(async () => {
      msg = await result.current.dislike("a");
    });
    expect(msg).toBe("Could not save your preference. Try again.");
    expect(result.current.disliked.has("a")).toBe(false);
  });

  it("treats 23505 as success and a second call undoes it (delete)", async () => {
    mockFake.current.failures["dislikes.insert"] = { code: "23505" };
    const { result } = await hook();
    await act(async () => {
      expect(await result.current.dislike("a")).toBe("");
    });
    expect(result.current.disliked.has("a")).toBe(true);
    await act(async () => {
      expect(await result.current.dislike("a")).toBe("");
    });
    expect(result.current.disliked.has("a")).toBe(false);
    expect(ops("dislikes")).toEqual(["insert", "delete"]);
  });
});

describe("markSeen and streak", () => {
  it("inserts into views once per id", async () => {
    const { result } = await hook();
    await act(async () => {
      await result.current.markSeen("a");
      await result.current.markSeen("a");
    });
    expect(ops("views")).toEqual(["insert"]);
    expect(mockFake.current.calls.find((c) => c.table === "views")?.payload).toEqual({
      user_id: "user-1",
      reel_id: "a",
    });
    expect(result.current.seen.has("a")).toBe(true);
  });

  it("does not insert for a reel the library already marks seen", async () => {
    mockLibrary.current = makeLibrary({ seen: new Set(["a"]) });
    const { result } = await hook();
    await act(async () => result.current.markSeen("a"));
    expect(ops("views")).toEqual([]);
  });

  it("counts 23505 as success and does not retry; other errors allow a retry", async () => {
    const { result } = await hook();
    mockFake.current.failures["views.insert"] = { code: "23505" };
    await act(async () => {
      await result.current.markSeen("a");
      await result.current.markSeen("a");
    });
    expect(ops("views")).toEqual(["insert"]);
    expect(result.current.seen.has("a")).toBe(true);

    mockFake.current.failures["views.insert"] = { code: "500" };
    await act(async () => {
      await result.current.markSeen("b");
      await result.current.markSeen("b");
    });
    expect(ops("views")).toEqual(["insert", "insert", "insert"]);
    expect(result.current.seen.has("b")).toBe(false);
  });

  it("reads the streak from learning_streak with the device timezone, 0 on failure", async () => {
    mockFake.current.rpcResult.value = 4;
    const { result } = await hook();
    expect(result.current.streak).toBe(4);
    expect(mockFake.current.rpcCalls[0]).toEqual({
      fn: "learning_streak",
      args: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
    mockFake.current.rpcResult.value = null;
    mockFake.current.rpcResult.error = { message: "x" };
    await act(async () => result.current.markSeen("a"));
    expect(result.current.streak).toBe(0);
  });

  it("refreshes the streak after a reel is recorded", async () => {
    mockFake.current.rpcResult.value = 1;
    const { result } = await hook();
    mockFake.current.rpcResult.value = 2;
    await act(async () => result.current.markSeen("a"));
    expect(result.current.streak).toBe(2);
  });
});

describe("items", () => {
  it("equals orderFeed for the library", async () => {
    const lib = makeLibrary();
    mockLibrary.current = lib;
    const { result } = await hook();
    expect(result.current.items.map((r) => r.id)).toEqual(
      orderFeed(lib.reels, lib.seen, {
        areas: lib.areas,
        liked: lib.liked,
        fulfilled: lib.fulfilled,
        disliked: lib.disliked,
      }).map((r) => r.id),
    );
  });

  it("is empty while the library is loading", async () => {
    mockLibrary.current = null;
    const { result } = await hook();
    expect(result.current.items).toEqual([]);
  });

  it("entry on Part 3 with Parts 1 and 2 unseen leads with p1, p2, p3 then the rest once", async () => {
    mockLibrary.current = makeLibrary({ reels: [reel("a"), part(3), part(1), reel("z"), part(2)] });
    const { result } = await hook("p3");
    const ids = result.current.items.map((r) => r.id);
    expect(ids.slice(0, 3)).toEqual(["p1", "p2", "p3"]);
    expect([...ids].sort()).toEqual(["a", "p1", "p2", "p3", "z"]);
  });

  it("entry on Part 3 skips earlier parts that were already seen", async () => {
    mockLibrary.current = makeLibrary({
      reels: [part(1), part(2), part(3), reel("a")],
      seen: new Set(["p1"]),
    });
    const { result } = await hook("p3");
    expect(result.current.items.slice(0, 2).map((r) => r.id)).toEqual(["p2", "p3"]);
  });

  it("an unknown entry id falls back to the normal order", async () => {
    const { result } = await hook("nope");
    expect(result.current.items).toHaveLength(2);
  });

  it("does not reorder under the user when a reel is marked seen", async () => {
    const { result } = await hook();
    const before = result.current.items.map((r) => r.id);
    await act(async () => result.current.markSeen(before[0]));
    expect(result.current.items.map((r) => r.id)).toEqual(before);
  });
});

describe("library refresh", () => {
  it("adopts new library state but keeps an in-flight optimistic like", async () => {
    let release!: () => void;
    mockFake.current.gates["likes.insert"] = new Promise<void>((r) => (release = r));
    const { result, rerender } = await hook();
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.like("a");
    });
    mockLibrary.current = makeLibrary({ liked: new Set(["b"]) });
    await rerender({});
    expect(result.current.liked.has("b")).toBe(true);
    expect(result.current.liked.has("a")).toBe(true);
    await act(async () => {
      release();
      await pending;
    });
  });
});
