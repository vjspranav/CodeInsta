-- 0013: mobile push. Expo push tokens per member device, plus triggers that ping the `push` edge function.
-- NOT applied automatically (owner approval). Needs two Vault secrets after applying (see bottom).
--
-- Privacy: the trigger payloads carry ids and statuses only. Message and request text never leave the
-- database through this path (Expo's servers relay push content).

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------------
-- Tokens
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  user_id    uuid not null references auth.users (id) on delete cascade,
  token      text not null check (char_length(token) between 10 and 300),
  platform   text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

create index if not exists push_tokens_token_idx on public.push_tokens (token);

alter table public.push_tokens enable row level security;

revoke all on public.push_tokens from anon;
grant select, insert, update, delete on public.push_tokens to authenticated;

drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_member());

drop policy if exists push_tokens_insert_own on public.push_tokens;
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member());

drop policy if exists push_tokens_update_own on public.push_tokens;
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member())
  with check (user_id = (select auth.uid()) and public.is_member());

drop policy if exists push_tokens_delete_own on public.push_tokens;
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_member());

-- Keep updated_at fresh on upsert (mirrors user_interests_touch in 0004).
create or replace function public.push_tokens_touch() returns trigger
  language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists push_tokens_touch on public.push_tokens;
create trigger push_tokens_touch before update on public.push_tokens
  for each row execute function public.push_tokens_touch();

-- ---------------------------------------------------------------------------
-- Notification triggers
-- ---------------------------------------------------------------------------

-- Posts an id-and-status-only payload to the push edge function. Configuration lives in Vault:
--   push_url    full function URL, e.g. https://<ref>.functions.supabase.co/push
--   push_secret shared secret, sent as x-push-secret (same value as the function's PUSH_SECRET)
-- When either secret is missing this is a silent no-op. A push failure must never block the
-- insert or update that fired the trigger.
create or replace function public.push_notify(payload jsonb) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  url text;
  secret text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'push_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret' limit 1;
  if url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := url,
    body := payload,
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
    timeout_milliseconds := 5000
  );
exception when others then
  return;
end;
$$;
revoke all on function public.push_notify(jsonb) from public, anon, authenticated;

create or replace function public.notify_creator_message() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.push_notify(jsonb_build_object(
    'kind', 'creator_message',
    'user_id', new.user_id,
    'creator_id', new.creator_id
  ));
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.notify_creator_message() from public, anon, authenticated;

drop trigger if exists notify_creator_message on public.messages;
create trigger notify_creator_message after insert on public.messages
  for each row when (new.sender = 'creator')
  execute function public.notify_creator_message();

create or replace function public.notify_request_status() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.push_notify(jsonb_build_object(
    'kind', 'request_status',
    'user_id', new.user_id,
    'status', new.status
  ));
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.notify_request_status() from public, anon, authenticated;

drop trigger if exists notify_request_status on public.topic_requests;
create trigger notify_request_status after update of status on public.topic_requests
  for each row when (new.status in ('approved', 'done') and new.status is distinct from old.status)
  execute function public.notify_request_status();

-- After applying (PROD, once):
--   select vault.create_secret('<same hex as PUSH_SECRET>', 'push_secret');
--   select vault.create_secret('https://<project-ref>.functions.supabase.co/push', 'push_url');
