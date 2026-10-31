import Link from "next/link";
export default function NotInvited() {
  return (
    <main className="empty">
      <h1>This space is invite-only.</h1>
      <p>Sign in with your invited email address to continue.</p>
      <Link className="primary" href="/login">
        Back to sign in
      </Link>
    </main>
  );
}
