"use client";
import { Code2 } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useData } from "./data";
import { orderFeed, withEarlierParts } from "./reel/timeline";

/** Server-rendered cover; children mount underneath so their data can become ready. */
export function Startup({ children, publicPage }: { children: React.ReactNode; publicPage: boolean }) {
  const path = usePathname();
  const data = useData();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (revealed || (!publicPage && data.loading)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => { if (!cancelled) setRevealed(true); };
    const target = path.startsWith("/reel/") ? data.reels.find((reel) => reel.id === path.split("/")[2]) : undefined;
    const first = target ? withEarlierParts(target, data.reels, data.seen)[0]
      : path === "/" ? orderFeed(data.reels, data.seen, data)[0] : undefined;
    if (!publicPage && !data.error && first?.poster_url) {
      const poster = new Image();
      poster.src = first.poster_url;
      // A missing/slow poster must never trap the user behind the startup cover.
      timer = setTimeout(reveal, 2500);
      void poster.decode().catch(() => {}).then(reveal);
    } else reveal();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [data, path, publicPage, revealed]);
  return (
    <>
      <div className={`startup-content${revealed ? " is-ready" : ""}`} inert={!revealed}>{children}</div>
      <div className={`startup-cover${revealed ? " is-ready" : ""}`} aria-hidden={revealed} role="status" aria-label="Loading CodeInsta">
        <div className="startup-logo"><Code2 size={32} /><strong>codeinsta</strong></div>
      </div>
    </>
  );
}
