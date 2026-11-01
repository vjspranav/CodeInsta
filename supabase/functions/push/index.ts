// Supabase edge function `push`: called by database triggers (pg_net) with ids and statuses only.
// Deployed with --no-verify-jwt; the x-push-secret header is the only credential.
// Never logs or forwards message text. Logs counts only.
import {
  EXPO_PUSH_URL,
  buildPush,
  chunk,
  isExpoToken,
  safeEqual,
  shouldDeleteToken,
  type ExpoTicket,
  type PushEvent,
} from "./message.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREATOR_ID = /^[a-z0-9-]{1,40}$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function parseEvent(raw: unknown): PushEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.user_id !== "string" || !UUID.test(r.user_id)) return null;
  if (r.kind === "creator_message") {
    if (typeof r.creator_id !== "string" || !CREATOR_ID.test(r.creator_id)) return null;
    return { kind: "creator_message", user_id: r.user_id, creator_id: r.creator_id };
  }
  if (r.kind === "request_status") {
    if (r.status !== "approved" && r.status !== "done") return null;
    return { kind: "request_status", user_id: r.user_id, status: r.status };
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const expected = Deno.env.get("PUSH_SECRET") ?? "";
  const given = req.headers.get("x-push-secret") ?? "";
  // Fail closed when the secret is not configured.
  if (!expected || !safeEqual(given, expected)) return json(401, { error: "unauthorized" });

  let event: PushEvent | null;
  try {
    event = parseEvent(await req.json());
  } catch {
    event = null;
  }
  if (!event) return json(400, { error: "bad event" });

  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return json(500, { error: "not configured" });
  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${base}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    });

  const tokRes = await rest(`push_tokens?select=token&user_id=eq.${event.user_id}`);
  if (!tokRes.ok) return json(502, { error: "token lookup failed" });
  const rows = (await tokRes.json()) as { token: string }[];
  const tokens = rows.map((r) => r.token).filter(isExpoToken);
  if (tokens.length === 0) return json(200, { sent: 0, removed: 0 });

  if (event.kind === "creator_message") {
    const res = await rest(`creators?select=display_name&id=eq.${encodeURIComponent(event.creator_id)}`);
    if (res.ok) {
      const c = (await res.json()) as { display_name?: string }[];
      if (c[0]?.display_name) event = { ...event, creator_name: c[0].display_name };
    }
  }

  const messages = buildPush(event, tokens);
  const dead: string[] = [];
  let sent = 0;
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");

  for (const batch of chunk(messages)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(expoToken ? { authorization: `Bearer ${expoToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as { data?: ExpoTicket[] };
      (payload.data ?? []).forEach((ticket, i) => {
        if (ticket?.status === "ok") sent++;
        if (shouldDeleteToken(ticket) && batch[i]) dead.push(batch[i].to);
      });
    } catch {
      // Network failure for one chunk must not block the rest.
    }
  }

  if (dead.length > 0) {
    for (const group of chunk(dead)) {
      const list = group.map((t) => `"${t}"`).join(",");
      await rest(`push_tokens?token=in.(${encodeURIComponent(list)})`, { method: "DELETE" });
    }
  }

  console.log(JSON.stringify({ kind: event.kind, sent, removed: dead.length }));
  return json(200, { sent, removed: dead.length });
});
