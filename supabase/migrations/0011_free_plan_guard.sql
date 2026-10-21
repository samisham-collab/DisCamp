-- DisCamp 1.8.0: staying on Supabase's free plan.
--
-- The free plan includes a 500 MB database and 1 GB of file storage. Going
-- over doesn't cost money: Supabase warns, gives a grace period, then
-- restricts the project (read-only, or every request refused) until the next
-- billing cycle. This keeps DisCamp under the limits on purpose, so it never
-- gets that far, and nothing is ever deleted to make room:
--
--   1. moderation.settings: one row of switches and limits, edited in the
--      Table Editor. photos_paused and posting_paused pause things by hand
--      (a spam wave, say). The limits match the free plan; raise them if the
--      project moves to a bigger plan or its own server.
--   2. moderation.usage_daily: the database size, photo storage and row
--      counts, one row a day, so growth is easy to see. Kept current (at
--      most an hour old) by moderation.refresh_usage(), which runs whenever
--      the app asks public.app_status(), and when a camper posts.
--   3. The pause: at 90% (pause_at_percent) of the storage limit, new photo
--      uploads stop: Storage refuses the file and the database explains
--      ('photos_paused'). Cleanups need photos, so posting and sending them
--      pause too. At 90% of the database limit, new spots, photos,
--      check-ins and cleanups stop ('posting_paused'). Reports, blocking,
--      sign-ups, edits and deleting things always work, and nothing is
--      deleted. The pause lifts by itself once there's room again.
--   4. public.app_status(): what the app (and the keep-awake check on
--      GitHub) reads: whether photos or posting are paused, and a level,
--      'ok', 'warn' (75%, warn_at_percent) or 'paused'.
--   5. public.free_plan_usage(): the numbers, for moderators (the Review tab).
--   6. Photo previews: next to each photo the app now uploads a small copy,
--      "<camper id>/<photo id>.preview.jpg", for lists and strips. Storage
--      takes a preview only after its photo, it doesn't count toward the 25
--      files a day, and it can't be deleted while its photo is in use.
--
-- Run after 0010 (scripts/setup-database.sh does it). Safe to run twice.

-- 1. Settings ------------------------------------------------------------------

create table if not exists moderation.settings (
  -- One row only.
  id boolean primary key default true check (id),
  -- Pause by hand. The app says photos (or posting) are paused for now.
  photos_paused boolean not null default false,
  posting_paused boolean not null default false,
  -- The plan's limits, in MB. Free: 1 GB of files, 500 MB of database.
  storage_limit_mb integer not null default 1024 check (storage_limit_mb > 0),
  database_limit_mb integer not null default 500 check (database_limit_mb > 0),
  -- Pause new photos (or posting) at this share of a limit...
  pause_at_percent integer not null default 90 check (pause_at_percent between 10 and 100),
  -- ...and warn (the keep-awake check fails, so GitHub emails) at this one.
  warn_at_percent integer not null default 75 check (warn_at_percent between 10 and 100),
  updated_at timestamptz not null default now()
);

insert into moderation.settings (id) values (true) on conflict (id) do nothing;

revoke all on table moderation.settings from public, anon, authenticated;

-- 2. Usage, one row a day --------------------------------------------------------

create table if not exists moderation.usage_daily (
  day date primary key,
  -- What counts toward the plan's limits.
  database_bytes bigint not null,
  storage_bytes bigint not null,
  -- What's growing.
  files integer not null,
  spots integer not null,
  photos integer not null,
  checkins integer not null,
  cleanups integer not null,
  campers integer not null,
  -- Campers who signed in in the last 30 days (the free plan allows 50,000 a month).
  active_campers integer not null,
  checked_at timestamptz not null default now()
);

revoke all on table moderation.usage_daily from public, anon, authenticated;

-- Today's numbers, worked out again if they're more than an hour old (or
-- when forced). Only one session works them out at a time; the others use
-- the last numbers.
create or replace function moderation.refresh_usage(force boolean default false)
returns moderation.usage_daily
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  latest moderation.usage_daily;
begin
  select * into latest from moderation.usage_daily order by day desc limit 1;
  if not force and latest.day = current_date and latest.checked_at > now() - interval '1 hour' then
    return latest;
  end if;
  if not pg_try_advisory_xact_lock(hashtext('discamp.refresh_usage')) then
    return latest;
  end if;

  insert into moderation.usage_daily as u (
    day, database_bytes, storage_bytes, files, spots, photos, checkins, cleanups, campers, active_campers, checked_at
  )
  values (
    current_date,
    pg_database_size(current_database()),
    (select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0) from storage.objects o),
    (select count(*) from storage.objects),
    (select count(*) from public.spots),
    (select count(*) from public.spot_photos),
    (select count(*) from public.checkins),
    (select count(*) from public.cleanup_tasks),
    (select count(*) from public.profiles),
    (select count(*) from auth.users au where au.last_sign_in_at > now() - interval '30 days'),
    now()
  )
  on conflict (day) do update
  set database_bytes = excluded.database_bytes,
      storage_bytes = excluded.storage_bytes,
      files = excluded.files,
      spots = excluded.spots,
      photos = excluded.photos,
      checkins = excluded.checkins,
      cleanups = excluded.cleanups,
      campers = excluded.campers,
      active_campers = excluded.active_campers,
      checked_at = excluded.checked_at
  returning * into latest;
  return latest;
end;
$$;

-- 3. The pause -----------------------------------------------------------------

-- The settings row, or the free plan's defaults if someone deleted it.
create or replace function moderation.current_settings()
returns moderation.settings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s moderation.settings;
begin
  select * into s from moderation.settings where id;
  if not found then
    s := row(true, false, false, 1024, 500, 90, 75, now())::moderation.settings;
  end if;
  return s;
end;
$$;

-- Where things stand: whether photos and posting are paused, and the level.
create or replace function moderation.room()
returns table (photos_paused boolean, posting_paused boolean, level text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s moderation.settings := moderation.current_settings();
  u moderation.usage_daily := moderation.refresh_usage(false);
  mb constant bigint := 1024 * 1024;
  database_full boolean := coalesce(u.database_bytes, 0) * 100 >= s.database_limit_mb * mb * s.pause_at_percent;
  storage_full boolean := coalesce(u.storage_bytes, 0) * 100 >= s.storage_limit_mb * mb * s.pause_at_percent;
  warn boolean :=
    coalesce(u.database_bytes, 0) * 100 >= s.database_limit_mb * mb * s.warn_at_percent
    or coalesce(u.storage_bytes, 0) * 100 >= s.storage_limit_mb * mb * s.warn_at_percent;
begin
  posting_paused := s.posting_paused or database_full;
  photos_paused := posting_paused or s.photos_paused or storage_full;
  level := case when photos_paused then 'paused' when warn then 'warn' else 'ok' end;
  return next;
end;
$$;

-- Is there room for a photo file? (Storage asks this before taking one.)
create or replace function moderation.room_for_photos()
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select not r.photos_paused from moderation.room() r;
$$;

-- Before a camper adds a spot, photo, check-in or cleanup. The first
-- argument says whether it carries photos. The seed and the server (no
-- camper signed in) are never paused; moderators posting in the app are.
create or replace function moderation.guard_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into r from moderation.room();
  if r.posting_paused then
    raise exception 'posting_paused' using detail = 'New posts are paused for now. Reports still work.';
  end if;
  if tg_argv[0] = 'photos' and r.photos_paused then
    raise exception 'photos_paused' using detail = 'New photos are paused for now.';
  end if;
  return new;
end;
$$;

-- Named to run before each table's other checks, so a paused photo is
-- explained as paused (not as a missing file, which Storage refused).
drop trigger if exists spots_0_room on public.spots;
create trigger spots_0_room
before insert on public.spots
for each row execute function moderation.guard_room('none');

drop trigger if exists checkins_0_room on public.checkins;
create trigger checkins_0_room
before insert on public.checkins
for each row execute function moderation.guard_room('none');

drop trigger if exists spot_photos_0_room on public.spot_photos;
create trigger spot_photos_0_room
before insert on public.spot_photos
for each row execute function moderation.guard_room('photos');

drop trigger if exists cleanup_tasks_0_room on public.cleanup_tasks;
create trigger cleanup_tasks_0_room
before insert on public.cleanup_tasks
for each row execute function moderation.guard_room('photos');

drop trigger if exists cleanup_completions_0_room on public.cleanup_completions;
create trigger cleanup_completions_0_room
before insert on public.cleanup_completions
for each row execute function moderation.guard_room('photos');

-- 4. What the app reads ---------------------------------------------------------

-- Everyone, signed in or not. Nothing private: two switches and a level.
create or replace function public.app_status()
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select jsonb_build_object('photos_paused', r.photos_paused, 'posting_paused', r.posting_paused, 'level', r.level)
  from moderation.room() r;
$$;

-- 5. The numbers, for moderators -------------------------------------------------

create or replace function public.free_plan_usage()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s moderation.settings;
  u moderation.usage_daily;
  r record;
begin
  if not moderation.is_moderator(auth.uid()) then
    raise exception 'not_moderator' using detail = 'Only moderators see usage.';
  end if;
  s := moderation.current_settings();
  u := moderation.refresh_usage(false);
  select * into r from moderation.room();
  return jsonb_build_object(
    'database_bytes', u.database_bytes,
    'database_limit_bytes', s.database_limit_mb::bigint * 1024 * 1024,
    'storage_bytes', u.storage_bytes,
    'storage_limit_bytes', s.storage_limit_mb::bigint * 1024 * 1024,
    'pause_at_percent', s.pause_at_percent,
    'warn_at_percent', s.warn_at_percent,
    'photos_paused', r.photos_paused,
    'posting_paused', r.posting_paused,
    'level', r.level,
    'files', u.files,
    'spots', u.spots,
    'photos', u.photos,
    'checkins', u.checkins,
    'cleanups', u.cleanups,
    'campers', u.campers,
    'active_campers', u.active_campers,
    'checked_at', u.checked_at,
    -- A month ago, for "how fast is it growing".
    'month_ago', (
      select jsonb_build_object('day', d.day, 'database_bytes', d.database_bytes, 'storage_bytes', d.storage_bytes)
      from moderation.usage_daily d
      where d.day <= current_date - 28
      order by d.day desc
      limit 1
    )
  );
end;
$$;

-- 6. Photo previews -------------------------------------------------------------

-- A preview's photo: "<camper>/<id>.preview.jpg" belongs to "<camper>/<id>.jpg".
create or replace function moderation.photo_for_preview(file text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(file, '\.preview\.jpg$', '.jpg');
$$;

-- As in 0008, but previews don't count toward the 25 files a day: each one
-- needs its photo uploaded first, so there's at most one per photo.
create or replace function moderation.photo_files_today(camper uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from storage.objects o
  where o.bucket_id = 'spot-photos' and o.owner_id = camper::text
    and o.created_at > now() - interval '1 day'
    and (auth.uid() is null or camper = auth.uid())
    and o.name !~ '\.preview\.jpg$'
    and not exists (select 1 from public.cleanup_tasks t where t.before_path = o.name)
    and not exists (select 1 from public.cleanup_completions c where c.after_path = o.name or c.haul_path = o.name);
$$;

-- As in 0008, and a preview stays while its photo is in use (a reported
-- photo keeps its preview for review).
create or replace function moderation.photo_listed(file text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with f as (select moderation.photo_for_preview(file) as name)
  select exists (select 1 from public.spot_photos ph, f where ph.path = f.name)
    or exists (select 1 from public.cleanup_tasks t, f where t.before_path = f.name)
    or exists (
      select 1 from public.cleanup_completions c, f where c.after_path = f.name or c.haul_path = f.name
    );
$$;

-- Storage's rules, as in 0006, plus previews, plus room for the file. Files
-- are named once and never overwritten, so they can be cached for a year.
do $storage$
begin
  drop policy if exists "Campers upload spot photos to their folder" on storage.objects;
  create policy "Campers upload spot photos to their folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'spot-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and moderation.camper_status((select auth.uid())) = 'ok'
    and (
      (
        name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
        and moderation.photo_files_today((select auth.uid())) < 25
      )
      or (
        name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.preview\.jpg$'
        and moderation.photo_uploaded(moderation.photo_for_preview(name), (select auth.uid()))
      )
    )
    and moderation.room_for_photos()
  );
exception
  when insufficient_privilege then
    raise warning 'DisCamp: Storage rules were not updated (%). Photo previews and the storage pause need them: '
      'see README "Photos".', sqlerrm;
end
$storage$;

-- Grants --------------------------------------------------------------------------

revoke all on function moderation.refresh_usage(boolean) from public, anon, authenticated;
revoke all on function moderation.current_settings() from public, anon, authenticated;
revoke all on function moderation.room() from public, anon, authenticated;
revoke all on function moderation.guard_room() from public, anon, authenticated;
revoke all on function moderation.photo_for_preview(text) from public, anon, authenticated;
revoke all on function public.app_status() from public, anon, authenticated;
revoke all on function public.free_plan_usage() from public, anon, authenticated;

-- Storage checks these as the camper.
grant execute on function moderation.room_for_photos() to authenticated;
grant execute on function moderation.photo_for_preview(text) to authenticated;
grant execute on function moderation.photo_files_today(uuid) to authenticated;
grant execute on function moderation.photo_listed(text) to authenticated;
grant execute on function moderation.photo_uploaded(text, uuid) to authenticated;

grant execute on function public.app_status() to anon, authenticated, service_role;
grant execute on function public.free_plan_usage() to authenticated;

-- Today's first row, so the numbers start now.
do $$
begin
  perform moderation.refresh_usage(true);
end
$$;
