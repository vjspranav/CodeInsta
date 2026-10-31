-- Narration audio: manifest on reels + public storage bucket.
alter table public.reels add column if not exists audio jsonb;

insert into storage.buckets (id, name, public)
values ('reel-audio', 'reel-audio', true)
on conflict (id) do update set public = true;
