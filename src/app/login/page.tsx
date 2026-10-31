"use client";
import { useActionState, useState } from "react";
import { ArrowRight, Code2 } from "lucide-react";
import { authenticate } from "./actions";
import { browserDb } from "@/lib/supabase/browser";
export default function Login() {
  const [mode, setMode] = useState("signin");
  const [state, action, pending] = useActionState(authenticate, { error: "" });
  const [oauthError, setOauthError] = useState("");
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
        {process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "true" && (
          <button
            className="google"
            onClick={async () => {
              const { error } = await browserDb().auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `${location.origin}/auth/callback` },
              });
              if (error) setOauthError(error.message);
            }}
          >
            Continue with Google
          </button>
        )}
        <small className="muted">A private space for curious engineers.</small>
      </div>
    </main>
  );
}
