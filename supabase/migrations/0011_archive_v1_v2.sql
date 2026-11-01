-- Hide the original v1/v2 reels once the first v3 videos are live (applied right after they publish,
-- so the feed is never empty). Reversible: set archived_at = null.
-- Archive v1/v2 reels (no video, not lab examples).
update public.reels
set archived_at = now()
where archived_at is null
  and video_url is null
  and topic not like 'lab/%'
  and topic not like 'lab-v3/%';
