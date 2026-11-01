import { describe, expect, it } from "vitest";
import { sendReply, type ReplyDb, type ReplyQuery } from "./agent-reply";

type Row = Record<string, string | null>;
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

/** In-memory stand-in for Supabase. rpc() mirrors agent_send_reply in 0009 (atomic, creator-scoped). */
function fakeDb() {
  const t: Record<string, Row[]> = {
    feedback: [
      { id: "fb-u1-claude", user_id: U1, creator_id: "claude", status: "open" },
      { id: "fb-u2-claude", user_id: U2, creator_id: "claude", status: "open" },
      { id: "fb-u2-gpt", user_id: U2, creator_id: "gpt", status: "open" },
    ],
    messages: [
      { id: "m-u1-claude", user_id: U1, creator_id: "claude", sender: "user", read_at: null },
      { id: "m-u2-claude", user_id: U2, creator_id: "claude", sender: "user", read_at: null },
      { id: "m-u2-gpt", user_id: U2, creator_id: "gpt", sender: "user", read_at: null },
    ],
  };
  let n = 0;
  const err = (code: string, message: string) => ({ data: null, error: { code, message } });
  const db: ReplyDb = {
    from(table) {
      return {
        select() {
          const filters: [string, string][] = [];
          const q: ReplyQuery = {
            eq(c: string, v: string) {
              filters.push([c, v]);
              return q;
            },
            maybeSingle: async () => ({
              data: t[table].find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
              error: null,
            }),
          };
          return q;
        },
      };
    },
    async rpc(_fn, a) {
      const creator = a.p_creator as string;
      let user: string | null = null;
      let fid: string | null = null;
      const fb = a.p_feedback_id ? t.feedback.find((r) => r.id === a.p_feedback_id && r.creator_id === creator) : undefined;
      if (a.p_feedback_id) {
        if (!fb) return err("P0002", "feedback not found for this creator");
        if (fb.status === "answered") return err("P0001", "feedback already answered");
        user = fb.user_id;
        fid = fb.id;
      }
      const orig = a.p_reply_to_message_id
        ? t.messages.find((r) => r.id === a.p_reply_to_message_id && r.creator_id === creator && r.sender === "user")
        : undefined;
      if (a.p_reply_to_message_id) {
        if (!orig) return err("P0002", "message not found for this creator");
        if (t.messages.some((r) => r.reply_to_message_id === orig.id && r.sender === "creator")) return err("P0001", "message already answered");
        if (user && user !== orig.user_id) return err("22023", "different users");
        user = orig.user_id;
      }
      const id = `new-${++n}`;
      t.messages.push({ id, creator_id: creator, user_id: user, feedback_id: fid, sender: "creator", body_md: a.p_body as string, reply_to_message_id: (a.p_reply_to_message_id as string | null) ?? null });
      if (fb) fb.status = "answered";
      if (orig) orig.read_at = "now";
      return { data: id, error: null };
    },
  };
  return { db, t };
}

const sent = (t: Record<string, Row[]>) => t.messages.filter((m) => m.sender === "creator");

describe("sendReply", () => {
  it("rejects a reply with no target (no most-recent-user fallback)", async () => {
    const { db, t } = fakeDb();
    const r = await sendReply(db, "claude", { body_md: "hi" });
    expect(r.status).toBe(400);
    expect(sent(t)).toHaveLength(0);
  });

  it("derives the recipient from the feedback row, not from other activity", async () => {
    const { db, t } = fakeDb();
    // user 1 is "most recently active", but the answer must go to user 2's question.
    const r = await sendReply(db, "claude", { body_md: "answer", feedback_id: "fb-u2-claude" });
    expect(r.status).toBe(201);
    expect(sent(t)[0].user_id).toBe(U2);
    expect(t.feedback.find((f) => f.id === "fb-u2-claude")?.status).toBe("answered");
    expect(t.feedback.find((f) => f.id === "fb-u1-claude")?.status).toBe("open");
  });

  it("derives the recipient from the original DM and marks it read", async () => {
    const { db, t } = fakeDb();
    const r = await sendReply(db, "claude", { body_md: "answer", reply_to_message_id: "m-u1-claude" });
    expect(r.status).toBe(201);
    expect(sent(t)[0]).toMatchObject({ user_id: U1, reply_to_message_id: "m-u1-claude" });
    expect(t.messages.find((m) => m.id === "m-u1-claude")?.read_at).not.toBeNull();
    expect(t.messages.find((m) => m.id === "m-u2-claude")?.read_at).toBeNull();
  });

  it("404s on another creator's feedback or message", async () => {
    const { db, t } = fakeDb();
    expect((await sendReply(db, "claude", { body_md: "x", feedback_id: "fb-u2-gpt" })).status).toBe(404);
    expect((await sendReply(db, "claude", { body_md: "x", reply_to_message_id: "m-u2-gpt" })).status).toBe(404);
    expect((await sendReply(db, "gpt", { body_md: "x", feedback_id: "fb-u1-claude" })).status).toBe(404);
    expect(sent(t)).toHaveLength(0);
    expect(t.feedback.every((f) => f.status === "open")).toBe(true);
  });

  it("404s on unknown ids", async () => {
    const { db } = fakeDb();
    expect((await sendReply(db, "claude", { body_md: "x", feedback_id: "nope" })).status).toBe(404);
  });

  it("rejects a target pair that belongs to two different users", async () => {
    const { db, t } = fakeDb();
    const r = await sendReply(db, "claude", { body_md: "x", feedback_id: "fb-u1-claude", reply_to_message_id: "m-u2-claude" });
    expect(r.status).toBe(400);
    expect(sent(t)).toHaveLength(0);
  });

  it("answers each target once, even when two sends race", async () => {
    const { db, t } = fakeDb();
    const [a, b] = await Promise.all([
      sendReply(db, "claude", { body_md: "one", feedback_id: "fb-u1-claude" }),
      sendReply(db, "claude", { body_md: "two", feedback_id: "fb-u1-claude" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(sent(t)).toHaveLength(1);
    const c = await sendReply(db, "claude", { body_md: "x", reply_to_message_id: "m-u1-claude" });
    const d = await sendReply(db, "claude", { body_md: "y", reply_to_message_id: "m-u1-claude" });
    expect([c.status, d.status]).toEqual([201, 409]);
  });

  it("reports a missing RPC (migration not applied) as 503", async () => {
    const { db } = fakeDb();
    db.rpc = async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.agent_send_reply" } });
    expect((await sendReply(db, "claude", { body_md: "x", feedback_id: "fb-u1-claude" })).status).toBe(503);
  });
});
