-- Categories become data. Interests, topic requests and topic paths validate against this table.
-- The owner reviews topic requests through review_topic_request().

create table if not exists public.categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  label text not null check (char_length(label) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  created_from_request uuid null references public.topic_requests (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists categories_select_member on public.categories;
create policy categories_select_member on public.categories
  for select to authenticated using (public.is_member());
drop policy if exists categories_insert_owner on public.categories;
create policy categories_insert_owner on public.categories
  for insert to authenticated with check (public.is_owner());
drop policy if exists categories_update_owner on public.categories;
create policy categories_update_owner on public.categories
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

insert into public.categories (slug, label, description) values
  ('aosp', 'AOSP', 'Android Open Source Project internals: build system, Treble, Binder, ART and the framework.'),
  ('os', 'Operating Systems', 'Kernels, scheduling, memory management, file systems and system calls.'),
  ('compilers', 'Compilers', 'Parsing, intermediate representations, optimization passes and code generation.'),
  ('distributed', 'Distributed Systems', 'Consensus, replication, partitioning and failure handling across machines.'),
  ('networking', 'Networking', 'Protocols, packet paths, congestion control and network stacks.'),
  ('databases', 'Databases', 'Storage engines, indexing, transactions and query execution.'),
  ('linkers', 'Linkers and Loaders', 'Object files, symbol resolution, relocation, dynamic linking and ELF.'),
  ('virtualization', 'Virtualization', 'Hypervisors, virtual devices, containers and isolation.'),
  ('architecture', 'Computer Architecture', 'CPUs, caches, pipelines, memory ordering and hardware-software interfaces.')
on conflict (slug) do nothing;

-- Request -> category link.
alter table public.topic_requests
  add column if not exists category_slug text null references public.categories (slug);

-- Replace the hard-coded CHECK constraints with validation against categories.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.user_interests'::regclass, 'public.topic_requests'::regclass)
      and (
        (c.conrelid = 'public.user_interests'::regclass and pg_get_constraintdef(c.oid) like '%areas%<@%')
        or (c.conrelid = 'public.topic_requests'::regclass and pg_get_constraintdef(c.oid) like '%area%aosp%')
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end;
$$;

create or replace function public.user_interests_validate_areas() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from unnest(coalesce(new.areas, '{}'::text[])) a
    where not exists (select 1 from public.categories c where c.slug = a)
  ) then
    raise exception 'unknown category in areas' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists user_interests_validate_areas on public.user_interests;
create trigger user_interests_validate_areas before insert or update of areas on public.user_interests
  for each row execute function public.user_interests_validate_areas();

create or replace function public.topic_requests_validate_area() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.area is not null and not exists (select 1 from public.categories where slug = new.area) then
    raise exception 'unknown category: %', new.area using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists topic_requests_validate_area on public.topic_requests;
create trigger topic_requests_validate_area before insert or update of area on public.topic_requests
  for each row execute function public.topic_requests_validate_area();

-- Owner review of a topic request.
create or replace function public.review_topic_request(
  request_id uuid,
  decision text,
  slug text default null,
  label text default null,
  description text default null
) returns public.topic_requests
  language plpgsql security definer set search_path = public as $$
declare
  req public.topic_requests;
  s text := slug;
  result public.topic_requests;
begin
  if not public.is_owner() then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if decision not in ('new_category', 'existing', 'reject') then
    raise exception 'invalid decision: %', decision using errcode = '22023';
  end if;
  select * into req from public.topic_requests where id = request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if req.status = 'done' then
    raise exception 'request already fulfilled' using errcode = 'P0001';
  end if;

  if decision = 'reject' then
    update public.topic_requests
      set status = 'rejected', category_slug = null, decided_at = now()
      where id = request_id returning * into result;
    return result;
  end if;

  if s is null or s !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'slug must match ^[a-z0-9-]{2,40}$' using errcode = '22023';
  end if;

  if decision = 'new_category' then
    if label is null or char_length(btrim(label)) = 0 then
      raise exception 'label required' using errcode = '22023';
    end if;
    if exists (select 1 from public.categories where categories.slug = s) then
      raise exception 'category already exists: %', s using errcode = '23505';
    end if;
    insert into public.categories (slug, label, description, created_from_request)
      values (s, btrim(label), coalesce(btrim(description), ''), request_id);
  else
    if not exists (select 1 from public.categories where categories.slug = s) then
      raise exception 'unknown category: %', s using errcode = '22023';
    end if;
  end if;

  update public.topic_requests
    set status = 'approved', category_slug = s, decided_at = now()
    where id = request_id returning * into result;
  return result;
end;
$$;

revoke all on function public.review_topic_request(uuid, text, text, text, text) from public, anon;
grant execute on function public.review_topic_request(uuid, text, text, text, text) to authenticated;
