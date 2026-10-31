-- v3 reels are pre-rendered to MP4; the player prefers video_url when present.
alter table public.reels add column if not exists video_url text;
alter table public.reels add column if not exists glossary jsonb;

insert into storage.buckets (id, name, public)
values ('reel-video', 'reel-video', true)
on conflict (id) do nothing;
