import type { SupabaseClient } from "@supabase/supabase-js";

/** Bucket created by migration 0006 (public read). */
export const VIDEO_BUCKET = "reel-video";

const VIDEO_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/;
const POSTER_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Public URL prefix for a creator's folder in the bucket, e.g. https://x.supabase.co/storage/v1/object/public/reel-video/claude/ */
export function creatorUrlPrefix(db: SupabaseClient, creator: string): string {
  const probe = db.storage.from(VIDEO_BUCKET).getPublicUrl(`${creator}/x`).data.publicUrl;
  return probe.slice(0, -1);
}

/** True when `url` is exactly `<prefix><uuid>.mp4` for this creator (no query, no extra path). */
export function isOwnVideoUrl(db: SupabaseClient, creator: string, url: string): boolean {
  const prefix = creatorUrlPrefix(db, creator);
  return url.startsWith(prefix) && VIDEO_NAME.test(url.slice(prefix.length));
}

export function isOwnPosterUrl(db: SupabaseClient, creator: string, url: string): boolean {
  const prefix = creatorUrlPrefix(db, creator);
  return url.startsWith(prefix) && POSTER_NAME.test(url.slice(prefix.length));
}

/** Object path inside the bucket for one of our public URLs. */
export function objectPathOf(db: SupabaseClient, creator: string, url: string): string {
  return `${creator}/${url.slice(creatorUrlPrefix(db, creator).length)}`;
}

export const POSTER_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
