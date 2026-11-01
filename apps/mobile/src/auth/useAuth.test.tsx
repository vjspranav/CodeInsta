import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

type Listener = (event: string, session: unknown) => void;
let mockListener: Listener | null = null;
let mockSession: unknown = null;
const mockTables: Record<string, { data: unknown; error: unknown }> = {};
const mockRpc = jest.fn();
const mockSignOut = jest.fn(async () => ({ error: null }));
const mockSignInPassword = jest.fn();
const mockFetch = jest.fn();
const mockGoogle = jest.fn();
const mockBootstrap = jest.fn();

jest.mock("@/lib/supabase", () => ({
  db: {
    auth: {
      getSession: async () => ({ data: { session: mockSession }, error: null }),
      onAuthStateChange: (cb: Listener) => {
        mockListener = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signOut: (...a: unknown[]) => (mockSignOut as (...x: unknown[]) => unknown)(...a),
      signInWithPassword: (...a: unknown[]) => mockSignInPassword(...a),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => mockTables[table] ?? { data: null, error: null } }),
      }),
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));
const mockClearWidget = jest.fn();
jest.mock("@/widgets/sync", () => ({ clearWidgetSnapshot: () => mockClearWidget() }));
const mockUnregisterPush = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock("@/push/register", () => ({ unregisterPush: (...a: unknown[]) => mockUnregisterPush(...a) }));
jest.mock("./google", () => ({ signInWithGoogle: (...a: unknown[]) => mockGoogle(...a) }));
jest.mock("./bootstrap", () => ({ bootstrapOwner: (...a: unknown[]) => mockBootstrap(...a) }));

import { AuthProvider, useAuth } from "./useAuth";

const USER = { id: "u1", email: "a@b.c" };
const SESSION = { access_token: "access", user: USER };

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockListener = null;
  mockSession = null;
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockBootstrap.mockResolvedValue("member");
  global.fetch = mockFetch as unknown as typeof fetch;
});

const mount = () => renderHook(() => useAuth(), { wrapper });

describe("useAuth status", () => {
  it("is loading then signedOut without a session", async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it("needsInvite when the session has no members row", async () => {
    mockSession = SESSION;
    mockTables.members = { data: null, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("needsInvite"));
    expect(result.current.user).toEqual(USER);
    expect(result.current.role).toBeNull();
  });

  it("needsOnboarding when the member is not onboarded", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: { onboarded: false }, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("needsOnboarding"));
    expect(result.current.role).toBe("member");
  });

  it("needsOnboarding when no interests row exists", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: null, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("needsOnboarding"));
  });

  it("ready when onboarded, with the owner role", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "owner" }, error: null };
    mockTables.user_interests = { data: { onboarded: true }, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.role).toBe("owner");
  });

  it("treats a failed interests lookup as onboarded", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: null, error: { message: "boom" } };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("goes back to signedOut when the session is lost", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: { onboarded: true }, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => mockListener!("SIGNED_OUT", null));
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it("moves to needsInvite when membership disappears on refresh", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: { onboarded: true }, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    mockTables.members = { data: null, error: null };
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe("needsInvite");
  });

  it("does not treat a failed membership lookup as signed out or invite-less when already ready", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: { onboarded: true }, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    mockTables.members = { data: null, error: { message: "offline" } };
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe("ready");
  });
});

describe("useAuth actions", () => {
  it("signInWithGoogle refreshes membership after the bootstrap", async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    mockGoogle.mockImplementation(async () => {
      mockSession = SESSION;
      mockTables.members = { data: { role: "owner" }, error: null };
      mockTables.user_interests = { data: { onboarded: true }, error: null };
      return { ok: true };
    });
    await act(async () => {
      await expect(result.current.signInWithGoogle()).resolves.toEqual({ ok: true });
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.role).toBe("owner");
  });

  it("signInWithPassword returns an error string and bootstraps on success", async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    mockSignInPassword.mockResolvedValueOnce({ data: { session: null }, error: { message: "Invalid login credentials" } });
    await act(async () => {
      await expect(result.current.signInWithPassword("a@b.c", "password1")).resolves.toBe("Invalid login credentials");
    });
    mockSignInPassword.mockResolvedValueOnce({ data: { session: SESSION }, error: null });
    await act(async () => {
      await expect(result.current.signInWithPassword(" A@B.c ", "password1")).resolves.toBe("");
    });
    expect(mockSignInPassword).toHaveBeenLastCalledWith({ email: "a@b.c", password: "password1" });
    expect(mockBootstrap).toHaveBeenCalledWith("access");
  });

  describe("signUpWithInvite", () => {
    const ok = () => ({ ok: true, json: async () => ({ ok: true }) });
    const fail = (error: string) => ({ ok: false, json: async () => ({ error }) });

    it("validates locally before any network call", async () => {
      const { result } = await mount();
      await waitFor(() => expect(result.current.status).toBe("signedOut"));
      await act(async () => {
        await expect(result.current.signUpWithInvite("a@b.c", "password1", "  ")).resolves.toBe(
          "Enter an invite code to create an account.",
        );
        await expect(result.current.signUpWithInvite("a@b.c", "short", "CODE")).resolves.toBe(
          "Use a password with at least 8 characters.",
        );
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("surfaces the server error and never signs in", async () => {
      const { result } = await mount();
      await waitFor(() => expect(result.current.status).toBe("signedOut"));
      mockFetch.mockResolvedValueOnce(fail("Use Google to sign in with an owner email."));
      await act(async () => {
        await expect(result.current.signUpWithInvite("owner@b.c", "password1", "CODE")).resolves.toBe(
          "Use Google to sign in with an owner email.",
        );
      });
      expect(mockSignInPassword).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("reports offline when the request fails", async () => {
      const { result } = await mount();
      await waitFor(() => expect(result.current.status).toBe("signedOut"));
      mockFetch.mockRejectedValueOnce(new Error("network"));
      await act(async () => {
        await expect(result.current.signUpWithInvite("a@b.c", "password1", "CODE")).resolves.toBe(
          "Could not reach CodeInsta. Check your connection and try again.",
        );
      });
    });

    it("creates server-side, signs in, bootstraps, redeems, then refreshes", async () => {
      const { result } = await mount();
      await waitFor(() => expect(result.current.status).toBe("signedOut"));
      const order: string[] = [];
      mockFetch.mockImplementationOnce(async () => {
        order.push("create");
        return ok();
      });
      mockSignInPassword.mockImplementationOnce(async () => {
        order.push("signin");
        return { data: { session: SESSION }, error: null };
      });
      mockBootstrap.mockImplementationOnce(async () => {
        order.push("bootstrap");
        return "member";
      });
      mockRpc.mockImplementationOnce(async () => {
        order.push("redeem");
        mockSession = SESSION;
        mockTables.members = { data: { role: "member" }, error: null };
        mockTables.user_interests = { data: { onboarded: false }, error: null };
        return { data: true, error: null };
      });
      await act(async () => {
        await expect(result.current.signUpWithInvite(" A@B.c ", "password1", " CODE ")).resolves.toBe("");
      });
      expect(order).toEqual(["create", "signin", "bootstrap", "redeem"]);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toMatch(/\/api\/mobile\/signup$/);
      expect(JSON.parse(init.body)).toEqual({ email: "a@b.c", password: "password1", invite: "CODE" });
      expect(mockSignInPassword).toHaveBeenCalledWith({ email: "a@b.c", password: "password1" });
      expect(mockRpc).toHaveBeenCalledWith("redeem_invite", { invite: "CODE" });
      expect(result.current.status).toBe("needsOnboarding");
    });

    it("lands on the invite screen with a message when redemption loses a race", async () => {
      const { result } = await mount();
      await waitFor(() => expect(result.current.status).toBe("signedOut"));
      mockFetch.mockResolvedValueOnce(ok());
      mockSignInPassword.mockResolvedValueOnce({ data: { session: SESSION }, error: null });
      mockRpc.mockImplementationOnce(async () => {
        mockSession = SESSION;
        mockTables.members = { data: null, error: null };
        return { data: false, error: null };
      });
      await act(async () => {
        await expect(result.current.signUpWithInvite("a@b.c", "password1", "CODE")).resolves.toBe(
          "This invite is invalid, expired, or fully used.",
        );
      });
      expect(result.current.status).toBe("needsInvite");
    });
  });

  it("redeemInvite maps results to the web messages", async () => {
    mockSession = SESSION;
    mockTables.members = { data: null, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("needsInvite"));
    await act(async () => {
      await expect(result.current.redeemInvite("   ")).resolves.toBe("Enter your invite code.");
    });
    expect(mockRpc).not.toHaveBeenCalled();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    await act(async () => {
      await expect(result.current.redeemInvite("abc")).resolves.toBe("Could not redeem your invite. Please retry.");
    });
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    await act(async () => {
      await expect(result.current.redeemInvite("abc")).resolves.toBe("This invite is invalid, expired, or fully used.");
    });
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: { onboarded: false }, error: null };
    await act(async () => {
      await expect(result.current.redeemInvite(" abc ")).resolves.toBe("");
    });
    expect(mockRpc).toHaveBeenLastCalledWith("redeem_invite", { invite: "abc" });
    expect(result.current.status).toBe("needsOnboarding");
  });

  it("signOut ends in signedOut", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: { onboarded: true }, error: null };
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.signOut();
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(result.current.status).toBe("signedOut");
    expect(mockClearWidget).toHaveBeenCalled();
  });

  it("signOut deletes the push token before the session is cleared, and survives failure", async () => {
    mockSession = SESSION;
    mockTables.members = { data: { role: "member" }, error: null };
    mockTables.user_interests = { data: { onboarded: true }, error: null };
    const order: string[] = [];
    mockUnregisterPush.mockImplementationOnce(async () => {
      order.push("push");
    });
    mockSignOut.mockImplementationOnce(async () => {
      order.push("auth");
      return { error: null };
    });
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.signOut();
    });
    expect(mockUnregisterPush).toHaveBeenCalledWith("u1");
    expect(order).toEqual(["push", "auth"]);

    mockUnregisterPush.mockRejectedValueOnce(new Error("boom"));
    mockSession = SESSION;
    const second = await mount();
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
    await act(async () => {
      await second.result.current.signOut();
    });
    expect(second.result.current.status).toBe("signedOut");
  });
});
