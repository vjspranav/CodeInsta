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
