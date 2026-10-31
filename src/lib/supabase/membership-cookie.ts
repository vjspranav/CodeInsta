// Short-lived signed cache of `{role, uid, exp}` so middleware can skip the
// per-request `members` query. Web Crypto only: it runs on the Edge runtime.
export const MEMBERSHIP_COOKIE = "ci_mem";
export const MEMBERSHIP_TTL_SECONDS = 600;

const encoder = new TextEncoder();

function secret(): string | null {
  const explicit = process.env.MEMBERSHIP_COOKIE_SECRET;
  if (explicit) return explicit;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return service ? `ci-membership-cookie:${service}` : null;
}

async function sign(payload: string, key: string): Promise<string> {
  // Derive the HMAC key from a SHA-256 of the secret so a raw service key is never used directly.
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  const hmac = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, encoder.encode(payload)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type CachedMembership = { role: "owner" | "member"; uid: string; exp: number };

export async function createMembershipCookie(
  role: "owner" | "member",
  uid: string,
  now = Date.now(),
): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const payload = `${role}.${uid}.${Math.floor(now / 1000) + MEMBERSHIP_TTL_SECONDS}`;
  return `${payload}.${await sign(payload, key)}`;
}

/** Returns the cached role only when the signature, uid and expiry all check out. */
export async function readMembershipCookie(
  value: string | undefined,
  uid: string,
  now = Date.now(),
): Promise<"owner" | "member" | null> {
  const key = secret();
  if (!key || !value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [role, cachedUid, exp, signature] = parts;
  if (role !== "owner" && role !== "member") return null;
  if (cachedUid !== uid) return null;
  if (!(Number(exp) > Math.floor(now / 1000))) return null;
  const expected = await sign(`${role}.${cachedUid}.${exp}`, key);
  return equal(expected, signature) ? role : null;
}
