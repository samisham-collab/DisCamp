-- DisCamp 1.5.0: spot photos, "Still good?" check-ins and change reports
-- (product plan Sprint 3: stories 4, 6 and E2).
--
--   1. Photos: campers add up to 3 photos per spot. The files live in the
--      public Storage bucket "spot-photos" under <camper id>/<photo id>.jpg;
--      public.spot_photos lists them. The app shrinks each photo and saves it
--      fresh, which drops the location and camera data photos carry.
--   2. Check-ins: "Still good" or a change (washout, locked gate, trash,
--      closed, other), with an optional note. Two campers other than the one
--      who added a spot saying "Still good" mark it confirmed. Every check-in
--      counts as an on-site report (spots.report_count).
--   3. Reports cover photos and check-ins too: 3 campers reporting one hide
--      it until you review it, like spots.
--
-- Run it once in the Supabase SQL Editor, after 0005, along with updating the
-- app to 1.5.0. Safe to run twice. If the editor refuses the Storage part
-- (section 1b), README "Photos" says how to set the bucket up by hand.

-- 1. Photos ---------------------------------------------------------------------

create table if not exists public.spot_photos (
  -- Chosen by the app, and also the file name, so a retry never adds a photo twice.
  id uuid primary key,
  spot_id text not null references public.spots (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  path text not null unique,
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 200)
);
alter table public.spot_photos drop constraint if exists spot_photos_path_shape;
alter table public.spot_photos add constraint spot_photos_path_shape
  check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
create index if not exists spot_photos_spot_idx on public.spot_photos (spot_id, created_at);
create index if not exists spot_photos_camper_idx on public.spot_photos (created_by, created_at);

-- Reports can be about a photo (the rest of that is in section 5).
alter table public.flags add column if not exists photo_id uuid references public.spot_photos (id) on delete cascade;

-- Helpers the rules below use. They answer only yes or no, and the moderation
-- schema isn't reachable from the app's API.

-- Does a photo have reports waiting for review?
create or replace function moderation.photo_has_open_flags(photo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.flags f where f.photo_id = photo and f.status = 'open');
$$;

-- Is this file listed on a spot? (Its file can't be deleted while it is.)
create or replace function moderation.photo_listed(file text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.spot_photos ph where ph.path = file);
$$;

alter table public.spot_photos enable row level security;
revoke all on table public.spot_photos from anon, authenticated;
grant select (id, spot_id, created_by, path, width, height, created_at, hidden_at)
  on table public.spot_photos to anon, authenticated;
grant insert (id, spot_id, path, width, height) on table public.spot_photos to authenticated;
grant delete on table public.spot_photos to authenticated;

-- Like spots: hidden photos only for the camper who took them; nothing from
-- campers you've blocked; nothing on a spot you can't see.
drop policy if exists "Visible photos are public" on public.spot_photos;
create policy "Visible photos are public" on public.spot_photos
for select to anon, authenticated
using (
  (hidden_at is null or created_by = (select auth.uid()))
  and not exists (
    select 1 from public.blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = spot_photos.created_by
  )
  and exists (select 1 from public.spots s where s.id = spot_photos.spot_id)
);

drop policy if exists "Campers add photos as themselves" on public.spot_photos;
create policy "Campers add photos as themselves" on public.spot_photos
for insert to authenticated
with check (created_by = (select auth.uid()));

-- Your own photos, unless they're hidden or have reports waiting for review
-- (like spots: deleting would take the reports with it).
drop policy if exists "Campers delete their own photos" on public.spot_photos;
create policy "Campers delete their own photos" on public.spot_photos
for delete to authenticated
using (
  created_by = (select auth.uid())
  and hidden_at is null
  and not moderation.photo_has_open_flags(id)
);

-- What the database checks on every new photo (the app checks first, for
-- friendlier messages).
create or replace function public.guard_photo_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  status text;
begin
  if current_user <> 'authenticated' then
    return new;  -- the dashboard and moderator tools are trusted
  end if;
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  status := moderation.camper_status(uid);
  if status <> 'ok' then
    raise exception '%', status;
  end if;
  new.created_by := uid;
  new.created_at := now();
  new.hidden_at := null;
  new.hidden_reason := null;
  -- The file must be this camper's own upload, named after the photo.
  if new.path <> uid::text || '/' || new.id::text || '.jpg' then
    raise exception 'photo_path' using detail = 'Photos go in your own folder, named after the photo.';
  end if;
  if not moderation.photo_uploaded(new.path, uid) then
    raise exception 'photo_missing' using detail = 'Upload the photo before adding it.';
  end if;
  -- A spot this camper can see (row-level security applies here).
  if not exists (select 1 from public.spots s where s.id = new.spot_id) then
    raise exception 'spot_gone' using detail = 'That spot is no longer on DisCamp.';
  end if;
  -- One photo at a time per camper, then the limits.
  perform pg_advisory_xact_lock(hashtextextended('discamp.photos:' || uid::text, 0));
  if moderation.photo_count(uid, new.spot_id) >= 3 then
    raise exception 'photo_limit_spot' using detail = 'You can add up to 3 photos to a spot.';
  end if;
  if moderation.photo_count(uid, null) >= 20 then
    raise exception 'photo_limit_day' using detail = 'You can add up to 20 photos a day.';
  end if;
  return new;
end;
$$;

drop trigger if exists spot_photos_guard_write on public.spot_photos;
create trigger spot_photos_guard_write
before insert on public.spot_photos
for each row execute function public.guard_photo_write();

-- Photos a camper has on a spot (any, hidden included), or added in the
-- last day (spot null). Campers can only ask about themselves.
create or replace function moderation.photo_count(camper uuid, spot text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.spot_photos
  where created_by = camper
    and (auth.uid() is null or camper = auth.uid())
    and case when spot is null then created_at > now() - interval '1 day' else spot_id = spot end;
$$;

-- 1b. Storage: the bucket and who may put files in it -----------------------------

-- Files this camper uploaded in the last day. Campers can only ask about
-- themselves.
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
    and (auth.uid() is null or camper = auth.uid());
$$;

-- Public to read (photos show on public spot pages; file names can't be
-- guessed), JPEG only, up to 3 MB (the app sends about 300 KB).
--
-- Campers upload into their own folder, only files named like a photo
-- ("<camper id>/<photo id>.jpg"), up to 25 a day (20 photos, plus retries).
-- They may delete their own files, but not while a photo on a spot uses
-- one: deleting the photo comes first, so a reported photo's file stays for
-- review. Nobody can overwrite a file (there's no update rule). Storage reads
-- a file before deleting it, so campers can see their own.
--
-- Storage's tables belong to Supabase. If this project's SQL Editor isn't
-- allowed to change them, this part only warns, so the rest still runs:
-- README "Photos" says how to set the bucket up in the dashboard instead.
do $storage$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('spot-photos', 'spot-photos', true, 3145728, array['image/jpeg'])
  on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "Campers upload spot photos to their folder" on storage.objects;
  create policy "Campers upload spot photos to their folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'spot-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and moderation.camper_status((select auth.uid())) = 'ok'
    and moderation.photo_files_today((select auth.uid())) < 25
  );

  drop policy if exists "Campers see their own spot photo files" on storage.objects;
  create policy "Campers see their own spot photo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'spot-photos' and owner_id = (select auth.uid()::text));

  drop policy if exists "Campers delete their own spot photos" on storage.objects;
  create policy "Campers delete their own spot photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'spot-photos'
    and owner_id = (select auth.uid()::text)
    and not moderation.photo_listed(name)
  );
exception
  when insufficient_privilege then
    raise warning 'DisCamp: Storage was not set up (%). Follow README "Photos" to add the spot-photos bucket by hand.',
      sqlerrm;
end
$storage$;

-- Has this camper uploaded this file? (Storage records the uploader.)
create or replace function moderation.photo_uploaded(file text, camper uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from storage.objects o
    where o.bucket_id = 'spot-photos' and o.name = file and o.owner_id = camper::text
  )
  and (auth.uid() is null or camper = auth.uid());
$$;

-- What the app reads: visible photos, newest last, with the camper's name.
create or replace view public.spot_photos_api
with (security_invoker = true) as
select
  ph.id, ph.spot_id, ph.path, ph.width, ph.height, ph.created_by,
  p.display_name as added_by,
  ph.created_at,
  ph.hidden_at is not null as hidden
from public.spot_photos ph
left join public.profiles p on p.id = ph.created_by;

revoke all on table public.spot_photos_api from anon, authenticated;
grant select on table public.spot_photos_api to anon, authenticated;

-- 2. Check-ins ----------------------------------------------------------------------

create table if not exists public.checkins (
  id bigint generated always as identity primary key,
  spot_id text not null references public.spots (id) on delete cascade,
  camper_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null check (kind in ('still_good', 'road_damage', 'gate_closed', 'trash', 'closed', 'other')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  hidden_at timestamptz
);
create index if not exists checkins_spot_idx on public.checkins (spot_id, created_at desc);
create index if not exists checkins_camper_idx on public.checkins (camper_id, created_at);

alter table public.checkins enable row level security;
revoke all on table public.checkins from anon, authenticated;
grant select (id, spot_id, camper_id, kind, note, created_at, hidden_at) on table public.checkins to anon, authenticated;
grant insert (spot_id, kind, note) on table public.checkins to authenticated;

drop policy if exists "Visible check-ins are public" on public.checkins;
create policy "Visible check-ins are public" on public.checkins
for select to anon, authenticated
using (
  hidden_at is null
  and not exists (
    select 1 from public.blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = checkins.camper_id
  )
  and exists (select 1 from public.spots s where s.id = checkins.spot_id)
);

drop policy if exists "Campers check in as themselves" on public.checkins;
create policy "Campers check in as themselves" on public.checkins
for insert to authenticated
with check (camper_id = (select auth.uid()));

-- Check-ins this camper sent: of a kind, on a spot, in the last 20 hours (spot
-- and kind given), or in the last day (spot null). Campers can only ask about
-- themselves.
create or replace function moderation.checkin_count(camper uuid, spot text, what text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.checkins
  where camper_id = camper
    and (auth.uid() is null or camper = auth.uid())
    and case
      when spot is null then created_at > now() - interval '1 day'
      else spot_id = spot and kind = what and created_at > now() - interval '20 hours'
    end;
$$;

create or replace function public.guard_checkin_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  status text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  status := moderation.camper_status(uid);
  if status <> 'ok' then
    raise exception '%', status;
  end if;
  new.camper_id := uid;
  new.created_at := now();
  new.hidden_at := null;
  new.note := nullif(btrim(new.note), '');
  if new.note is not null and moderation.has_blocked_words(new.note) then
    raise exception 'blocked_words' using detail = 'Some words aren''t allowed on DisCamp.';
  end if;
  if not exists (select 1 from public.spots s where s.id = new.spot_id) then
    raise exception 'spot_gone' using detail = 'That spot is no longer on DisCamp.';
  end if;
  -- Other campers confirm a spot; its own camper can still report changes.
  if new.kind = 'still_good'
    and exists (select 1 from public.spots s where s.id = new.spot_id and s.created_by = uid) then
    raise exception 'own_spot' using detail = 'Other campers confirm the spots you add.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('discamp.checkins:' || uid::text, 0));
  if moderation.checkin_count(uid, new.spot_id, new.kind) > 0 then
    raise exception 'checkin_recent' using detail = 'You already said that about this spot today.';
  end if;
  if moderation.checkin_count(uid, null, null) >= 50 then
    raise exception 'checkin_limit' using detail = 'You can check in up to 50 times a day.';
  end if;
  return new;
end;
$$;

drop trigger if exists checkins_guard_write on public.checkins;
create trigger checkins_guard_write
before insert on public.checkins
for each row execute function public.guard_checkin_write();

-- When a camper last edited a spot. An edit un-confirms it (guard_spot_write
-- in 0004), and only "Still good"s after the edit confirm it again.
alter table public.spots add column if not exists edited_at timestamptz;

create or replace function moderation.note_spot_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists spots_note_edit on public.spots;
create trigger spots_note_edit
before update on public.spots
for each row execute function moderation.note_spot_edit();

-- Every check-in is an on-site report. Two campers other than the one who
-- added a spot saying "Still good" since its last edit confirm it. Runs as
-- the table owner.
create or replace function moderation.after_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.spots set report_count = report_count + 1 where id = new.spot_id;
  if new.kind = 'still_good' then
    update public.spots s set verified = true
    where s.id = new.spot_id and not s.verified
      and (
        select count(distinct c.camper_id) from public.checkins c
        where c.spot_id = s.id and c.kind = 'still_good' and c.hidden_at is null
          and c.camper_id is distinct from s.created_by
          and c.created_at > coalesce(s.edited_at, '-infinity')
      ) >= 2;
  end if;
  return null;
end;
$$;

drop trigger if exists checkins_after_insert on public.checkins;
create trigger checkins_after_insert
after insert on public.checkins
for each row execute function moderation.after_checkin();

-- What the app reads: visible check-ins with the camper's name, newest first.
create or replace view public.checkins_api
with (security_invoker = true) as
select c.id, c.spot_id, c.camper_id, p.display_name as camper_name, c.kind, c.note, c.created_at
from public.checkins c
left join public.profiles p on p.id = c.camper_id;

revoke all on table public.checkins_api from anon, authenticated;
grant select on table public.checkins_api to anon, authenticated;

-- 3. Names on photos and check-ins -------------------------------------------------

-- A camper's display name shows on whatever they post: spots (0003), and now
-- photos and check-ins.
drop policy if exists "Names of campers who added spots are public" on public.profiles;
drop policy if exists "Names of campers who post are public" on public.profiles;
create policy "Names of campers who post are public" on public.profiles
for select to anon, authenticated
using (
  id = (select auth.uid())
  or exists (select 1 from public.spots s where s.created_by = profiles.id)
  or exists (select 1 from public.spot_photos ph where ph.created_by = profiles.id and ph.hidden_at is null)
  or exists (select 1 from public.checkins c where c.camper_id = profiles.id and c.hidden_at is null)
);

-- 4. The map's spots gain when they were last confirmed, and recent changes ----

-- last_confirmed_at: the newest "Still good". alerts: change reports from the
-- last 30 days that came after it, newest first (up to 3), as
-- [{"kind": "gate_closed", "at": "..."}]. Both at the end, so existing
-- columns keep their places.
create or replace view public.spots_api
with (security_invoker = true) as
select
  s.id, s.name,
  extensions.st_y(s.location::extensions.geometry) as latitude,
  extensions.st_x(s.location::extensions.geometry) as longitude,
  s.site_type, s.land_manager, s.stay_limit_days,
  s.clearance_tier, s.drivetrain, s.surface, s.impassable_when_wet,
  s.tent, s.rtt, s.van, s.max_trailer_ft, s.big_rig, s.turnaround,
  s.nightly_fee_usd, s.rv_fee_usd, s.hookups, s.reservations, s.cost_notes,
  s.amenities, s.rules, s.directions, s.phone, s.sources, s.verified, s.report_count,
  s.created_by,
  p.display_name as added_by,
  s.created_at,
  s.hidden_at is not null as hidden,
  good.at as last_confirmed_at,
  coalesce(changes.list, '[]'::jsonb) as alerts
from public.spots s
left join public.profiles p on p.id = s.created_by
left join lateral (
  select max(c.created_at) as at from public.checkins c
  where c.spot_id = s.id and c.kind = 'still_good'
) good on true
left join lateral (
  select jsonb_agg(jsonb_build_object('kind', r.kind, 'at', r.created_at) order by r.created_at desc) as list
  from (
    select c.kind, c.created_at from public.checkins c
    where c.spot_id = s.id and c.kind <> 'still_good'
      and c.created_at > now() - interval '30 days'
      and c.created_at > coalesce(good.at, '-infinity')
    order by c.created_at desc
    limit 3
  ) r
) changes on true;

revoke all on table public.spots_api from anon, authenticated;
grant select on table public.spots_api to anon, authenticated;

-- 5. Reports on photos and check-ins ---------------------------------------------------

alter table public.flags add column if not exists checkin_id bigint references public.checkins (id) on delete cascade;
alter table public.flags drop constraint if exists flags_one_target;
alter table public.flags add constraint flags_one_target
  check (num_nonnulls(spot_id, camper_id, photo_id, checkin_id) = 1);
create unique index if not exists flags_one_open_per_photo
  on public.flags (reporter_id, photo_id) where status = 'open' and photo_id is not null;
create unique index if not exists flags_one_open_per_checkin
  on public.flags (reporter_id, checkin_id) where status = 'open' and checkin_id is not null;
create index if not exists flags_photo_idx on public.flags (photo_id);
create index if not exists flags_checkin_idx on public.flags (checkin_id);
grant insert (spot_id, camper_id, photo_id, checkin_id, reason, details) on table public.flags to authenticated;

-- Campers whose open report on a photo counts toward hiding it (as
-- moderation.open_reporters does for spots and names).
create or replace function moderation.open_photo_reporters(photo uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct f.reporter_id) from public.flags f
  where f.status = 'open' and f.photo_id = photo
    and not exists (
      select 1 from public.flags d
      where d.status = 'dismissed' and d.reporter_id = f.reporter_id and d.photo_id = f.photo_id
    );
$$;

-- Who posted a spot, photo or check-in, whether or not the camper asking can
-- see it (hidden for review, or on a spot from someone they've blocked).
create or replace function moderation.posted_by(spot text, photo uuid, checkin bigint)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.created_by from public.spots s where s.id = spot),
    (select ph.created_by from public.spot_photos ph where ph.id = photo),
    (select c.camper_id from public.checkins c where c.id = checkin)
  );
$$;

-- The same for a check-in.
create or replace function moderation.open_checkin_reporters(checkin bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct f.reporter_id) from public.flags f
  where f.status = 'open' and f.checkin_id = checkin
    and not exists (
      select 1 from public.flags d
      where d.status = 'dismissed' and d.reporter_id = f.reporter_id and d.checkin_id = f.checkin_id
    );
$$;

-- As in 0004, plus photos and check-ins: no reporting your own, one at a time
-- per photo or check-in.
create or replace function public.guard_flag_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  new.reporter_id := uid;
  new.status := 'open';
  new.created_at := now();
  new.reviewed_at := null;

  if moderation.camper_status(uid) = 'banned' then
    raise exception 'banned';
  end if;
  if new.camper_id = uid or moderation.posted_by(new.spot_id, new.photo_id, new.checkin_id) = uid then
    raise exception 'own_content' using detail = 'You can''t report your own spot, photo, check-in or name.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('discamp.flags:' || uid::text, 0));
  if moderation.flags_today(uid) >= 30 then
    raise exception 'flag_limit' using detail = 'You can send up to 30 reports a day.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'discamp.flag-target:'
        || coalesce(new.spot_id, new.camper_id::text, new.photo_id::text, 'checkin-' || new.checkin_id::text, ''),
      0
    )
  );
  return new;
end;
$$;

create or replace function moderation.after_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.spot_id is not null then
    if moderation.open_reporters(new.spot_id, null) >= 3 then
      update public.spots
      set hidden_at = now(), hidden_reason = 'Reported by 3 campers, waiting for review'
      where id = new.spot_id and hidden_at is null;
    end if;
  elsif new.photo_id is not null then
    if moderation.open_photo_reporters(new.photo_id) >= 3 then
      update public.spot_photos
      set hidden_at = now(), hidden_reason = 'Reported by 3 campers, waiting for review'
      where id = new.photo_id and hidden_at is null;
    end if;
  elsif new.checkin_id is not null then
    if moderation.open_checkin_reporters(new.checkin_id) >= 3 then
      update public.checkins set hidden_at = now() where id = new.checkin_id and hidden_at is null;
    end if;
  elsif moderation.open_reporters(null, new.camper_id) >= 3 then
    update public.profiles set display_name = 'Camper'
    where id = new.camper_id and display_name <> 'Camper';
  end if;
  return null;
end;
$$;

-- 6. Moderator tools ------------------------------------------------------------------

-- The queue as in 0004, plus photos and check-ins, with what's needed to
-- judge them at the end: a photo's file path and whether it's hidden, a
-- check-in's note and whether it's hidden. camper_id is whoever posted what
-- was reported (null when they deleted their account).
create or replace view moderation.queue as
select
  case
    when f.spot_id is not null then 'spot'
    when f.photo_id is not null then 'photo'
    when f.checkin_id is not null then 'checkin'
    else 'name'
  end as kind,
  coalesce(f.spot_id, ph.spot_id, c.spot_id) as spot_id,
  s.name as spot_name,
  t.camper_id,
  p.display_name as camper_name,
  count(*) as reports,
  count(distinct f.reporter_id) as reporters,
  string_agg(distinct f.reason, ', ') as reasons,
  string_agg(f.details, ' | ' order by f.created_at) filter (where f.details is not null) as details,
  min(f.created_at) as first_reported,
  bool_or(s.hidden_at is not null) as spot_hidden,
  bool_or(p.id is not null and moderation.camper_status(p.id) = 'banned') as camper_banned,
  f.photo_id,
  ph.path as photo_path,
  bool_or(ph.hidden_at is not null) as photo_hidden,
  f.checkin_id,
  c.kind as checkin_kind,
  c.note as checkin_note,
  bool_or(c.hidden_at is not null) as checkin_hidden
from public.flags f
left join public.spot_photos ph on ph.id = f.photo_id
left join public.checkins c on c.id = f.checkin_id
left join public.spots s on s.id = coalesce(f.spot_id, ph.spot_id, c.spot_id)
cross join lateral (
  select case
    when f.camper_id is not null then f.camper_id
    when f.photo_id is not null then ph.created_by
    when f.checkin_id is not null then c.camper_id
    else s.created_by
  end as camper_id
) t
left join public.profiles p on p.id = t.camper_id
where f.status = 'open'
group by 1, coalesce(f.spot_id, ph.spot_id, c.spot_id), s.name, t.camper_id, p.display_name,
  f.photo_id, ph.path, f.checkin_id, c.kind, c.note
order by min(f.created_at);

-- Take a photo off its spot and close its reports. (To delete the file for
-- good, delete it in Storage > spot-photos as well; the path is in the queue.)
create or replace function moderation.hide_photo(photo uuid, reason text default 'Removed after review')
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.spot_photos set hidden_at = coalesce(hidden_at, now()), hidden_reason = left(reason, 200)
  where id = photo;
  if not found then
    raise exception 'No photo with id %', photo;
  end if;
  update public.flags set status = 'actioned', reviewed_at = now() where photo_id = photo and status = 'open';
end;
$$;

-- Put a photo back (or keep it up) and dismiss its reports.
create or replace function moderation.restore_photo(photo uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.spot_photos set hidden_at = null, hidden_reason = null where id = photo;
  if not found then
    raise exception 'No photo with id %', photo;
  end if;
  update public.flags set status = 'dismissed', reviewed_at = now() where photo_id = photo and status = 'open';
end;
$$;

-- Hide a check-in (an abusive note, say) and close its reports.
create or replace function moderation.hide_checkin(checkin bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.checkins set hidden_at = coalesce(hidden_at, now()) where id = checkin;
  if not found then
    raise exception 'No check-in with id %', checkin;
  end if;
  update public.flags set status = 'actioned', reviewed_at = now() where checkin_id = checkin and status = 'open';
end;
$$;

-- Put a check-in back (or keep it up) and dismiss its reports.
create or replace function moderation.restore_checkin(checkin bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.checkins set hidden_at = null where id = checkin;
  if not found then
    raise exception 'No check-in with id %', checkin;
  end if;
  update public.flags set status = 'dismissed', reviewed_at = now() where checkin_id = checkin and status = 'open';
end;
$$;

-- A ban also takes down the camper's photos and check-ins (unless keep_spots).
create or replace function moderation.ban(
  camper uuid,
  reason text default 'Broke the DisCamp terms of use',
  keep_spots boolean default false
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles set banned_at = coalesce(banned_at, now()), banned_reason = reason where id = camper;
  if not found then
    raise exception 'No camper with id %', camper;
  end if;
  insert into moderation.banned_identities (hash, reason)
  select h, reason from moderation.identity_hashes(camper) as h
  on conflict (hash) do nothing;
  if not keep_spots then
    update public.spots set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'Camper banned'
    where created_by = camper;
    update public.spot_photos set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'Camper banned'
    where created_by = camper;
    update public.checkins set hidden_at = coalesce(hidden_at, now()) where camper_id = camper;
  end if;
  update public.flags set status = 'actioned', reviewed_at = now()
  where status = 'open'
    and (
      camper_id = camper
      or spot_id in (select id from public.spots where created_by = camper)
      or photo_id in (select id from public.spot_photos where created_by = camper)
      or checkin_id in (select id from public.checkins where camper_id = camper)
    );
end;
$$;

-- 7. Who may run what ------------------------------------------------------------------

revoke execute on function moderation.photo_count(uuid, text) from public, anon, authenticated;
revoke execute on function moderation.photo_uploaded(text, uuid) from public, anon, authenticated;
revoke execute on function moderation.checkin_count(uuid, text, text) from public, anon, authenticated;
revoke execute on function moderation.open_photo_reporters(uuid) from public, anon, authenticated;
revoke execute on function moderation.open_checkin_reporters(bigint) from public, anon, authenticated;
revoke execute on function moderation.posted_by(text, uuid, bigint) from public, anon, authenticated;
revoke execute on function moderation.photo_has_open_flags(uuid) from public, anon, authenticated;
revoke execute on function moderation.photo_listed(text) from public, anon, authenticated;
revoke execute on function moderation.photo_files_today(uuid) from public, anon, authenticated;
revoke execute on function moderation.after_checkin() from public, anon, authenticated;
revoke execute on function moderation.note_spot_edit() from public, anon, authenticated;
revoke execute on function moderation.hide_photo(uuid, text) from public, anon, authenticated;
revoke execute on function moderation.restore_photo(uuid) from public, anon, authenticated;
revoke execute on function moderation.hide_checkin(bigint) from public, anon, authenticated;
revoke execute on function moderation.restore_checkin(bigint) from public, anon, authenticated;
revoke execute on function public.guard_photo_write() from public, anon, authenticated;
revoke execute on function public.guard_checkin_write() from public, anon, authenticated;
-- Campers' writes run these checks as themselves (they answer only about the
-- camper asking).
grant execute on function moderation.photo_count(uuid, text) to authenticated;
grant execute on function moderation.photo_uploaded(text, uuid) to authenticated;
grant execute on function moderation.checkin_count(uuid, text, text) to authenticated;
grant execute on function moderation.posted_by(text, uuid, bigint) to authenticated;
grant execute on function moderation.photo_has_open_flags(uuid) to authenticated;
grant execute on function moderation.photo_listed(text) to authenticated;
grant execute on function moderation.photo_files_today(uuid) to authenticated;
