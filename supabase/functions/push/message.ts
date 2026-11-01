// Pure helpers for the push edge function. No Deno or network access here so root vitest can run them.
// Privacy rule: notification copy is fixed. Message and request text never enters a push payload;
// Expo's servers relay it, so buildPush only reads ids and statuses from the event.

export type PushEvent =
  | { kind: "creator_message"; user_id: string; creator_id: string; creator_name?: string }
  | { kind: "request_status"; user_id: string; status: "approved" | "done" };

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: { route: string };
};

export type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
} | null | undefined;

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const CHUNK_SIZE = 100;

const SAFE_ID = /^[a-z0-9-]+$/;
const EXPO_TOKEN = /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/;

export function isExpoToken(value: unknown): value is string {
  return typeof value === "string" && EXPO_TOKEN.test(value);
}

export function chunk<T>(items: readonly T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function copyFor(event: PushEvent): { title: string; body: string; route: string } | null {
  if (event.kind === "creator_message") {
    const name = typeof event.creator_name === "string" && event.creator_name.trim() ? event.creator_name.trim() : "A creator";
    const id = typeof event.creator_id === "string" ? event.creator_id : "";
    return {
      title: `${name} replied`,
      body: "Open your inbox to read it.",
      route: SAFE_ID.test(id) ? `/inbox/${id}` : "/",
    };
  }
  if (event.kind === "request_status") {
    if (event.status === "approved") {
      return { title: "Topic approved", body: "A creator is working on your request.", route: "/requests" };
    }
    if (event.status === "done") {
      return { title: "Your topic is ready", body: "Your requested reel is in your feed.", route: "/" };
    }
  }
  return null;
}

export function buildPush(event: PushEvent, tokens: string[]): ExpoMessage[] {
  const copy = copyFor(event);
  if (!copy) return [];
  return [...new Set(tokens)].map((to) => ({
    to,
    title: copy.title,
    body: copy.body,
    sound: "default" as const,
    data: { route: copy.route },
  }));
}

export function shouldDeleteToken(receipt: ExpoTicket): boolean {
  return receipt?.details?.error === "DeviceNotRegistered";
}

// Constant-time comparison: always walks the longer input, folds the length difference into the result.
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
