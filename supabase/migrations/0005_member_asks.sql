-- Members can ask: 3 questions per rolling 24h (owner unlimited), answers arrive as DMs.
-- Member-written text still reaches the agents only through the isolated writer.

-- Any member may insert their own feedback (the trigger below enforces the daily cap).
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member());

-- Insert guard. Non-service inserts cannot choose status/answered_at/created_at.
-- Service-role inserts (auth.uid() is null) are left untouched.
create or replace function public.feedback_before_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null then
    new.user_id := uid;
    new.status := 'open';
    new.answered_at := null;
    new.created_at := now();
  end if;
  if new.user_id is null then
    raise exception 'user_id required';
  end if;
  if not exists (select 1 from public.members where user_id = new.user_id and role = 'owner') then
    -- Serialize concurrent inserts from the same user so the cap cannot be raced.
    perform pg_advisory_xact_lock(hashtext('feedback:' || new.user_id::text));
    if (select count(*) from public.feedback
        where user_id = new.user_id and created_at > now() - interval '24 hours') >= 3 then
      raise exception 'Daily question limit reached (3 per 24 hours). Try again later.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists feedback_before_insert on public.feedback;
create trigger feedback_before_insert before insert on public.feedback
  for each row execute function public.feedback_before_insert();

-- Members read their own messages (creator answers). Inserting messages stays owner-only
-- (messages_insert_own_user from 0003 is intentionally unchanged).
drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_member());
