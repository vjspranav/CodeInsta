-- Multi-user access: invite-only members; questions/notes/DMs stay owner-only.
-- Owner rows are created server-side (service role) for emails in ALLOWED_EMAILS.

create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  invite_code text,
  joined_at timestamptz not null default now()
);

create table if not exists public.invites (
  code text primary key,
  note text,
  max_uses int not null default 1 check (max_uses > 0),
  uses int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.members enable row level security;
alter table public.invites enable row level security;

create or replace function public.is_member() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid() and role = 'owner');
$$;

-- Atomically redeem an invite for the current user. Returns true on success.
create or replace function public.redeem_invite(invite text) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text;
begin
  if uid is null then return false; end if;
  if exists (select 1 from public.members where user_id = uid) then return true; end if;
  update public.invites set uses = uses + 1
    where code = invite and uses < max_uses and (expires_at is null or expires_at > now());
  if not found then return false; end if;
  select email into mail from auth.users where id = uid;
  insert into public.members (user_id, email, role, invite_code) values (uid, coalesce(mail, ''), 'member', invite);
  return true;
end;
$$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

create policy members_select_self on public.members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_owner());
create policy invites_owner_all on public.invites
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Content is visible to members only.
drop policy if exists creators_select on public.creators;
create policy creators_select on public.creators
  for select to authenticated using (public.is_member());
drop policy if exists reels_select on public.reels;
create policy reels_select on public.reels
  for select to authenticated using (public.is_member());

-- Likes/views: own rows, members only.
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member());
drop policy if exists views_insert_own on public.views;
create policy views_insert_own on public.views
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_member());

-- Notes/questions and DMs are owner-only (keeps untrusted text away from the agents).
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_owner());
drop policy if exists messages_insert_own_user on public.messages;
create policy messages_insert_own_user on public.messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and sender = 'user' and public.is_owner());
