-- 0009: safe creator replies + per-user lock on pending topic requests.
-- NOT applied automatically. Needed by /api/agent/messages (it calls agent_send_reply).

-- 1. Reply targets ---------------------------------------------------------------------------
-- A creator DM answers exactly one original message. At most one creator reply per original.
alter table public.messages
  add column if not exists reply_to_message_id uuid references public.messages (id) on delete set null;

create unique index if not exists messages_one_creator_reply_idx
  on public.messages (reply_to_message_id)
  where sender = 'creator' and reply_to_message_id is not null;

-- Inserts the reply and marks the original answered in ONE transaction. The recipient is derived
-- from the original row (never supplied by the caller), and the original must belong to p_creator.
--   feedback target : feedback.status -> 'answered'
--   message target  : original user message read_at -> now()
create or replace function public.agent_send_reply(
  p_creator text,
  p_feedback_id uuid,
  p_reply_to_message_id uuid,
  p_body text
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  fb public.feedback;
  orig public.messages;
  target_user uuid;
  fid uuid;
  new_id uuid;
begin
  if p_creator is null or p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'creator and body are required' using errcode = '22023';
  end if;
  if p_feedback_id is null and p_reply_to_message_id is null then
    raise exception 'feedback_id or reply_to_message_id is required' using errcode = '22023';
  end if;

  if p_feedback_id is not null then
    select * into fb from public.feedback
      where id = p_feedback_id and creator_id = p_creator for update;
    if not found then
      raise exception 'feedback not found for this creator' using errcode = 'P0002';
    end if;
    if fb.status = 'answered' then
      raise exception 'feedback already answered' using errcode = 'P0001';
    end if;
    target_user := fb.user_id;
    fid := fb.id;
  end if;

  if p_reply_to_message_id is not null then
    select * into orig from public.messages
      where id = p_reply_to_message_id and creator_id = p_creator and sender = 'user' for update;
    if not found then
      raise exception 'message not found for this creator' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.messages
               where reply_to_message_id = orig.id and sender = 'creator') then
      raise exception 'message already answered' using errcode = 'P0001';
    end if;
    if target_user is not null and target_user <> orig.user_id then
      raise exception 'feedback and message belong to different users' using errcode = '22023';
    end if;
    target_user := orig.user_id;
    fid := coalesce(fid, orig.feedback_id);
  end if;

  insert into public.messages (creator_id, user_id, feedback_id, sender, body_md, reply_to_message_id)
    values (p_creator, target_user, fid, 'creator', p_body, p_reply_to_message_id)
    returning id into new_id;

  if p_feedback_id is not null then
    update public.feedback set status = 'answered', answered_at = now() where id = p_feedback_id;
  end if;
  if p_reply_to_message_id is not null then
    update public.messages set read_at = coalesce(read_at, now()) where id = p_reply_to_message_id;
  end if;
  return new_id;
end;
$$;

revoke all on function public.agent_send_reply(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.agent_send_reply(text, uuid, uuid, text) to service_role;

-- 2. Pending topic request quota: serialize per user (mirrors the feedback lock in 0005) --------
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
    -- Serialize concurrent inserts from the same user so the cap cannot be raced.
    perform pg_advisory_xact_lock(hashtext('topic_requests:' || new.user_id::text));
    if (select count(*) from public.topic_requests where user_id = new.user_id and status = 'pending') >= 5 then
      raise exception 'too many pending topic requests (max 5)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
