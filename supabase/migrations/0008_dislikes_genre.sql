-- Dislikes ("not for me") plus genre/style on reels. Private per member, toggleable.

alter table public.reels
  add column if not exists genre text,
  add column if not exists style text;

-- Backfill from the script jsonb (only where the script declares them).
update public.reels
   set genre = coalesce(genre, script->>'genre'),
       style = coalesce(style, script->>'style')
 where (genre is null and script ? 'genre') or (style is null and script ? 'style');

create table if not exists public.dislikes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  reel_id    uuid not null references public.reels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, reel_id)
);

create index if not exists dislikes_reel_id_idx on public.dislikes (reel_id);
create index if not exists dislikes_user_created_idx on public.dislikes (user_id, created_at desc);

alter table public.dislikes enable row level security;

drop policy if exists dislikes_select_own on public.dislikes;
create policy dislikes_select_own on public.dislikes
  for select to authenticated using (user_id = (select auth.uid()) and public.is_member());

drop policy if exists dislikes_insert_own on public.dislikes;
create policy dislikes_insert_own on public.dislikes
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member());

drop policy if exists dislikes_delete_own on public.dislikes;
create policy dislikes_delete_own on public.dislikes
  for delete to authenticated using (user_id = (select auth.uid()) and public.is_member());
