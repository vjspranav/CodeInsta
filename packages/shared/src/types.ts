export type Category = { slug: string; label: string; description: string };

export type Creator = {
  id: string;
  display_name: string;
  handle: string;
  bio: string;
  avatar_url: string | null;
};

export type GlossaryEntry = { term: string; full: string; note?: string };

/**
 * Reel row as the mobile apps select it. `reels` has no `expires_at` column, so it is selected
 * as `script->>expires_at` (aliased to `expires_at`) and is null for evergreen reels.
 */
export type MobileReel = {
  id: string;
  creator_id: string;
  title: string;
  topic: string;
  tags: string[];
  series: string | null;
  series_index: number | null;
  created_at: string;
  video_url: string;
  poster_url: string | null;
  glossary: GlossaryEntry[] | null;
  parent_reel_id: string | null;
  genre: string | null;
  style: string | null;
  expires_at: string | null;
};
