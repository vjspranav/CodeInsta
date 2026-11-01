import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { signIn as credentialSignIn } from "react-native-credentials-manager";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { bootstrapOwner } from "./bootstrap";
import { makeNonce } from "./nonce";

export type GoogleResult = { ok: true } | { ok: false; reason: "cancelled" | "failed" };

const CALLBACK = "codeinsta://auth/callback";

class Cancelled extends Error {}

/** Cancellation text from the native Credential Manager varies; match loosely and never echo it. */
function isCancel(error: unknown): boolean {
  const e = error as { code?: unknown; name?: unknown; message?: unknown } | null;
  const text = [e?.code, e?.name, e?.message].filter((v) => typeof v === "string").join(" ");
  return /cancel|dismiss/i.test(text);
}

/** Android: system Credential Manager gives a Google ID token carrying SHA-256(raw). */
async function androidSession(): Promise<string | undefined> {
  const { raw, hashed } = await makeNonce();
  let token: string | undefined;
  try {
    const credential = await credentialSignIn(["google-signin"], {
      googleSignIn: {
        serverClientId: env.googleWebClientId,
        nonce: hashed,
        autoSelectEnabled: true,
        filterByAuthorizedAccounts: false,
      },
    });
    token = (credential as { idToken?: string }).idToken;
  } catch (error) {
    if (isCancel(error)) throw new Cancelled();
    throw new Error("google");
  }
  if (!token) throw new Error("google");
  const { data, error } = await db.auth.signInWithIdToken({ provider: "google", token, nonce: raw });
  if (error) throw new Error("supabase");
  return data.session?.access_token;
}

/** iOS: Supabase PKCE sign-in in the system browser session, then exchange the code. */
async function iosSession(): Promise<string | undefined> {
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: CALLBACK, skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw new Error("supabase");
  const result = await WebBrowser.openAuthSessionAsync(data.url, CALLBACK);
  if (result.type !== "success") {
    if (result.type === "cancel" || result.type === "dismiss") throw new Cancelled();
    throw new Error("browser");
  }
  const code = /[?&]code=([^&#]+)/.exec(result.url)?.[1];
  if (!code) throw new Error("callback");
  const exchanged = await db.auth.exchangeCodeForSession(decodeURIComponent(code));
  if (exchanged.error) throw new Error("supabase");
  return exchanged.data.session?.access_token;
}

/**
 * Native Google sign-in. Errors are reduced to a reason; tokens, nonces, codes and session data
 * are never logged or returned. The owner bootstrap is best effort.
 */
export async function signInWithGoogle(): Promise<GoogleResult> {
  try {
    const accessToken = Platform.OS === "ios" ? await iosSession() : await androidSession();
    if (accessToken) {
      try {
        await bootstrapOwner(accessToken);
      } catch {
        // Non-fatal: membership is re-read by useAuth and the server decides ownership.
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Cancelled ? "cancelled" : "failed" };
  }
}
