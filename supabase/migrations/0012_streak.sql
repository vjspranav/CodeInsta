-- Learning streak over public.views (own rows only). Mirrors packages/shared/src/streak.ts.
-- Streak = consecutive local calendar days, ending today (or yesterday when nothing is seen yet today),
-- with at least one views row.

create index if not exists views_user_seen_idx on public.views (user_id, seen_at desc);

create or replace function public.learning_streak(tz text default 'UTC')
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  today date;
  result integer;
begin
  if not exists (select 1 from pg_timezone_names where name = tz) then
    raise exception 'unknown time zone: %', tz using errcode = '22023';
  end if;

  today := (now() at time zone tz)::date;

  -- Gaps and islands: consecutive days share the same (day - row_number) value.
  with days as (
    select distinct (seen_at at time zone tz)::date as d
    from public.views
    where user_id = auth.uid()
  ),
  islands as (
    select d, d - (row_number() over (order by d))::integer as grp from days
  ),
  latest as (
    select grp, max(d) as last_day, count(*) as run
    from islands
    group by grp
    order by max(d) desc
    limit 1
  )
  select coalesce(
    (select run from latest where last_day >= today - 1),
    0
  ) into result;

  return result;
end;
$$;

revoke all on function public.learning_streak(text) from public, anon;
grant execute on function public.learning_streak(text) to authenticated;
