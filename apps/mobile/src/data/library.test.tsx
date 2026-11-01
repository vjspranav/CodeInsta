import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { orderFeed } from "@shared/feed";

type Result = { data: unknown; error: unknown };
const mockResults: Record<string, Result> = {};
const mockCalls: { table: string; method: string; args: unknown[] }[] = [];
const mockUser: { current: { id: string } | null } = { current: { id: "u1" } };

jest.mock("@/lib/supabase", () => ({
  db: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = (method: string) => (...args: unknown[]) => {
        mockCalls.push({ table, method, args });
        return builder;
      };
      for (const m of ["select", "is", "order", "eq", "not"]) builder[m] = chain(m);
      builder.maybeSingle = () => {
        mockCalls.push({ table, method: "maybeSingle", args: [] });
        return Promise.resolve(mockResults[table] ?? { data: null, error: null });
      };
      builder.then = (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve(mockResults[table] ?? { data: [], error: null }).then(ok, bad);
      return builder;
    },
  },
}));
const mockSyncWidget = jest.fn(async () => {});
jest.mock("@/widgets/sync", () => ({ syncWidgetAfterLoad: (...a: unknown[]) => (mockSyncWidget as (...x: unknown[]) => unknown)(...a) }));
jest.mock("@/auth/useAuth", () => ({ useAuth: () => ({ user: mockUser.current }) }));

import { fetchLibrary, useFeed, useLibrary } from "./library";

const reel = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  creator_id: "claude",
  title: id,
  topic: "os/x",
  tags: [],
  series: null,
  series_index: null,
  created_at: "2026-11-01T00:00:00Z",
  video_url: `https://cdn.example/${id}.mp4`,
  glossary: null,
  parent_reel_id: null,
  genre: null,
  style: null,
  poster_url: null,
  expires_at: null,
  ...over,
});

beforeEach(() => {
  mockCalls.length = 0;
  mockSyncWidget.mockClear();
  for (const k of Object.keys(mockResults)) delete mockResults[k];
  mockUser.current = { id: "u1" };
  mockResults.reels = {
    data: [
      reel("p2", { series: "sched", series_index: 2, created_at: "2026-11-01T01:00:00Z" }),
      reel("p1", { series: "sched", series_index: 1, created_at: "2026-11-01T00:00:00Z" }),
      reel("novideo", { video_url: null }),
      reel("lab", { topic: "lab/x" }),
      reel("labv3", { topic: "lab-v3/y" }),
      reel("expired", { expires_at: "2020-01-01T00:00:00Z" }),
    ],
    error: null,
  };
  mockResults.likes = { data: [{ reel_id: "p1" }], error: null };
  mockResults.views = { data: [{ reel_id: "seenreel" }], error: null };
  mockResults.dislikes = { data: [], error: null };
  mockResults.creators = { data: [{ id: "claude", display_name: "Claude", handle: "claude", bio: "", avatar_url: null }], error: null };
  mockResults.categories = { data: [{ slug: "os", label: "OS", description: "" }], error: null };
  mockResults.user_interests = { data: { areas: ["os"], onboarded: true }, error: null };
  mockResults.topic_requests = { data: [{ fulfilled_reel_id: "p2" }], error: null };
});

describe("fetchLibrary", () => {
  it("applies the archived filter and selects trimmed reel columns", async () => {
    await fetchLibrary("u1");
    const reels = mockCalls.filter((c) => c.table === "reels");
    expect(reels.find((c) => c.method === "is")?.args).toEqual(["archived_at", null]);
    expect(reels.find((c) => c.method === "order")?.args).toEqual(["created_at", { ascending: false }]);
    expect(String(reels.find((c) => c.method === "select")?.args[0])).toContain("poster_url:script->>poster_url");
  });

  it("drops rows with no video, lab reels and expired reels", async () => {
    const library = await fetchLibrary("u1");
    expect(library.reels.map((r) => r.id).sort()).toEqual(["p1", "p2"]);
  });

  it("builds the user sets", async () => {
    const library = await fetchLibrary("u1");
    expect([...library.liked]).toEqual(["p1"]);
    expect([...library.seen]).toEqual(["seenreel"]);
    expect([...library.fulfilled]).toEqual(["p2"]);
    expect(library.areas).toEqual(["os"]);
    expect(library.onboarded).toBe(true);
    expect(library.creators).toHaveLength(1);
    expect(library.categories).toHaveLength(1);
  });

  it("treats a failed interests query as onboarded with no areas", async () => {
    mockResults.user_interests = { data: null, error: { message: "boom" } };
    const library = await fetchLibrary("u1");
    expect(library.onboarded).toBe(true);
    expect(library.areas).toEqual([]);
  });

  it("reports a missing interests row as not onboarded", async () => {
    mockResults.user_interests = { data: null, error: null };
    const library = await fetchLibrary("u1");
    expect(library.onboarded).toBe(false);
  });

  it("throws when the reels query fails", async () => {
    mockResults.reels = { data: null, error: { message: "down" } };
    await expect(fetchLibrary("u1")).rejects.toThrow("Could not load your library. Try again.");
  });

  it("does not fail when topic_requests errors", async () => {
    mockResults.topic_requests = { data: null, error: { message: "x" } };
    expect((await fetchLibrary("u1")).fulfilled.size).toBe(0);
  });
});

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe("useLibrary and useFeed", () => {
  it("loads the library for the signed-in user", async () => {
    const { result } = await renderHook(() => useLibrary(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.library).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("");
  });

  it("syncs the widget snapshot after a load and survives a sync failure", async () => {
    mockSyncWidget.mockRejectedValueOnce(new Error("bridge"));
    const { result } = await renderHook(() => useLibrary(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.library).not.toBeNull());
    expect(mockSyncWidget).toHaveBeenCalledTimes(1);
    expect((mockSyncWidget.mock.calls[0] as unknown[])[0]).toBe(result.current.library);
  });

  it("markSeenInCache adds to the cached seen set without changing identity", async () => {
    const { result } = await renderHook(() => useLibrary(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.library).not.toBeNull());
    const before = result.current.library!;
    await act(async () => result.current.markSeenInCache("p1"));
    expect(result.current.library).toBe(before);
    expect(before.seen.has("p1")).toBe(true);
  });

  it("does not query without a user", async () => {
    mockUser.current = null;
    const { result } = await renderHook(() => useLibrary(), { wrapper: makeWrapper() });
    expect(result.current.library).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockCalls).toHaveLength(0);
  });

  it("reports an error message and no library when loading fails", async () => {
    mockResults.reels = { data: null, error: { message: "down" } };
    const { result } = await renderHook(() => useLibrary(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.error).not.toBe(""));
    expect(result.current.library).toBeNull();
  });

  it("useFeed equals orderFeed over the library, with Part 1 before Part 2", async () => {
    const { result } = await renderHook(() => ({ feed: useFeed(), lib: useLibrary() }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.lib.library).not.toBeNull());
    const library = result.current.lib.library!;
    const expected = orderFeed(library.reels, library.seen, {
      areas: library.areas,
      liked: library.liked,
      fulfilled: library.fulfilled,
      disliked: library.disliked,
    });
    expect(result.current.feed).toEqual(expected);
    const ids = result.current.feed.map((r) => r.id);
    expect(ids.indexOf("p1")).toBeLessThan(ids.indexOf("p2"));
  });
});

describe("sameLibrary", () => {
  it("is true for two fetches of unchanged data and false when a set changes", async () => {
    const { sameLibrary } = jest.requireActual("./library") as typeof import("./library");
    const a = await fetchLibrary("u1");
    const b = await fetchLibrary("u1");
    expect(sameLibrary(a, b)).toBe(true);
    b.liked.add("zzz");
    expect(sameLibrary(a, b)).toBe(false);
  });
});
