"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { join } from "./actions";
import { signOut } from "../login/actions";
export default function Join() {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (new URLSearchParams(location.search).get("error") === "invite")
      setNotice("Your account is ready, but that invite could not be redeemed. Try another code.");
  }, []);
  const [state, action, pending] = useActionState(join, { error: "" });
  return <main className="login"><div className="login-content">
    <h1>Join CodeInsta</h1><p>Enter an invite from a friend to start watching.</p>
    <form action={action}>
      <label>Invite code<input name="invite" required autoComplete="off" /></label>
      <p role="alert" className="error">{state.error || notice}</p>
      <button className="primary" disabled={pending}>{pending ? "Joining…" : "Join"}</button>
    </form>
    <form action={signOut}><button className="signout">Sign out</button></form>
    <Link href="/login">Back to sign in</Link>
  </div></main>;
}
