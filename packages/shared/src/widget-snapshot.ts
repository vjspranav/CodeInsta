import type { Category, Creator, MobileReel } from "./types";
import { isLabReel } from "./validation";

export type WidgetNewest = { id: string; title: string; creator: string; category: string; deepLink: string };
export type WidgetHeadline = { id: string; title: string; deepLink: string };

/** What the home, lock and cover screen widgets render. The app writes it; widgets never call the network. */
export type WidgetSnapshot = {
  v: 1;
  updatedAt: string;
  streak: number;
  newest: WidgetNewest | null;
  headline: WidgetHeadline | null;
};

const MAX_TITLE = 80;
const HEADLINE_CATEGORIES = ["frontier", "tech-news"];

const categoryOf = (reel: { topic: string }) => (reel.topic ?? "").split("/")[0];
const deepLink = (id: string) => `codeinsta://reel/${id}`;

function truncate(title: string): string {
  const chars = Array.from(title);
  return chars.length <= MAX_TITLE ? title : chars.slice(0, MAX_TITLE - 1).join("") + "…";
}

function isExpired(reel: MobileReel, nowMs: number): boolean {
  if (!reel.expires_at) return false;
  const t = Date.parse(reel.expires_at);
  return Number.isFinite(t) && t <= nowMs;
}

function time(reel: MobileReel): number {
  const t = Date.parse(reel.created_at);
  return Number.isFinite(t) ? t : 0;
}

export function buildSnapshot(
  reels: MobileReel[],
  creators: Creator[],
  categories: Category[],
  streak: number,
  now: Date,
): WidgetSnapshot {
  const nowMs = now.getTime();
  // Newest first; the sort is stable, so equal timestamps keep input order.
  const live = reels.filter((r) => !isLabReel(r) && !isExpired(r, nowMs)).sort((a, b) => time(b) - time(a));

  const n = live[0];
  const h = live.find((r) => HEADLINE_CATEGORIES.includes(categoryOf(r)));

  const newest = n
    ? {
        id: n.id,
        title: truncate(n.title),
        creator: creators.find((c) => c.id === n.creator_id)?.display_name ?? "",
        category: categories.find((c) => c.slug === categoryOf(n))?.label ?? categoryOf(n),
        deepLink: deepLink(n.id),
      }
    : null;
  const headline = h ? { id: h.id, title: truncate(h.title), deepLink: deepLink(h.id) } : null;

  return {
    v: 1,
    updatedAt: now.toISOString(),
    streak: Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0,
    newest,
    headline,
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string";

/** Never throws: null, bad JSON, wrong version or wrong shape all give null (the widget shows its empty state). */
export function parseSnapshot(raw: string | null): WidgetSnapshot | null {
  if (!isStr(raw)) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data) || data.v !== 1) return null;
  if (!isStr(data.updatedAt) || typeof data.streak !== "number" || !Number.isFinite(data.streak)) return null;

  let newest: WidgetNewest | null = null;
  if (data.newest !== null && data.newest !== undefined) {
    const n = data.newest;
    if (!isObj(n) || !isStr(n.id) || !isStr(n.title) || !isStr(n.creator) || !isStr(n.category) || !isStr(n.deepLink)) {
      return null;
    }
    newest = { id: n.id, title: n.title, creator: n.creator, category: n.category, deepLink: n.deepLink };
  }

  let headline: WidgetHeadline | null = null;
  if (data.headline !== null && data.headline !== undefined) {
    const h = data.headline;
    if (!isObj(h) || !isStr(h.id) || !isStr(h.title) || !isStr(h.deepLink)) return null;
    headline = { id: h.id, title: h.title, deepLink: h.deepLink };
  }

  return { v: 1, updatedAt: data.updatedAt, streak: data.streak, newest, headline };
}
