import { env } from "@/lib/env";

/**
 * Asks the server to apply the owner allowlist for this session (same rule as web /auth/google).
 * The role is decided server-side only. Failures are non-fatal: the app keeps working as a
 * member or sees the invite screen. The token is never logged.
 */
export async function bootstrapOwner(accessToken: string): Promise<"owner" | "member" | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${env.apiBase}/api/mobile/bootstrap`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { role?: unknown };
    return body.role === "owner" || body.role === "member" ? body.role : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
