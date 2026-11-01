import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

type Listener = (event: string, session: unknown) => void;
let mockListener: Listener | null = null;
let mockSession: unknown = null;
const mockTables: Record<string, { data: unknown; error: unknown }> = {};
const mockRpc = jest.fn();
const mockSignOut = jest.fn(async () => ({ error: null }));
const mockSignInPassword = jest.fn();
const mockSignUp = jest.fn();
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
      signUp: (...a: unknown[]) => mockSignUp(...a),
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

  it("signUpWithPassword validates length and asks to confirm email without a session", async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    await act(async () => {
      await expect(result.current.signUpWithPassword("a@b.c", "short")).resolves.toBe(
        "Use a password with at least 8 characters.",
      );
    });
    expect(mockSignUp).not.toHaveBeenCalled();
    mockSignUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    await act(async () => {
      await expect(result.current.signUpWithPassword("a@b.c", "password1")).resolves.toBe(
        "Check your email to confirm your account, then sign in.",
      );
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
});
