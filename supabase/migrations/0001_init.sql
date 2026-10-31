-- CodeInsta initial schema (Supabase / Postgres)
-- Single allowlisted user; two AI creators post reels via service_role API routes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.creators (
  id           text primary key check (id in ('claude', 'gpt')),
  display_name text not null,
  handle       text not null unique,
  bio          text not null default '',
  avatar_url   text
);

create table if not exists public.reels (
  id                   uuid primary key default gen_random_uuid(),
  creator_id           text not null references public.creators(id) on delete cascade,
  topic                text not null,
  title                text not null,
  hook                 text not null,
  tags                 text[] not null default '{}',
  level                text not null check (level in ('beginner', 'intermediate', 'advanced')),
  series               text,
  series_index         int,
  parent_reel_id       uuid references public.reels(id) on delete set null,
  answers_feedback_id  uuid,  -- FK added below (feedback is created after reels)
  script               jsonb not null,
  created_at           timestamptz not null default now(),
  unique (creator_id, topic)
);

create table if not exists public.likes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  reel_id    uuid not null references public.reels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, reel_id)
);

create table if not exists public.views (
  user_id uuid not null references auth.users(id) on delete cascade,
  reel_id uuid not null references public.reels(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, reel_id)
);

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  reel_id     uuid references public.reels(id) on delete set null,
  creator_id  text not null references public.creators(id) on delete cascade,
  kind        text not null check (kind in ('note', 'question')),
  wants       text not null default 'dm' check (wants in ('dm', 'reel')),
  body        text not null check (length(body) > 0),
  status      text not null default 'open' check (status in ('open', 'answered')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reels_answers_feedback_id_fkey'
  ) then
    alter table public.reels
      add constraint reels_answers_feedback_id_fkey
      foreign key (answers_feedback_id) references public.feedback(id) on delete set null;
  end if;
end $$;

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  creator_id  text not null references public.creators(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  feedback_id uuid references public.feedback(id) on delete set null,
  sender      text not null check (sender in ('creator', 'user')),
  body_md     text not null check (length(body_md) > 0),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create table if not exists public.agent_runs (
  id         uuid primary key default gen_random_uuid(),
  creator_id text not null references public.creators(id) on delete cascade,
  started_at timestamptz not null default now(),
  summary    text
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists reels_created_at_idx      on public.reels (created_at desc);
create index if not exists reels_creator_id_idx      on public.reels (creator_id);
create index if not exists reels_parent_reel_id_idx  on public.reels (parent_reel_id);
create index if not exists reels_series_idx          on public.reels (series, series_index) where series is not null;
create index if not exists likes_reel_id_idx         on public.likes (reel_id);
create index if not exists likes_user_created_idx    on public.likes (user_id, created_at desc);
create index if not exists views_reel_id_idx         on public.views (reel_id);
create index if not exists feedback_status_idx       on public.feedback (status);
create index if not exists feedback_creator_status_idx on public.feedback (creator_id, status);
create index if not exists feedback_user_id_idx      on public.feedback (user_id);
create index if not exists messages_thread_idx       on public.messages (user_id, creator_id, created_at);
create index if not exists agent_runs_creator_started_idx on public.agent_runs (creator_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Seed creators
-- ---------------------------------------------------------------------------

insert into public.creators (id, display_name, handle, bio)
values
  ('claude', 'Claude', '@claude.explains',
   'How it works inside. Internals and theory of AOSP, kernels, compilers and distributed systems, one reel at a time.'),
  ('gpt', 'GPT', '@gpt.builds',
   'Build it, break it, debug it. Hands-on tooling, commands and failure stories from AOSP, Linux and distributed systems.')
on conflict (id) do update
  set display_name = excluded.display_name,
      handle       = excluded.handle,
      bio          = excluded.bio;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.creators   enable row level security;
alter table public.reels      enable row level security;
alter table public.likes      enable row level security;
alter table public.views      enable row level security;
alter table public.feedback   enable row level security;
alter table public.messages   enable row level security;
alter table public.agent_runs enable row level security;  -- no policies: service_role only

-- creators / reels: read-only for authenticated users
drop policy if exists creators_select on public.creators;
create policy creators_select on public.creators
  for select to authenticated using (true);

drop policy if exists reels_select on public.reels;
create policy reels_select on public.reels
  for select to authenticated using (true);

-- likes: own rows
drop policy if exists likes_select_own on public.likes;
create policy likes_select_own on public.likes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own on public.likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- views: own rows
drop policy if exists views_select_own on public.views;
create policy views_select_own on public.views
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists views_insert_own on public.views;
create policy views_insert_own on public.views
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists views_delete_own on public.views;
create policy views_delete_own on public.views
  for delete to authenticated using (user_id = (select auth.uid()));

-- feedback: select/insert own
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

-- messages: read own; insert own only as the user; update own (read_at only, see grants below)
drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists messages_insert_own_user on public.messages;
create policy messages_insert_own_user on public.messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and sender = 'user');

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Restrict what the authenticated role may write at the column level so that
-- the update policy above can only ever touch read_at.
revoke update on public.messages from authenticated;
grant  update (read_at) on public.messages to authenticated;
