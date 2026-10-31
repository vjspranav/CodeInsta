"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Send } from "lucide-react";
import { browserDb } from "@/lib/supabase/browser";
import { Avatar, LoadState, useData } from "./data";
type Message = {
  id: string;
  creator_id: string;
  user_id: string;
  sender: string;
  body_md: string;
  created_at: string;
  read_at: string | null;
};
export function Inbox() {
  const { creators, userId, loading } = useData(),
    params = useSearchParams();
  const [thread, setThread] = useState(params.get("creator") ?? ""),
    [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const { data, error } = await browserDb()
      .from("messages")
      .select("*")
      .order("created_at");
    if (error) setError("Could not load messages. Try again.");
    else {
      setMessages(data ?? []);
      setError("");
    }
  }, []);
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
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, thread]);
  if (loading) return <LoadState />;
  const creator = creators.find((c) => c.id === thread);
  return (
    <main className="content-page inbox-page">
      <header className="row">
        {creator && (
          <button aria-label="Back to threads" onClick={() => setThread("")}>
            <ArrowLeft />
          </button>
        )}
        <h1>{creator?.display_name ?? "Inbox"}</h1>
        {creator && <Avatar creator={creator} />}
      </header>
      {error && (
        <div role="alert">
          <p className="error">{error}</p>
          <button onClick={load}>Retry</button>
        </div>
      )}
      {!creator ? (
        <>
          <p className="muted">Ask a question. Build on what you learned.</p>
          {creators.map((c) => {
            const list = messages.filter((m) => m.creator_id === c.id),
              unread = list.filter(
                (m) => m.sender === "creator" && !m.read_at,
              ).length;
            return (
              <button
                className="thread"
                key={c.id}
                onClick={() => setThread(c.id)}
              >
                <Avatar creator={c} />
                <div>
                  <strong>{c.display_name}</strong>
                  <p>
                    {list.at(-1)?.body_md.slice(0, 80) ??
                      "Start a conversation"}
                  </p>
                </div>
                {unread > 0 && <span className="unread">{unread}</span>}
              </button>
            );
          })}
        </>
      ) : (
        <>
          <div className="messages">
            {messages
              .filter((m) => m.creator_id === thread)
              .map((m) => (
                <div key={m.id} className={`message ${m.sender}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.body_md}
                  </ReactMarkdown>
                  <time dateTime={m.created_at}>
                    {new Date(m.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            {!messages.some((m) => m.creator_id === thread) && (
              <div className="empty">
                What are you working through?
                <br />
                Send {creator.display_name} your first question.
              </div>
            )}
            <div ref={end} />
          </div>
          <form
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
          </form>
        </>
      )}
    </main>
  );
}
