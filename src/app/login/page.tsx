"use client";
import { useActionState, useState, useEffect, useRef } from "react";
import { ArrowRight, Code2 } from "lucide-react";
import { authenticate } from "./actions";
import Script from "next/script";

type GoogleIdentity = {
  initialize: (options: { client_id: string; ux_mode: "redirect"; login_uri: string; nonce: string }) => void;
  renderButton: (element: HTMLElement, options: { theme: "filled_black"; size: "large"; shape: "pill"; text: "continue_with"; width: number }) => void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}
export default function Login() {
  const googleButton = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [invite, setInvite] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "google") setOauthError("Google sign-in failed or expired. Please try again.");
    const code = params.get("invite");
    if (code) { setInvite(code); setMode("signup"); }
  }, []);
  const [mode, setMode] = useState("signin");
  const [state, action, pending] = useActionState(authenticate, { error: "" });
  const [oauthError, setOauthError] = useState("");
  useEffect(() => {
    if (!googleReady) return;
    const controller = new AbortController();
    async function initializeGoogle() {
      try {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) throw new Error("Missing Google client ID");
        const response = await fetch("/auth/google/nonce", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Nonce request failed");
        const { nonce } = await response.json();
        const element = googleButton.current;
        const identity = window.google?.accounts.id;
        if (controller.signal.aborted || !element) return;
        if (!identity || typeof nonce !== "string") throw new Error("Google unavailable");
        identity.initialize({ client_id: clientId, ux_mode: "redirect", login_uri: `${location.origin}/auth/google`, nonce });
        element.replaceChildren();
        identity.renderButton(element, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: Math.min(400, Math.floor(element.getBoundingClientRect().width)) });
      } catch {
        if (!controller.signal.aborted) setOauthError("Google sign-in is unavailable. Please reload and try again.");
      }
    }
    void initializeGoogle();
    // Refresh before the ten-minute nonce cookie expires while the login page stays open.
    const timer = window.setInterval(() => void initializeGoogle(), 9 * 60 * 1000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [googleReady]);
  return (
    <main className="login">
      <div className="login-brand">
        <Code2 size={32} />
        <strong>codeinsta</strong>
      </div>
      <div className="login-content">
        <p className="muted">Your next scroll could teach you something.</p>
        <h1>
          Less scrolling.
          <br />
          More <span>understanding.</span>
        </h1>
        <p>
          Systems, one reel at a time.
          <br />
          Built by Claude. Debugged with GPT.
        </p>
        <div className="auth-tabs">
          <button
            aria-pressed={mode === "signin"}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            aria-pressed={mode === "signup"}
            onClick={() => setMode("signup")}
          >
            Create account
          </button>
        </div>
        <form action={action}>
          <input type="hidden" name="mode" value={mode} />
          <label>
            Email
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              type="password"
              name="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              placeholder="At least 8 characters"
            />
          </label>
          {mode === "signup" && <label>Invite code
            <input name="invite" value={invite} onChange={(event) => setInvite(event.target.value)} autoComplete="off" />
            <small className="muted">Required unless you are an owner.</small>
          </label>}
          <p role="alert" className="error">
            {state.error || oauthError}
          </p>
          <button className="primary" disabled={pending}>
            {pending
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>
        {process.env.NEXT_PUBLIC_ENABLE_GOOGLE !== "false" && (
          <>
            <Script src="https://accounts.google.com/gsi/client" onReady={() => setGoogleReady(true)} onError={() => setOauthError("Google sign-in could not load. Please reload and try again.")} />
            <div ref={googleButton} className="google" />
            {mode === "signup" && <small className="muted">New Google users need an invite code after signing in.</small>}
          </>
        )}
        <small className="muted">A private space for curious engineers.</small>
      </div>
    </main>
  );
}
