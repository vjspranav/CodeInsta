-- Per-user interests and topic requests.
-- Member-written request text only reaches the agents after an owner approves it.

create table if not exists public.user_interests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  areas text[] not null default '{}'
    check (areas <@ array['aosp','os','compilers','distributed','networking','databases','linkers','virtualization','architecture']::text[]),
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.topic_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 3 and 200),
  area text check (area is null or area in ('aosp','os','compilers','distributed','networking','databases','linkers','virtualization','architecture')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'done')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  fulfilled_reel_id uuid references public.reels (id) on delete set null
);

create index if not exists topic_requests_user_idx on public.topic_requests (user_id, status);
create index if not exists topic_requests_status_idx on public.topic_requests (status, created_at);

alter table public.user_interests enable row level security;
alter table public.topic_requests enable row level security;

-- Keep updated_at fresh.
create or replace function public.user_interests_touch() returns trigger
  language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists user_interests_touch on public.user_interests;
create trigger user_interests_touch before update on public.user_interests
  for each row execute function public.user_interests_touch();

-- Insert guard: owners auto-approve, others start pending (max 5 pending per user).
-- Non-service inserts cannot choose status/decided_at/fulfilled_reel_id/user_id.
-- Service-role inserts (auth.uid() is null) keep the supplied user_id.
create or replace function public.topic_requests_before_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null then
    new.user_id := uid;
  end if;
  if new.user_id is null then
    raise exception 'user_id required';
  end if;
  new.decided_at := null;
  new.fulfilled_reel_id := null;
  if exists (select 1 from public.members where user_id = new.user_id and role = 'owner') then
    new.status := 'approved';
  else
    new.status := 'pending';
    if (select count(*) from public.topic_requests where user_id = new.user_id and status = 'pending') >= 5 then
      raise exception 'too many pending topic requests (max 5)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists topic_requests_before_insert on public.topic_requests;
create trigger topic_requests_before_insert before insert on public.topic_requests
  for each row execute function public.topic_requests_before_insert();

-- user_interests: members manage their own row.
create policy user_interests_select_own on public.user_interests
  for select to authenticated using (user_id = (select auth.uid()) and public.is_member());
create policy user_interests_insert_own on public.user_interests
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member());
create policy user_interests_update_own on public.user_interests
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member())
  with check (user_id = (select auth.uid()) and public.is_member());

-- topic_requests: members insert/select their own; the owner selects all and is the only one who can update.
create policy topic_requests_select on public.topic_requests
  for select to authenticated
  using (public.is_owner() or (user_id = (select auth.uid()) and public.is_member()));
create policy topic_requests_insert_own on public.topic_requests
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member());
create policy topic_requests_update_owner on public.topic_requests
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
