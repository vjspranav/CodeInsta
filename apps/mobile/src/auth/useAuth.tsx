import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { unregisterPush } from "@/push/register";
import { clearWidgetSnapshot } from "@/widgets/sync";
import { bootstrapOwner } from "./bootstrap";
import { signInWithGoogle as googleSignIn, type GoogleResult } from "./google";

export type AuthStatus = "loading" | "signedOut" | "needsInvite" | "needsOnboarding" | "ready";
export type Role = "owner" | "member" | null;

export type Auth = {
  status: AuthStatus;
  user: User | null;
  role: Role;
  /** Set when membership could not be read and no earlier state exists (offline cold start). */
  error: string;
  refresh(): Promise<void>;
  signInWithGoogle(): Promise<GoogleResult>;
  /** Email auth and invite redemption return "" on success, else a user-facing message. */
  signInWithPassword(email: string, password: string): Promise<string>;
  /** Invited email signup: server creates the pre-confirmed account (same rules as web), then sign in and redeem. */
  signUpWithInvite(email: string, password: string, invite: string): Promise<string>;
  redeemInvite(code: string): Promise<string>;
  signOut(): Promise<void>;
};

type State = { status: AuthStatus; user: User | null; role: Role; error: string };
const INITIAL: State = { status: "loading", user: null, role: null, error: "" };
const SIGNED_OUT: State = { status: "signedOut", user: null, role: null, error: "" };
const OFFLINE = "Could not reach CodeInsta. Check your connection and try again.";

async function resolveState(user: User): Promise<State | "error"> {
  const member = await db.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (member.error) return "error";
  if (!member.data) return { status: "needsInvite", user, role: null, error: "" };
  const role: Role = member.data.role === "owner" ? "owner" : "member";
  const interests = await db
    .from("user_interests")
    .select("onboarded")
    .eq("user_id", user.id)
    .maybeSingle();
  // Like web: a failed interests lookup must not lock anyone out.
  const onboarded = interests.error ? true : Boolean(interests.data?.onboarded);
  return { status: onboarded ? "ready" : "needsOnboarding", user, role, error: "" };
}

const same = (a: State, b: State) =>
  a.status === b.status && a.role === b.role && a.error === b.error && a.user?.id === b.user?.id;

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(INITIAL);
  const current = useRef<State>(INITIAL);
  const ticket = useRef(0);

  const commit = useCallback((next: State) => {
    // Session ended or membership lost: the widgets must not keep showing member content.
    // Best effort (clearWidgetSnapshot never throws). The push token is deleted in signOut, while
    // the session still exists (RLS needs it).
    if (next.status === "signedOut" || next.status === "needsInvite") {
      try {
        clearWidgetSnapshot();
      } catch {
        // Never block auth state on a widget bridge failure.
      }
    }
    current.current = next;
    setState((prev) => (same(prev, next) && prev.user === next.user ? prev : next));
  }, []);

  /** Re-derive status from the stored session. The newest call wins; stale results are dropped. */
  const sync = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const { data } = await db.auth.getSession();
      if (mine !== ticket.current) return;
      const user = data.session?.user ?? null;
      if (!user) return commit(SIGNED_OUT);
      const next = await resolveState(user);
      if (mine !== ticket.current) return;
      if (next === "error") {
        // Keep what we knew; on a cold start fall back to the login screen with a message.
        const prior = current.current;
        if (prior.status !== "loading" && prior.status !== "signedOut" && prior.user?.id === user.id) return;
        return commit({ status: "signedOut", user, role: null, error: OFFLINE });
      }
      commit(next);
    } catch {
      if (mine !== ticket.current) return;
      const prior = current.current;
      if (prior.status === "loading" || prior.status === "signedOut") {
        commit({ ...SIGNED_OUT, error: OFFLINE });
      }
    }
  }, [commit]);

  useEffect(() => {
    void sync();
    const { data } = db.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      if (event === "SIGNED_OUT") {
        ticket.current++;
        commit(SIGNED_OUT);
        return;
      }
      // Defer: awaiting Supabase calls inside this callback can deadlock the auth lock.
      setTimeout(() => void sync(), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [sync, commit]);

  const signInWithGoogle = useCallback(async () => {
    const result = await googleSignIn();
    if (result.ok) await sync();
    return result;
  }, [sync]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await db.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) return error.message;
      if (!data.session) return "Check your email to confirm your account, then sign in.";
      try {
        await bootstrapOwner(data.session.access_token);
      } catch {
        // Non-fatal.
      }
      await sync();
      return "";
    },
    [sync],
  );

  const signUpWithInvite = useCallback(
    async (rawEmail: string, password: string, rawInvite: string) => {
      const email = rawEmail.trim().toLowerCase();
      const invite = rawInvite.trim();
      if (!invite) return "Enter an invite code to create an account.";
      if (password.length < 8) return "Use a password with at least 8 characters.";
      // The server owns every signup rule (invite, owner email, pre-confirmed creation).
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${env.apiBase}/api/mobile/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, invite }),
          signal: controller.signal,
        });
        if (!response.ok) {
          let message = "";
          try {
            const body = (await response.json()) as { error?: unknown };
            if (typeof body.error === "string") message = body.error;
          } catch {
            // Fall through to the generic message.
          }
          return message || "Could not create your account. Please retry.";
        }
      } catch {
        return OFFLINE;
      } finally {
        clearTimeout(timer);
      }
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      if (!data.session) return "Check your email to confirm your account, then sign in.";
      try {
        await bootstrapOwner(data.session.access_token);
      } catch {
        // Non-fatal.
      }
      const redeemed = await db.rpc("redeem_invite", { invite });
      // Like web: a lost redemption race leaves a signed-in non-member, who lands on the invite screen.
      await sync();
      if (redeemed.error || !redeemed.data) return "This invite is invalid, expired, or fully used.";
      return "";
    },
    [sync],
  );

  const redeemInvite = useCallback(
    async (code: string) => {
      const invite = code.trim();
      if (!invite) return "Enter your invite code.";
      const { data, error } = await db.rpc("redeem_invite", { invite });
      if (error) return "Could not redeem your invite. Please retry.";
      if (!data) return "This invite is invalid, expired, or fully used.";
      await sync();
      return "";
    },
    [sync],
  );

  const signOut = useCallback(async () => {
    // Delete this device's push token while the session is still valid. Best effort and bounded
    // so an offline sign-out is never held up.
    const userId = current.current.user?.id;
    if (userId) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          unregisterPush(userId),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 3000);
          }),
        ]);
      } catch {
        // unregisterPush never throws; belt and braces.
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      await db.auth.signOut();
    } catch {
      // The local session is cleared by the SIGNED_OUT path below regardless.
    }
    ticket.current++;
    commit(SIGNED_OUT);
  }, [commit]);

  const value = useMemo<Auth>(
    () => ({
      ...state,
      refresh: sync,
      signInWithGoogle,
      signInWithPassword,
      signUpWithInvite,
      redeemInvite,
      signOut,
    }),
    [state, sync, signInWithGoogle, signInWithPassword, signUpWithInvite, redeemInvite, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
