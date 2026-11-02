"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Send } from "lucide-react";
import { browserDb } from "@/lib/supabase/browser";
import { AskStatus } from "@/app/inbox/ask-status";
import { ASKS_PER_CREATOR, fetchAsks, threadTimeline, waitingPreview, type Ask, type AsksDb } from "@/app/inbox/asks";
import styles from "@/app/inbox/inbox.module.css";
import { CreatorAvatar } from "./creator-avatar";
import { LoadState, useData } from "./data";
type Message = {
  id: string;
  creator_id: string;
  user_id: string;
  sender: string;
  body_md: string;
  created_at: string;
  read_at: string | null;
  feedback_id?: string | null;
};
export function Inbox() {
  const { creators, userId, loading, isOwner } = useData(),
    params = useSearchParams();
  const [thread, setThread] = useState(params.get("creator") ?? ""),
    [focus, setFocus] = useState(params.get("message") ?? ""),
    [messages, setMessages] = useState<Message[]>([]),
    [asks, setAsks] = useState<Ask[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const db = browserDb();
    const [res, asked] = await Promise.all([
      db.from("messages").select("*").order("created_at"),
      fetchAsks(db as unknown as AsksDb, userId).then(
        (rows) => ({ rows, failed: false }),
        () => ({ rows: null, failed: true }),
      ),
    ]);
    if (asked.rows) setAsks(asked.rows);
    if (res.error) setError("Could not load messages. Try again.");
    else if (asked.failed) {
      setMessages(res.data ?? []);
      setError("Could not load your questions. Try again.");
    } else {
      setMessages(res.data ?? []);
      setError("");
    }
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [userId, load]);
  useEffect(() => {
    const ids = messages
      .filter(
        (m) => m.creator_id === thread && m.sender === "creator" && !m.read_at,
      )
      .map((m) => m.id);
    if (!ids.length) return;
    let cancelled = false;
    void (async () => {
      const read_at = new Date().toISOString();
      const { error } = await browserDb()
        .from("messages")
        .update({ read_at })
        .in("id", ids);
      if (!cancelled && !error)
        setMessages((old) =>
          old.map((m) => (ids.includes(m.id) ? { ...m, read_at } : m)),
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, thread]);
  const items = useMemo(() => threadTimeline(messages, asks, thread), [messages, asks, thread]);
  useEffect(() => {
    // "Read answer" opens the thread at that DM; otherwise follow the newest message.
    const target = focus ? document.getElementById(`m-${focus}`) : null;
    if (target) target.scrollIntoView({ block: "center" });
    else if (!focus) end.current?.scrollIntoView({ block: "end" });
  }, [items.length, thread, focus]);
  const open = (creatorId: string, message = "") => {
    setFocus(message);
    setThread(creatorId);
  };
  if (loading) return <LoadState />;
  const creator = creators.find((c) => c.id === thread);
  return (
    <main className="content-page inbox-page">
      <header className="row">
        {creator && (
          <button aria-label="Back to threads" onClick={() => open("")}>
            <ArrowLeft />
          </button>
        )}
        <h1>{creator?.display_name ?? "Inbox"}</h1>
        {creator && <CreatorAvatar creatorId={creator.id} />}
      </header>
      {error && (
        <div role="alert">
          <p className="error">{error}</p>
          <button onClick={load}>Retry</button>
        </div>
      )}
      {!creator ? (
        <div className="messages">
          <p className="muted">
            {isOwner
              ? "Ask a question. Build on what you learned."
              : "Answers to your questions show up here. Tap Ask on any reel."}
          </p>
          {creators.map((c) => {
            const list = messages.filter((m) => m.creator_id === c.id),
              unread = list.filter(
                (m) => m.sender === "creator" && !m.read_at,
              ).length,
              mine = asks.filter((a) => a.creatorId === c.id),
              waiting = mine.filter((a) => a.status === "waiting").length;
            return (
              <Fragment key={c.id}>
                <button className="thread" onClick={() => open(c.id)}>
                  <CreatorAvatar creatorId={c.id} />
                  <div>
                    <strong>{c.display_name}</strong>
                    <p>
                      {list.at(-1)?.body_md.slice(0, 80) ??
                        (waiting
                          ? waitingPreview(waiting, c.display_name)
                          : isOwner
                            ? "Start a conversation"
                            : "No answers yet")}
                    </p>
                  </div>
                  {unread > 0 && <span className="unread">{unread}</span>}
                </button>
                {mine.length > 0 && (
                  <ul className={styles.asks} aria-label={`Your questions to ${c.display_name}`}>
                    {mine.slice(0, ASKS_PER_CREATOR).map((ask) => (
                      <li key={ask.id}>
                        <AskStatus
                          ask={ask}
                          creatorName={c.display_name}
                          onOpenAnswer={(a) => open(a.creatorId, a.answerMessageId ?? "")}
                          compact
                        />
                      </li>
                    ))}
                    {mine.length > ASKS_PER_CREATOR && (
                      <li>
                        <button type="button" className={styles.more} onClick={() => open(c.id)}>
                          See all {mine.length} questions
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </Fragment>
            );
          })}
        </div>
      ) : (
        <>
          <div className="messages">
            {items.map((item) =>
              item.kind === "ask" ? (
                <div key={item.key} className={styles.threadAsk}>
                  <AskStatus ask={item.ask} creatorName={creator.display_name} />
                </div>
              ) : (
                <div
                  key={item.key}
                  id={`m-${item.message.id}`}
                  className={`message ${item.message.sender}${item.message.id === focus ? ` ${styles.focus}` : ""}`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {item.message.body_md}
                  </ReactMarkdown>
                  <time dateTime={item.message.created_at}>
                    {new Date(item.message.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ),
            )}
            {!items.length && (
              <div className="empty">
                {isOwner ? (
                  <>
                    What are you working through?
                    <br />
                    Send {creator.display_name} your first question.
                  </>
                ) : (
                  <>
                    No answers from {creator.display_name} yet.
                    <br />
                    Tap Ask on a reel; answers usually arrive within the hour.
                  </>
                )}
              </div>
            )}
            <div ref={end} />
          </div>
          {isOwner && <form
            className="reply"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              setBusy(true);
              const { error } = await browserDb()
                .from("messages")
                .insert({
                  user_id: userId,
                  creator_id: thread,
                  sender: "user",
                  body_md: draft.trim(),
                });
              setBusy(false);
              if (error) setError("Message was not sent. Try again.");
              else {
                setDraft("");
                setFocus("");
                await load();
              }
            }}
          >
            <textarea
              aria-label="Your reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              required
              maxLength={10000}
              placeholder={`Message ${creator.display_name}…`}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send reply"
            >
              <Send size={22} />
            </button>
          </form>}
        </>
      )}
    </main>
  );
}
