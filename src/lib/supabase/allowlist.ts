// Owner = allowlisted email *verified by Google*. Password accounts can claim any
// email (confirmations are off), so they never get owner rights.
export function isOwnerUser(
  user: { email?: string; app_metadata?: { providers?: string[] } } | null | undefined,
) {
  return !!user && isAllowed(user.email) && !!user.app_metadata?.providers?.includes("google");
}
export function isAllowed(
  email: string | undefined,
  list = process.env.ALLOWED_EMAILS ?? "",
) {
  return (
    !!email &&
    list
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.trim().toLowerCase())
  );
}
