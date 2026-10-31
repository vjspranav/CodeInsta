"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { TOPIC_AREAS } from "@/lib/reel-schema";
import { Avatar, LoadState, useData, type ReelRow } from "./data";
import { signOut } from "@/app/login/actions";
export function ReelGrid({ reels }: { reels: ReelRow[] }) {
  return (
    <div className="reel-grid">
      {reels.map((reel, i) => (
        <Link
          href={`/reel/${reel.id}`}
          key={reel.id}
          className={`reel-tile tile-${i % 6}`}
        >
          <span>
            {reel.series_index ? `Part ${reel.series_index}` : reel.creator_id}
          </span>
          <h3>{reel.title}</h3>
          <ArrowUpRight size={18} />
        </Link>
      ))}
    </div>
  );
}
export function Explore() {
  const { reels, loading, error } = useData(),
    [area, setArea] = useState<string>("aosp"),
    [series, setSeries] = useState("");
  const filtered = reels.filter((r) => r.topic.split("/")[0] === area),
    groups = Array.from(new Set(filtered.map((r) => r.series ?? "Standalone")));
  return (
    <main className="content-page">
      <header>
        <p className="muted">Follow your curiosity</p>
        <h1>Explore</h1>
      </header>
      <div className="topic-tabs" aria-label="Topic areas">
        {TOPIC_AREAS.map((topic) => (
          <button
            key={topic}
            aria-pressed={topic === area}
            onClick={() => {
              setArea(topic);
              setSeries("");
            }}
          >
            {topic === "aosp"
              ? "AOSP"
              : topic === "os"
                ? "Operating systems"
                : topic}
          </button>
        ))}
      </div>
      {loading || error ? (
        <LoadState />
      ) : (
        <>
          <h2>
            {area === "aosp"
              ? "Inside Android"
              : area.charAt(0).toUpperCase() + area.slice(1)}
          </h2>
          <p className="muted">
            {filtered.length} reels. Pick a series and go deeper.
          </p>
          <div className="series-list">
            {groups.map((group) => (
              <button
                key={group}
                aria-pressed={series === group}
                onClick={() => setSeries(series === group ? "" : group)}
              >
                <span>{group.replaceAll("-", " ")}</span>
                <span>
                  {
                    filtered.filter((r) => (r.series ?? "Standalone") === group)
                      .length
                  }{" "}
                  reels →
                </span>
              </button>
            ))}
          </div>
          <ReelGrid
            reels={filtered
              .filter((r) => !series || (r.series ?? "Standalone") === series)
              .sort((a, b) => (a.series_index ?? 0) - (b.series_index ?? 0))}
          />
          {!filtered.length && (
            <p className="empty">New lessons in this area are on their way.</p>
          )}
        </>
      )}
    </main>
  );
}
export function Profiles({ creatorId }: { creatorId?: string }) {
  const { creators, reels, loading, error } = useData();
  if (loading || error) return <LoadState />;
  if (!creatorId)
    return (
      <main className="content-page">
        <header>
          <p className="muted">Two perspectives. A deeper understanding.</p>
          <h1>Your creators</h1>
        </header>
        {creators.map((c) => (
          <Link className="profile-card" key={c.id} href={`/c/${c.id}`}>
            <Avatar creator={c} />
            <div>
              <h2>{c.display_name}</h2>
              <p>{c.handle}</p>
              <p className="muted">{c.bio}</p>
            </div>
            <ArrowUpRight />
          </Link>
        ))}
        <form action={signOut}>
          <button className="signout">Sign out</button>
        </form>
      </main>
    );
  const creator = creators.find((c) => c.id === creatorId);
  if (!creator) return <div className="empty">Creator not found.</div>;
  const owned = reels.filter((r) => r.creator_id === creatorId);
  return (
    <main className="content-page">
      <header className="profile-header">
        <Avatar creator={creator} />
        <h1>{creator.display_name}</h1>
        <p>{creator.handle}</p>
        <p className="muted">{creator.bio}</p>
        <strong>{owned.length} reels</strong>
        <Link className="primary" href={`/inbox?creator=${creator.id}`}>
          Message {creator.display_name}
        </Link>
      </header>
      <ReelGrid reels={owned} />
    </main>
  );
}
