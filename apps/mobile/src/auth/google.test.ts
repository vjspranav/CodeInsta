import { Platform } from "react-native";

const mockSignInWithIdToken = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockExchange = jest.fn();
const mockCredSignIn = jest.fn();
const mockOpenAuthSession = jest.fn();
const mockBootstrap = jest.fn();

jest.mock("@/lib/supabase", () => ({
  db: {
    auth: {
      signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a),
      signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a),
      exchangeCodeForSession: (...a: unknown[]) => mockExchange(...a),
    },
  },
}));
jest.mock("@/lib/env", () => ({ env: { googleWebClientId: "web-client", apiBase: "https://api.example" } }));
jest.mock("react-native-credentials-manager", () => ({
  signIn: (...a: unknown[]) => mockCredSignIn(...a),
}));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSession(...a),
}));
jest.mock("./nonce", () => ({
  makeNonce: async () => ({ raw: "RAWNONCE", hashed: "HASHEDNONCE" }),
}));
jest.mock("./bootstrap", () => ({ bootstrapOwner: (...a: unknown[]) => mockBootstrap(...a) }));

import { signInWithGoogle } from "./google";

const SECRETS = ["tok", "RAWNONCE", "HASHEDNONCE", "access-tok", "auth-code"];

function logged(spies: jest.SpyInstance[]): string {
  return JSON.stringify(spies.flatMap((s) => s.mock.calls));
}

let spies: jest.SpyInstance[];
beforeEach(() => {
  jest.clearAllMocks();
  spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  mockBootstrap.mockResolvedValue("owner");
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("signInWithGoogle on Android", () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "android");
  });

  it("passes the hashed nonce to Google and the raw nonce to Supabase", async () => {
    mockCredSignIn.mockResolvedValue({ type: "google-signin", idToken: "tok" });
    mockSignInWithIdToken.mockResolvedValue({
      data: { session: { access_token: "access-tok" } },
      error: null,
    });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: true });
    expect(mockCredSignIn).toHaveBeenCalledWith(["google-signin"], {
      googleSignIn: {
        serverClientId: "web-client",
        nonce: "HASHEDNONCE",
        autoSelectEnabled: true,
        filterByAuthorizedAccounts: false,
      },
    });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "tok",
      nonce: "RAWNONCE",
    });
    expect(mockBootstrap).toHaveBeenCalledWith("access-tok");
  });

  it("reports a user cancel as cancelled", async () => {
    mockCredSignIn.mockRejectedValue(new Error("activity is cancelled by the user"));
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, reason: "cancelled" });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("reports a Supabase error as failed and never logs tokens or nonces", async () => {
    mockCredSignIn.mockResolvedValue({ type: "google-signin", idToken: "tok" });
    mockSignInWithIdToken.mockResolvedValue({
      data: { session: null },
      error: new Error("bad token tok RAWNONCE"),
    });
    const result = await signInWithGoogle();
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(JSON.stringify(result)).not.toMatch(/tok|RAWNONCE/);
    const out = logged(spies);
    for (const secret of SECRETS) expect(out).not.toContain(secret);
  });

  it("fails without a token", async () => {
    mockCredSignIn.mockResolvedValue({ type: "google-signin" });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("still succeeds when bootstrap fails", async () => {
    mockCredSignIn.mockResolvedValue({ type: "google-signin", idToken: "tok" });
    mockSignInWithIdToken.mockResolvedValue({
      data: { session: { access_token: "access-tok" } },
      error: null,
    });
    mockBootstrap.mockRejectedValue(new Error("network access-tok"));
    await expect(signInWithGoogle()).resolves.toEqual({ ok: true });
    for (const secret of SECRETS) expect(logged(spies)).not.toContain(secret);
  });
});

describe("signInWithGoogle on iOS", () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "ios");
    mockSignInWithOAuth.mockResolvedValue({ data: { url: "https://auth.example/authorize" }, error: null });
  });

  it("opens the PKCE browser session and exchanges the returned code", async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: "success",
      url: "codeinsta://auth/callback?code=auth-code",
    });
    mockExchange.mockResolvedValue({
      data: { session: { access_token: "access-tok" } },
      error: null,
    });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: true });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "codeinsta://auth/callback", skipBrowserRedirect: true },
    });
    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      "https://auth.example/authorize",
      "codeinsta://auth/callback",
    );
    expect(mockExchange).toHaveBeenCalledWith("auth-code");
    expect(mockBootstrap).toHaveBeenCalledWith("access-tok");
    expect(mockCredSignIn).not.toHaveBeenCalled();
  });

  it("maps a dismissed browser to cancelled", async () => {
    mockOpenAuthSession.mockResolvedValue({ type: "cancel" });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, reason: "cancelled" });
    mockOpenAuthSession.mockResolvedValue({ type: "dismiss" });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, reason: "cancelled" });
  });

  it("fails when the callback has no code or the exchange errors", async () => {
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: "codeinsta://auth/callback?error=access_denied" });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, reason: "failed" });
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: "codeinsta://auth/callback?code=auth-code" });
    mockExchange.mockResolvedValue({ data: { session: null }, error: new Error("auth-code") });
    await expect(signInWithGoogle()).resolves.toEqual({ ok: false, reason: "failed" });
    for (const secret of SECRETS) expect(logged(spies)).not.toContain(secret);
  });
});
