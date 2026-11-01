-- Archive and remake the original 30: archived reels stay in the database (reversible) but are hidden
-- from the feed, catalog and profiles. unique(creator_id, topic) now applies to live reels only, so a
-- remake can reuse its original topic path.

alter table public.reels add column if not exists archived_at timestamptz;

-- Drop the unique(creator_id, topic) constraint from 0001 (default name reels_creator_id_topic_key),
-- looked up by columns so a differently named constraint is still found.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.reels'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['creator_id', 'topic']
  loop
    execute format('alter table public.reels drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists reels_creator_topic_live_idx
  on public.reels (creator_id, topic)
  where archived_at is null;
