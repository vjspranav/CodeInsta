"use client";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, ClipboardCheck, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { LoadState, useData, type ReelRow } from "./data";
import { CreatorAvatar } from "./creator-avatar";
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
  const { reels, loading, error, categories } = useData(),
    [area, setArea] = useState<string>(""),
    [series, setSeries] = useState("");
  const selected = categories.find((c) => c.slug === area) ?? categories[0];
  const filtered = reels.filter((r) => r.topic.split("/")[0] === selected?.slug),
    groups = Array.from(new Set(filtered.map((r) => r.series ?? "Standalone")));
  return (
    <main className="content-page">
      <header>
        <p className="muted">Follow your curiosity</p>
        <h1>Explore</h1>
      </header>
      <div className="topic-tabs" aria-label="Topic areas">
        {categories.map((category) => (
          <button
            key={category.slug}
            aria-pressed={category.slug === selected?.slug}
            onClick={() => {
              setArea(category.slug);
              setSeries("");
            }}
          >
            {category.label}
          </button>
        ))}
      </div>
      {loading || error ? (
        <LoadState />
      ) : (
        <>
          <h2>
            {selected?.label ?? "Categories"}
          </h2>
          <p className="muted">{selected?.description}</p>
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
  const { creators, reels, loading, error, isOwner } = useData();
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
            <CreatorAvatar creatorId={c.id} />
            <div>
              <h2>{c.display_name}</h2>
              <p>{c.handle}</p>
              <p className="muted">{c.bio}</p>
            </div>
            <ArrowUpRight />
          </Link>
        ))}
        <nav className="settings-list" aria-label="Your settings">
          <Link href="/interests">
            <SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden />
            <span>My interests</span>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
          </Link>
          {isOwner && (
            <Link href="/admin/requests">
              <ClipboardCheck size={20} strokeWidth={1.75} aria-hidden />
              <span>Review topic requests</span>
              <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
            </Link>
          )}
        </nav>
        {isOwner && <Link className="primary" href="/invites">Invite friends</Link>}
        {isOwner && <Link className="primary lab-link" href="/lab">Format Lab</Link>}
        <p className="profile-links"><Link href="/privacy">Privacy</Link><Link href="/about">About</Link></p>
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
        <CreatorAvatar creatorId={creator.id} />
        <h1>{creator.display_name}</h1>
        <p>{creator.handle}</p>
        <p className="muted">{creator.bio}</p>
        <strong>{owned.length} reels</strong>
        {isOwner && <Link className="primary" href={`/inbox?creator=${creator.id}`}>
          Message {creator.display_name}
        </Link>}
      </header>
      <ReelGrid reels={owned} />
    </main>
  );
}
