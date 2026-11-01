jest.mock("@/lib/env", () => ({ env: { apiBase: "https://api.example" } }));

import { bootstrapOwner } from "./bootstrap";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("bootstrapOwner", () => {
  it("POSTs with the bearer token and returns the role", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ role: "owner" }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(bootstrapOwner("access")).resolves.toBe("owner");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/api/mobile/bootstrap");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access");
  });

  it("returns null on a non-ok response, a bad body or a network error", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as never;
    await expect(bootstrapOwner("t")).resolves.toBeNull();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ role: "root" }) })) as never;
    await expect(bootstrapOwner("t")).resolves.toBeNull();
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as never;
    await expect(bootstrapOwner("t")).resolves.toBeNull();
  });
});
