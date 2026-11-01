-- Run with: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0012_streak.sql
-- Everything is rolled back. Needs at least 6 reels in public.reels (any content).
begin;

create temp table _t_reels as select id, row_number() over (order by id) as n from public.reels limit 6;
grant select on _t_reels to authenticated;

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'streak-test@example.invalid');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare
  uid constant uuid := '00000000-0000-0000-0000-0000000000a1';
  today date := (now() at time zone 'UTC')::date;
  r uuid[];
  s integer;
begin
  select array_agg(id order by n) into r from _t_reels;
  assert array_length(r, 1) = 6, 'need 6 reels';

  -- 1. no views
  assert public.learning_streak('UTC') = 0, 'empty should be 0';

  -- 2. today only
  insert into public.views (user_id, reel_id, seen_at) values (uid, r[1], now());
  assert public.learning_streak('UTC') = 1, 'today only should be 1';

  -- 3. today and yesterday
  insert into public.views (user_id, reel_id, seen_at) values (uid, r[2], now() - interval '1 day');
  assert public.learning_streak('UTC') = 2, 'today+yesterday should be 2';

  -- 4. yesterday and the day before, nothing today
  delete from public.views where user_id = uid and reel_id = r[1];
  insert into public.views (user_id, reel_id, seen_at) values (uid, r[3], now() - interval '2 days');
  assert public.learning_streak('UTC') = 2, 'alive until midnight should be 2';

  -- 5. gap: latest day older than yesterday gives 0
  delete from public.views where user_id = uid;
  insert into public.views (user_id, reel_id, seen_at) values
    (uid, r[1], now() - interval '3 days'), (uid, r[2], now() - interval '4 days');
  assert public.learning_streak('UTC') = 0, 'stale run should be 0';

  -- 5b. gap inside history: today, then a gap, then an older run counts only today
  insert into public.views (user_id, reel_id, seen_at) values (uid, r[4], now());
  assert public.learning_streak('UTC') = 1, 'run ending today after a gap should be 1';

  -- 6. time zone: pick a view that is on a different local day in Kolkata than in UTC
  delete from public.views where user_id = uid;
  insert into public.views (user_id, reel_id, seen_at) values (uid, r[5], now());
  s := public.learning_streak('Asia/Kolkata');
  assert s = 1, 'Kolkata today view should be 1';

  -- unknown time zone raises 22023
  begin
    perform public.learning_streak('Not/AZone');
    assert false, 'unknown tz should raise';
  exception when sqlstate '22023' then
    null;
  end;
end;
$$;

reset role;
rollback;
