-- DisCamp 1.6.0: cleanups, Embers and ranks (product plan stories 7, 8 and 9).
--
--   1. Cleanups ("Litter here"): a camper at the site posts one with a
--      before photo from the app's camera. It's pinned where they stand, and
--      linked to a spot within 2 km if there is one. Everyone sees open ones.
--   2. Cleaning one up: anyone (the poster too: "found it and cleaned it")
--      sends an after photo and a haul shot of what they packed out, taken
--      within 150 m of the pin. One waits for review at a time per cleanup,
--      and a camper can send a cleanup twice (one more try after a "no").
--   3. Review in the app, for moderators (moderation.moderators): approve,
--      maybe changing the size, or send it back with a reason.
--   4. Embers: an append-only ledger (public.embers) that only the database
--      writes. A camper's total is the sum, so nobody can edit a balance.
--        a cleanup approved ................ 50 small, 100 medium, 150 large
--        a cleanup you posted, cleaned up by someone else ............ 10
--        a spot you added, confirmed by 2 other campers (once a spot) . 50
--        "Still good" (the first one on each spot, kept if taken back)  10
--        a change report (the first one on each spot) ................ 10
--        a photo on a spot (up to 3 a spot, ever) ..................... 5
--      Up to 300 a day (Mountain time, by the day the camper did it), 100 a
--      day in an account's first two weeks, and at most 50 a day from
--      check-ins; past that it's recorded as 0. Deleting a photo, or a
--      moderator removing a spot, photo, check-in or cleanup, takes its Embers
--      back. Photos and check-ins from 1.5 earn theirs now (section 7).
--   6. The terms of use gain a section on cleanups and Embers: version 2, so
--      campers agree again before their next post.
--   5. Reports cover cleanups too: 3 campers reporting one hide it until
--      you review it.
--
-- Run after 0007 (scripts/setup-database.sh does it). Safe to run twice.

-- 0. Moderators -----------------------------------------------------------------

-- Campers who review cleanups in the app. Add yourself in the SQL Editor:
--   select moderation.add_moderator(camper_id) from moderation.find_camper('Sam');
create table if not exists moderation.moderators (
  camper_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
revoke all on table moderation.moderators from public, anon, authenticated;

create or replace function moderation.is_moderator(camper uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select camper is not null and exists (select 1 from moderation.moderators m where m.camper_id = camper);
$$;

create or replace function moderation.add_moderator(camper uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = camper) then
    raise exception 'No camper with id %', camper;
  end if;
  insert into moderation.moderators (camper_id) values (camper) on conflict (camper_id) do nothing;
end;
$$;

create or replace function moderation.remove_moderator(camper uuid)
returns void
language sql
set search_path = ''
as $$
  delete from moderation.moderators where camper_id = camper;
$$;

-- The app asks this to show the Review screen (the database checks again
-- on every review).
create or replace function public.am_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select moderation.is_moderator(auth.uid());
$$;

-- 1. Cleanups ---------------------------------------------------------------------

create table if not exists public.cleanup_tasks (
  -- Chosen by the app, and also the before photo's file name, so a retry
  -- never posts it twice.
  id uuid primary key,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  spot_id text references public.spots (id) on delete set null,
  location extensions.geography(point, 4326) not null,
  kind text not null check (kind in ('litter', 'fire_ring', 'dumping', 'other')),
  size text not null check (size in ('small', 'medium', 'large')),
  note text check (char_length(note) <= 300),
  before_path text not null unique,
  -- open: waiting for someone; review: a cleanup waits for a moderator; done.
  status text not null default 'open' check (status in ('open', 'review', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 200)
);
alter table public.cleanup_tasks drop constraint if exists cleanup_tasks_path_shape;
alter table public.cleanup_tasks add constraint cleanup_tasks_path_shape
  check (before_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
alter table public.cleanup_tasks drop constraint if exists cleanup_tasks_location_valid;
alter table public.cleanup_tasks add constraint cleanup_tasks_location_valid check (
  not extensions.st_isempty(location::extensions.geometry)
  and extensions.st_x(location::extensions.geometry) between -180 and 180
  and extensions.st_y(location::extensions.geometry) between -90 and 90
);
create index if not exists cleanup_tasks_created_idx on public.cleanup_tasks (created_at desc);
create index if not exists cleanup_tasks_camper_idx on public.cleanup_tasks (created_by, created_at);
create index if not exists cleanup_tasks_spot_idx on public.cleanup_tasks (spot_id);
create index if not exists cleanup_tasks_location_idx on public.cleanup_tasks using gist (location);

create table if not exists public.cleanup_completions (
  -- Chosen by the app, and also the after photo's file name.
  id uuid primary key,
  task_id uuid not null references public.cleanup_tasks (id) on delete cascade,
  camper_id uuid default auth.uid() references auth.users (id) on delete set null,
  after_path text not null unique,
  haul_path text not null unique,
  -- Where the after photo was taken, and how sure the phone was of it (in
  -- meters). Only moderators see these.
  location extensions.geography(point, 4326) not null,
  accuracy_m real check (accuracy_m between 0 and 10000),
  note text check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- The size the moderator settled on, and why they said no.
  size text check (size in ('small', 'medium', 'large')),
  review_note text check (char_length(review_note) <= 300),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.cleanup_completions drop constraint if exists cleanup_completions_path_shape;
alter table public.cleanup_completions add constraint cleanup_completions_path_shape check (
  after_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and haul_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and after_path <> haul_path
);
alter table public.cleanup_completions drop constraint if exists cleanup_completions_location_valid;
alter table public.cleanup_completions add constraint cleanup_completions_location_valid check (
  not extensions.st_isempty(location::extensions.geometry)
  and extensions.st_x(location::extensions.geometry) between -180 and 180
  and extensions.st_y(location::extensions.geometry) between -90 and 90
);
-- One cleanup waits for review at a time per task.
create unique index if not exists cleanup_completions_one_pending
  on public.cleanup_completions (task_id) where status = 'pending';
create index if not exists cleanup_completions_task_idx on public.cleanup_completions (task_id, created_at);
create index if not exists cleanup_completions_camper_idx on public.cleanup_completions (camper_id, created_at);

-- Reports can be about a cleanup (the rest of that is in section 5).
alter table public.flags add column if not exists task_id uuid references public.cleanup_tasks (id) on delete cascade;

-- Helpers the rules below use. They answer only about the camper asking.

-- Cleanups this camper posted in the last day.
create or replace function moderation.cleanups_posted_today(camper uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.cleanup_tasks
  where created_by = camper and created_at > now() - interval '1 day'
    and (auth.uid() is null or camper = auth.uid());
$$;

-- Cleanups this camper sent for review in the last day.
create or replace function moderation.cleanups_sent_today(camper uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.cleanup_completions
  where camper_id = camper and created_at > now() - interval '1 day'
    and (auth.uid() is null or camper = auth.uid());
$$;

-- How many times this camper has sent this cleanup for review.
create or replace function moderation.cleanup_tries(camper uuid, task uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.cleanup_completions
  where camper_id = camper and task_id = task
    and (auth.uid() is null or camper = auth.uid());
$$;

-- Is there a cleanup still to do within 30 m of here?
create or replace function moderation.open_cleanup_near(here extensions.geography)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cleanup_tasks t
    where t.status <> 'done' and t.hidden_at is null and extensions.st_dwithin(t.location, here, 30)
  );
$$;

-- Has a cleanup been sent for review, or reported? (Then its poster can't
-- delete it.) Campers can only ask about their own.
create or replace function moderation.cleanup_has_history(task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    exists (select 1 from public.cleanup_completions c where c.task_id = task)
    or exists (select 1 from public.flags f where f.task_id = task and f.status = 'open')
  )
  and (
    auth.uid() is null
    or exists (select 1 from public.cleanup_tasks t where t.id = task and t.created_by = auth.uid())
  );
$$;

-- Who posted a cleanup, whether or not the camper asking can see it.
create or replace function moderation.cleanup_poster(task uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select created_by from public.cleanup_tasks where id = task;
$$;

-- Who may read and write what.
alter table public.cleanup_tasks enable row level security;
revoke all on table public.cleanup_tasks from anon, authenticated;
grant select (id, created_by, spot_id, location, kind, size, note, before_path, status, created_at, done_at, hidden_at)
  on table public.cleanup_tasks to anon, authenticated;
grant insert (id, spot_id, location, kind, size, note, before_path) on table public.cleanup_tasks to authenticated;
grant delete on table public.cleanup_tasks to authenticated;

-- Like spots: hidden ones only for the camper who posted them, and nothing
-- from campers you've blocked.
drop policy if exists "Visible cleanups are public" on public.cleanup_tasks;
create policy "Visible cleanups are public" on public.cleanup_tasks
for select to anon, authenticated
using (
  (hidden_at is null or created_by = (select auth.uid()))
  and not exists (
    select 1 from public.blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = cleanup_tasks.created_by
  )
);

drop policy if exists "Campers post cleanups as themselves" on public.cleanup_tasks;
create policy "Campers post cleanups as themselves" on public.cleanup_tasks
for insert to authenticated
with check (created_by = (select auth.uid()));

-- A cleanup posted by mistake can come down, until someone sends one for
-- review or reports it.
drop policy if exists "Campers delete their own untouched cleanups" on public.cleanup_tasks;
create policy "Campers delete their own untouched cleanups" on public.cleanup_tasks
for delete to authenticated
using (
  created_by = (select auth.uid())
  and status = 'open'
  and hidden_at is null
  and not moderation.cleanup_has_history(id)
);

alter table public.cleanup_completions enable row level security;
revoke all on table public.cleanup_completions from anon, authenticated;
-- Not location or accuracy: only moderators see where the photo was taken.
grant select (id, task_id, camper_id, after_path, haul_path, note, status, size, review_note, reviewed_at, created_at)
  on table public.cleanup_completions to anon, authenticated;
grant insert (id, task_id, after_path, haul_path, location, accuracy_m, note)
  on table public.cleanup_completions to authenticated;

-- Approved cleanups are public; the rest only for the camper who sent them.
drop policy if exists "Approved cleanups are public" on public.cleanup_completions;
create policy "Approved cleanups are public" on public.cleanup_completions
for select to anon, authenticated
using (
  (status = 'approved' or camper_id = (select auth.uid()))
  and not exists (
    select 1 from public.blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = cleanup_completions.camper_id
  )
);

drop policy if exists "Campers send cleanups as themselves" on public.cleanup_completions;
create policy "Campers send cleanups as themselves" on public.cleanup_completions
for insert to authenticated
with check (camper_id = (select auth.uid()));

-- What the database checks on every new cleanup (the app checks first, for
-- friendlier messages).
create or replace function public.guard_cleanup_task_write()
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
  new.status := 'open';
  new.done_at := null;
  new.hidden_at := null;
  new.hidden_reason := null;
  new.note := nullif(btrim(new.note), '');
  if new.note is not null and moderation.has_blocked_words(new.note) then
    raise exception 'blocked_words' using detail = 'Some words aren''t allowed on DisCamp.';
  end if;
  -- The before photo: this camper's own upload, named after the cleanup.
  if new.before_path <> uid::text || '/' || new.id::text || '.jpg' then
    raise exception 'photo_path' using detail = 'Photos go in your own folder, named after the cleanup.';
  end if;
  if not moderation.photo_uploaded(new.before_path, uid) then
    raise exception 'photo_missing' using detail = 'Upload the photo before posting.';
  end if;
  -- One post (or delete) at a time per camper, so a delete can't slip a
  -- re-post past the checks below.
  perform pg_advisory_xact_lock(hashtextextended('discamp.cleanups:' || uid::text, 0));
  -- Trying again after a lost answer: let the primary key say it's there.
  if exists (select 1 from public.cleanup_tasks t where t.id = new.id) then
    return new;
  end if;
  -- A new photo, not one already on DisCamp.
  if moderation.photo_listed(new.before_path) then
    raise exception 'photo_used' using detail = 'That photo is already on DisCamp.';
  end if;
  -- A spot this camper can see, within 2 km.
  if new.spot_id is not null and not exists (
    select 1 from public.spots s
    where s.id = new.spot_id and extensions.st_dwithin(s.location, new.location, 2000)
  ) then
    raise exception 'spot_too_far' using detail = 'A cleanup links to a spot within 2 km of it.';
  end if;
  if moderation.cleanups_posted_today(uid) >= 10 then
    raise exception 'cleanup_limit' using detail = 'You can post up to 10 cleanups a day.';
  end if;
  if moderation.open_cleanup_near(new.location) then
    raise exception 'cleanup_nearby' using detail = 'There''s already a cleanup posted within 30 m of here.';
  end if;
  return new;
end;
$$;

drop trigger if exists cleanup_tasks_guard_write on public.cleanup_tasks;
create trigger cleanup_tasks_guard_write
before insert on public.cleanup_tasks
for each row execute function public.guard_cleanup_task_write();

-- A camper deleting a cleanup waits for (and holds back) their posts.
create or replace function public.guard_cleanup_task_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.created_by is not null then
    perform pg_advisory_xact_lock(hashtextextended('discamp.cleanups:' || old.created_by::text, 0));
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_tasks_guard_delete on public.cleanup_tasks;
create trigger cleanup_tasks_guard_delete
before delete on public.cleanup_tasks
for each row execute function public.guard_cleanup_task_delete();

create or replace function public.guard_cleanup_completion_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  status text;
  task_status text;
  task_at extensions.geography;
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
  new.status := 'pending';
  new.size := null;
  new.review_note := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.note := nullif(btrim(new.note), '');
  if new.note is not null and moderation.has_blocked_words(new.note) then
    raise exception 'blocked_words' using detail = 'Some words aren''t allowed on DisCamp.';
  end if;
  -- Both photos: this camper's own uploads, the after photo named after the cleanup.
  if new.after_path <> uid::text || '/' || new.id::text || '.jpg'
    or new.haul_path !~ ('^' || uid::text || '/[0-9a-f-]{36}\.jpg$')
    or new.haul_path = new.after_path then
    raise exception 'photo_path' using detail = 'Photos go in your own folder.';
  end if;
  if not (moderation.photo_uploaded(new.after_path, uid) and moderation.photo_uploaded(new.haul_path, uid)) then
    raise exception 'photo_missing' using detail = 'Upload both photos before sending.';
  end if;
  if exists (select 1 from public.cleanup_completions c where c.id = new.id) then
    return new;
  end if;
  -- New photos, not ones already on DisCamp (the before photo, say).
  if moderation.photo_listed(new.after_path) or moderation.photo_listed(new.haul_path) then
    raise exception 'photo_used' using detail = 'That photo is already on DisCamp.';
  end if;
  -- One at a time per cleanup (reviews take the same lock).
  perform pg_advisory_xact_lock(hashtextextended('discamp.cleanup:' || new.task_id::text, 0));
  select t.status, t.location into task_status, task_at
  from public.cleanup_tasks t
  where t.id = new.task_id and t.hidden_at is null;
  if not found then
    raise exception 'cleanup_gone' using detail = 'That cleanup is no longer on DisCamp.';
  end if;
  if task_status = 'done' then
    raise exception 'cleanup_done' using detail = 'Someone already cleaned this up.';
  end if;
  if task_status = 'review' then
    raise exception 'cleanup_in_review' using detail = 'Someone''s cleanup of this is waiting for review.';
  end if;
  if not extensions.st_dwithin(task_at, new.location, 150) then
    raise exception 'cleanup_too_far' using detail = 'Take the after photo within 150 m of the cleanup.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('discamp.cleanups:' || uid::text, 0));
  if moderation.cleanup_tries(uid, new.task_id) >= 2 then
    raise exception 'cleanup_tries' using detail = 'You can send a cleanup for review twice.';
  end if;
  if moderation.cleanups_sent_today(uid) >= 10 then
    raise exception 'cleanup_limit' using detail = 'You can send up to 10 cleanups a day.';
  end if;
  return new;
end;
$$;

drop trigger if exists cleanup_completions_guard_write on public.cleanup_completions;
create trigger cleanup_completions_guard_write
before insert on public.cleanup_completions
for each row execute function public.guard_cleanup_completion_write();

-- A cleanup sent for review puts its task in review. Runs as the table owner.
create or replace function moderation.after_cleanup_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cleanup_tasks set status = 'review' where id = new.task_id and status = 'open';
  return null;
end;
$$;

drop trigger if exists cleanup_completions_after_insert on public.cleanup_completions;
create trigger cleanup_completions_after_insert
after insert on public.cleanup_completions
for each row execute function moderation.after_cleanup_sent();

-- Files a camper uploaded in the last day, as in 0006, but not the ones
-- cleanups use (those have their own daily limits), so cleanups don't eat
-- into the 25 a day Storage allows for spot photos and retries.
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
    and not exists (select 1 from public.cleanup_tasks t where t.before_path = o.name)
    and not exists (select 1 from public.cleanup_completions c where c.after_path = o.name or c.haul_path = o.name);
$$;

-- Photo files can't be deleted while a cleanup uses them either (0006 made
-- this the rule for spot photos; Storage asks this function).
create or replace function moderation.photo_listed(file text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.spot_photos ph where ph.path = file)
    or exists (select 1 from public.cleanup_tasks t where t.before_path = file)
    or exists (select 1 from public.cleanup_completions c where c.after_path = file or c.haul_path = file);
$$;

-- 2. Embers ---------------------------------------------------------------------------

create table if not exists public.embers (
  id bigint generated always as identity primary key,
  camper_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (
    reason in ('cleanup', 'cleanup_reported', 'spot_confirmed', 'still_good', 'change_report', 'photo', 'taken_back')
  ),
  -- What earned it: a cleanup's, check-in's or photo's id, or a spot's.
  -- For taken_back, the id of the ledger row it reverses.
  ref text not null,
  -- The spot it was about, if any. No foreign key: the record stays if the
  -- spot goes.
  spot_id text,
  -- What it added after the daily limit (negative for taken_back), and before.
  amount integer not null,
  full_amount integer not null,
  -- The camper's day (Mountain time) they did it. Daily limits count by it.
  earned_on date not null,
  created_at timestamptz not null default now(),
  constraint embers_once unique (camper_id, reason, ref)
);
create index if not exists embers_camper_day_idx on public.embers (camper_id, earned_on);
create index if not exists embers_camper_spot_idx on public.embers (camper_id, reason, spot_id);

alter table public.embers enable row level security;
revoke all on table public.embers from anon, authenticated;
grant select (id, camper_id, reason, ref, spot_id, amount, full_amount, earned_on, created_at)
  on table public.embers to authenticated;

drop policy if exists "Campers see their own Embers" on public.embers;
create policy "Campers see their own Embers" on public.embers
for select to authenticated
using (camper_id = (select auth.uid()));

-- Append-only: a correction is a new row (taken_back), never an edit.
create or replace function moderation.embers_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'embers_append_only' using detail = 'Embers are never edited. Add a taken_back row instead.';
end;
$$;

drop trigger if exists embers_no_update on public.embers;
create trigger embers_no_update
before update on public.embers
for each row execute function moderation.embers_append_only();

-- The only way Embers are added. Once per (camper, reason, ref); up to 300
-- a day, 100 a day in the account's first two weeks, 50 a day of them from
-- check-ins; past that, recorded as 0 so it can't be earned again later.
-- Returns what was added.
create or replace function moderation.award(
  camper uuid,
  why text,
  what text,
  spot text,
  points integer,
  happened timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  day date := (coalesce(happened, now()) at time zone 'America/Denver')::date;
  joined timestamptz;
  cap integer;
  earned bigint;
  from_checkins bigint;
  added integer;
begin
  if camper is null or points is null or points <= 0 then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('discamp.embers:' || camper::text, 0));
  if exists (select 1 from public.embers e where e.camper_id = camper and e.reason = why and e.ref = what) then
    return 0;
  end if;
  select p.created_at into joined from public.profiles p where p.id = camper;
  if not found then
    return 0;  -- the account is gone
  end if;
  cap := case when coalesce(happened, now()) < joined + interval '14 days' then 100 else 300 end;
  select coalesce(sum(e.amount), 0) into earned
  from public.embers e
  where e.camper_id = camper and e.earned_on = day and e.amount > 0;
  added := greatest(0, least(points, cap - earned))::integer;
  -- Check-ins need no proof of a visit, so they earn at most 50 a day.
  if why in ('still_good', 'change_report') then
    select coalesce(sum(e.amount), 0) into from_checkins
    from public.embers e
    where e.camper_id = camper and e.earned_on = day and e.amount > 0
      and e.reason in ('still_good', 'change_report');
    added := greatest(0, least(added, 50 - from_checkins))::integer;
  end if;
  insert into public.embers (camper_id, reason, ref, spot_id, amount, full_amount, earned_on)
  values (camper, why, what, spot, added, points, day);
  return added;
end;
$$;

-- Like award, but only the first `per_spot` times for this reason on a spot.
create or replace function moderation.award_per_spot(
  camper uuid,
  why text,
  what text,
  spot text,
  points integer,
  happened timestamptz,
  per_spot integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if camper is null or spot is null then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('discamp.embers:' || camper::text, 0));
  if (
    select count(*) from public.embers e
    where e.camper_id = camper and e.reason = why and e.spot_id = spot and e.ref <> what
  ) >= per_spot then
    return 0;
  end if;
  return moderation.award(camper, why, what, spot, points, happened);
end;
$$;

-- Takes back what something earned (a moderator removed it). The original
-- row stays, so it can't be earned again.
create or replace function moderation.take_back(why text, what text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.embers (camper_id, reason, ref, spot_id, amount, full_amount, earned_on)
  select e.camper_id, 'taken_back', e.id::text, e.spot_id, -e.amount, -e.amount, e.earned_on
  from public.embers e
  where e.reason = why and e.ref = what and e.amount > 0
  on conflict (camper_id, reason, ref) do nothing;
$$;

-- What the Account screen shows: the camper's total, today's Embers and
-- today's limit.
create or replace function public.my_embers()
returns table (total bigint, today bigint, daily_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(e.amount) from public.embers e where e.camper_id = auth.uid()), 0)::bigint,
    coalesce((
      select sum(e.amount) from public.embers e
      where e.camper_id = auth.uid() and e.amount > 0
        and e.earned_on = (now() at time zone 'America/Denver')::date
    ), 0)::bigint,
    (select case when now() < p.created_at + interval '14 days' then 100 else 300 end
     from public.profiles p where p.id = auth.uid());
$$;

-- The camper's ledger, with spot names.
create or replace view public.embers_api
with (security_invoker = true) as
select e.id, e.reason, e.ref, e.spot_id, s.name as spot_name, e.amount, e.full_amount, e.earned_on, e.created_at
from public.embers e
left join public.spots s on s.id = e.spot_id;

revoke all on table public.embers_api from anon, authenticated;
grant select on table public.embers_api to authenticated;

-- 3. What earns Embers -----------------------------------------------------------------

-- Check-ins: as in 0007, plus Embers for the camper's first "Still good"
-- and first change report on each spot.
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
    where s.id = new.spot_id and not s.verified and moderation.confirmations(s.id) >= 2;
  elsif new.camper_id is not null then
    update public.checkins set withdrawn_at = now()
    where spot_id = new.spot_id and camper_id = new.camper_id
      and kind = 'still_good' and withdrawn_at is null;
    if found then
      update public.spots s set verified = false
      where s.id = new.spot_id and s.verified and s.created_by is not null
        and moderation.confirmations(s.id) < 2;
    end if;
  end if;
  if new.hidden_at is null then
    perform moderation.award_per_spot(
      new.camper_id,
      case when new.kind = 'still_good' then 'still_good' else 'change_report' end,
      new.id::text, new.spot_id, 10, new.created_at, 1
    );
  end if;
  return null;
end;
$$;

-- Photos: 5 each, the first 3 a camper adds to each spot.
create or replace function moderation.after_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hidden_at is null then
    perform moderation.award_per_spot(new.created_by, 'photo', new.id::text, new.spot_id, 5, new.created_at, 3);
  end if;
  return null;
end;
$$;

drop trigger if exists spot_photos_after_insert on public.spot_photos;
create trigger spot_photos_after_insert
after insert on public.spot_photos
for each row execute function moderation.after_photo();

-- A deleted photo (by its camper, or with its spot) takes its Embers along,
-- so adding and deleting photos can't earn anything.
create or replace function moderation.after_photo_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform moderation.take_back('photo', old.id::text);
  return null;
end;
$$;

drop trigger if exists spot_photos_after_delete on public.spot_photos;
create trigger spot_photos_after_delete
after delete on public.spot_photos
for each row execute function moderation.after_photo_deleted();

-- A spot a camper added, confirmed for the first time: 50 for them.
create or replace function moderation.after_spot_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verified and not old.verified and new.created_by is not null then
    perform moderation.award(new.created_by, 'spot_confirmed', new.id, new.id, 50, now());
  end if;
  return null;
end;
$$;

drop trigger if exists spots_after_confirmed on public.spots;
create trigger spots_after_confirmed
after update of verified on public.spots
for each row execute function moderation.after_spot_confirmed();

-- 4. Reviewing cleanups (moderators, in the app) ----------------------------------------

-- Cleanups waiting for review, oldest first, with what's needed to judge them.
create or replace function public.cleanup_review_queue()
returns table (
  completion_id uuid,
  task_id uuid,
  kind text,
  task_size text,
  task_note text,
  before_path text,
  after_path text,
  haul_path text,
  note text,
  camper_id uuid,
  camper_name text,
  camper_joined timestamptz,
  camper_approved bigint,
  posted_by uuid,
  posted_by_name text,
  spot_id text,
  spot_name text,
  distance_m integer,
  accuracy_m real,
  tries bigint,
  task_created_at timestamptz,
  sent_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not moderation.is_moderator(auth.uid()) then
    raise exception 'not_moderator' using detail = 'Only moderators review cleanups.';
  end if;
  return query
  select
    c.id, t.id, t.kind, t.size, t.note, t.before_path, c.after_path, c.haul_path, c.note,
    c.camper_id, p.display_name, p.created_at,
    (select count(*) from public.cleanup_completions a where a.camper_id = c.camper_id and a.status = 'approved'),
    t.created_by, pp.display_name, t.spot_id, s.name,
    round(extensions.st_distance(t.location, c.location))::integer, c.accuracy_m,
    (select count(*) from public.cleanup_completions r where r.camper_id = c.camper_id and r.task_id = t.id),
    t.created_at, c.created_at
  from public.cleanup_completions c
  join public.cleanup_tasks t on t.id = c.task_id
  left join public.profiles p on p.id = c.camper_id
  left join public.profiles pp on pp.id = t.created_by
  left join public.spots s on s.id = t.spot_id
  where c.status = 'pending'
  order by c.created_at;
end;
$$;

-- Approve a cleanup: the task is done, and Embers go to whoever cleaned it
-- up (by size) and to whoever posted it (if someone else).
create or replace function public.approve_cleanup(completion uuid, final_size text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cleanup_completions;
  t public.cleanup_tasks;
  chosen text;
begin
  if not moderation.is_moderator(auth.uid()) then
    raise exception 'not_moderator' using detail = 'Only moderators review cleanups.';
  end if;
  select * into c from public.cleanup_completions where id = completion;
  if not found then
    raise exception 'review_gone' using detail = 'That cleanup is no longer on DisCamp.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('discamp.cleanup:' || c.task_id::text, 0));
  select * into c from public.cleanup_completions where id = completion;
  if c.status <> 'pending' then
    raise exception 'review_done' using detail = 'This cleanup was already reviewed.';
  end if;
  select * into t from public.cleanup_tasks where id = c.task_id;
  if t.hidden_at is not null then
    raise exception 'cleanup_gone' using detail = 'That cleanup was taken down.';
  end if;
  chosen := coalesce(final_size, t.size);
  if chosen not in ('small', 'medium', 'large') then
    raise exception 'invalid_size' using detail = 'Size is small, medium or large.';
  end if;
  update public.cleanup_completions
  set status = 'approved', size = chosen, reviewed_by = auth.uid(), reviewed_at = now()
  where id = completion;
  update public.cleanup_tasks set status = 'done', done_at = now() where id = t.id;
  perform moderation.award(
    c.camper_id, 'cleanup', t.id::text, t.spot_id,
    case chosen when 'small' then 50 when 'medium' then 100 else 150 end,
    c.created_at
  );
  if t.created_by is distinct from c.camper_id then
    perform moderation.award(t.created_by, 'cleanup_reported', t.id::text, t.spot_id, 10, t.created_at);
  end if;
end;
$$;

-- Send a cleanup back with a reason the camper sees. The task opens again.
create or replace function public.reject_cleanup(completion uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cleanup_completions;
  why text := nullif(btrim(reason), '');
begin
  if not moderation.is_moderator(auth.uid()) then
    raise exception 'not_moderator' using detail = 'Only moderators review cleanups.';
  end if;
  if why is null or char_length(why) > 300 then
    raise exception 'reason_needed' using detail = 'Say why in up to 300 characters, so the camper can fix it.';
  end if;
  select * into c from public.cleanup_completions where id = completion;
  if not found then
    raise exception 'review_gone' using detail = 'That cleanup is no longer on DisCamp.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('discamp.cleanup:' || c.task_id::text, 0));
  select * into c from public.cleanup_completions where id = completion;
  if c.status <> 'pending' then
    raise exception 'review_done' using detail = 'This cleanup was already reviewed.';
  end if;
  update public.cleanup_completions
  set status = 'rejected', review_note = why, reviewed_by = auth.uid(), reviewed_at = now()
  where id = completion;
  update public.cleanup_tasks set status = 'open' where id = c.task_id and status = 'review';
end;
$$;

-- 5. Reports on cleanups ---------------------------------------------------------------

alter table public.flags drop constraint if exists flags_one_target;
alter table public.flags add constraint flags_one_target
  check (num_nonnulls(spot_id, camper_id, photo_id, checkin_id, task_id) = 1);
create unique index if not exists flags_one_open_per_task
  on public.flags (reporter_id, task_id) where status = 'open' and task_id is not null;
create index if not exists flags_task_idx on public.flags (task_id);
grant insert (spot_id, camper_id, photo_id, checkin_id, task_id, reason, details) on table public.flags to authenticated;

-- Campers whose open report on a cleanup counts toward hiding it.
create or replace function moderation.open_task_reporters(task uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct f.reporter_id) from public.flags f
  where f.status = 'open' and f.task_id = task
    and not exists (
      select 1 from public.flags d
      where d.status = 'dismissed' and d.reporter_id = f.reporter_id and d.task_id = f.task_id
    );
$$;

-- As in 0006, plus cleanups.
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
  if new.camper_id = uid
    or moderation.posted_by(new.spot_id, new.photo_id, new.checkin_id) = uid
    or (new.task_id is not null and moderation.cleanup_poster(new.task_id) = uid) then
    raise exception 'own_content' using detail = 'You can''t report your own spot, photo, check-in, cleanup or name.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('discamp.flags:' || uid::text, 0));
  if moderation.flags_today(uid) >= 30 then
    raise exception 'flag_limit' using detail = 'You can send up to 30 reports a day.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'discamp.flag-target:'
        || coalesce(
          new.spot_id, new.camper_id::text, new.photo_id::text,
          'checkin-' || new.checkin_id::text, 'task-' || new.task_id::text, ''
        ),
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
  elsif new.task_id is not null then
    if moderation.open_task_reporters(new.task_id) >= 3 then
      update public.cleanup_tasks
      set hidden_at = now(), hidden_reason = 'Reported by 3 campers, waiting for review'
      where id = new.task_id and hidden_at is null;
    end if;
  elsif moderation.open_reporters(null, new.camper_id) >= 3 then
    update public.profiles set display_name = 'Camper'
    where id = new.camper_id and display_name <> 'Camper';
  end if;
  return null;
end;
$$;

-- 6. Names, the app's view of cleanups, and moderator tools ---------------------------

-- A camper's display name shows on whatever they post, now cleanups too.
drop policy if exists "Names of campers who post are public" on public.profiles;
create policy "Names of campers who post are public" on public.profiles
for select to anon, authenticated
using (
  id = (select auth.uid())
  or exists (select 1 from public.spots s where s.created_by = profiles.id)
  or exists (select 1 from public.spot_photos ph where ph.created_by = profiles.id and ph.hidden_at is null)
  or exists (select 1 from public.checkins c where c.camper_id = profiles.id and c.hidden_at is null)
  or exists (select 1 from public.cleanup_tasks t where t.created_by = profiles.id and t.hidden_at is null)
  or exists (select 1 from public.cleanup_completions cc where cc.camper_id = profiles.id and cc.status = 'approved')
);

-- What the app reads: cleanups with who posted them, the spot they're near,
-- and (once approved) who cleaned them up, with the after photo and haul shot.
create or replace view public.cleanup_tasks_api
with (security_invoker = true) as
select
  t.id,
  extensions.st_y(t.location::extensions.geometry) as latitude,
  extensions.st_x(t.location::extensions.geometry) as longitude,
  t.kind, t.size, t.note, t.status, t.before_path,
  t.created_by,
  p.display_name as posted_by,
  t.created_at,
  t.spot_id,
  s.name as spot_name,
  t.hidden_at is not null as hidden,
  t.done_at,
  done.camper_id as cleaned_by_id,
  dp.display_name as cleaned_by,
  done.after_path,
  done.haul_path
from public.cleanup_tasks t
left join public.profiles p on p.id = t.created_by
left join public.spots s on s.id = t.spot_id
left join lateral (
  select c.camper_id, c.after_path, c.haul_path from public.cleanup_completions c
  where c.task_id = t.id and c.status = 'approved'
  order by c.reviewed_at desc
  limit 1
) done on true
left join public.profiles dp on dp.id = done.camper_id;

revoke all on table public.cleanup_tasks_api from anon, authenticated;
grant select on table public.cleanup_tasks_api to anon, authenticated;

-- The queue as in 0006, plus cleanups (at the end): the task, its before
-- photo's path, and whether it's hidden.
create or replace view moderation.queue as
select
  case
    when f.spot_id is not null then 'spot'
    when f.photo_id is not null then 'photo'
    when f.checkin_id is not null then 'checkin'
    when f.task_id is not null then 'task'
    else 'name'
  end as kind,
  coalesce(f.spot_id, ph.spot_id, c.spot_id, ct.spot_id) as spot_id,
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
  bool_or(c.hidden_at is not null) as checkin_hidden,
  f.task_id,
  ct.before_path as task_photo_path,
  bool_or(ct.hidden_at is not null) as task_hidden
from public.flags f
left join public.spot_photos ph on ph.id = f.photo_id
left join public.checkins c on c.id = f.checkin_id
left join public.cleanup_tasks ct on ct.id = f.task_id
left join public.spots s on s.id = coalesce(f.spot_id, ph.spot_id, c.spot_id, ct.spot_id)
cross join lateral (
  select case
    when f.camper_id is not null then f.camper_id
    when f.photo_id is not null then ph.created_by
    when f.checkin_id is not null then c.camper_id
    when f.task_id is not null then ct.created_by
    else s.created_by
  end as camper_id
) t
left join public.profiles p on p.id = t.camper_id
where f.status = 'open'
group by 1, coalesce(f.spot_id, ph.spot_id, c.spot_id, ct.spot_id), s.name, t.camper_id, p.display_name,
  f.photo_id, ph.path, f.checkin_id, c.kind, c.note, f.task_id, ct.before_path
order by min(f.created_at);

-- Take a cleanup down and close its reports. Embers it earned are taken
-- back, and a cleanup of it waiting for review is sent back.
create or replace function moderation.hide_task(task uuid, reason text default 'Removed after review')
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.cleanup_tasks set hidden_at = coalesce(hidden_at, now()), hidden_reason = left(reason, 200)
  where id = task;
  if not found then
    raise exception 'No cleanup with id %', task;
  end if;
  update public.cleanup_completions
  set status = 'rejected', review_note = 'This cleanup was taken down after review.', reviewed_at = now()
  where task_id = task and status = 'pending';
  update public.cleanup_tasks set status = 'open' where id = task and status = 'review';
  update public.flags set status = 'actioned', reviewed_at = now() where task_id = task and status = 'open';
  perform moderation.take_back('cleanup', task::text);
  perform moderation.take_back('cleanup_reported', task::text);
end;
$$;

-- Put a cleanup back (or keep it up) and dismiss its reports.
create or replace function moderation.restore_task(task uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.cleanup_tasks set hidden_at = null, hidden_reason = null where id = task;
  if not found then
    raise exception 'No cleanup with id %', task;
  end if;
  update public.flags set status = 'dismissed', reviewed_at = now() where task_id = task and status = 'open';
end;
$$;

-- As in 0004, and the 50 Embers for its confirmation are taken back.
create or replace function moderation.hide_spot(spot text, reason text default 'Removed after review')
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.spots set hidden_at = coalesce(hidden_at, now()), hidden_reason = left(reason, 200) where id = spot;
  if not found then
    raise exception 'No spot with id %', spot;
  end if;
  update public.flags set status = 'actioned', reviewed_at = now() where spot_id = spot and status = 'open';
  perform moderation.take_back('spot_confirmed', spot);
end;
$$;

-- As in 0006, and the photo's Embers are taken back.
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
  perform moderation.take_back('photo', photo::text);
end;
$$;

-- As in 0006, and the check-in's Embers are taken back.
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
  perform moderation.take_back('still_good', checkin::text);
  perform moderation.take_back('change_report', checkin::text);
end;
$$;

-- As in 0006, plus cleanups: a ban takes them down (unless keep_spots) and
-- sends back the camper's cleanups waiting for review.
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
    update public.cleanup_tasks set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'Camper banned'
    where created_by = camper;
    update public.cleanup_completions
    set status = 'rejected', review_note = 'This cleanup was taken down after review.', reviewed_at = now()
    where status = 'pending' and task_id in (select id from public.cleanup_tasks where created_by = camper);
  end if;
  update public.cleanup_tasks t set status = 'open'
  where t.status = 'review'
    and exists (
      select 1 from public.cleanup_completions c
      where c.task_id = t.id and c.camper_id = camper and c.status = 'pending'
    );
  update public.cleanup_completions
  set status = 'rejected', review_note = 'Camper banned', reviewed_at = now()
  where camper_id = camper and status = 'pending';
  update public.flags set status = 'actioned', reviewed_at = now()
  where status = 'open'
    and (
      camper_id = camper
      or spot_id in (select id from public.spots where created_by = camper)
      or photo_id in (select id from public.spot_photos where created_by = camper)
      or checkin_id in (select id from public.checkins where camper_id = camper)
      or task_id in (select id from public.cleanup_tasks where created_by = camper)
    );
end;
$$;

-- 7. Embers for what campers did in 1.5 -------------------------------------------------

-- In the order it happened, by the same rules (safe to run again: nothing
-- is earned twice).
do $backfill$
declare
  r record;
begin
  for r in
    select 'checkin' as source, c.id::text as ref, c.camper_id as camper, c.spot_id as spot, c.kind, c.created_at as happened
    from public.checkins c
    where c.camper_id is not null and c.hidden_at is null
    union all
    select 'photo', ph.id::text, ph.created_by, ph.spot_id, null, ph.created_at
    from public.spot_photos ph
    where ph.created_by is not null and ph.hidden_at is null
    order by happened
  loop
    if r.source = 'checkin' then
      perform moderation.award_per_spot(
        r.camper, case when r.kind = 'still_good' then 'still_good' else 'change_report' end, r.ref, r.spot, 10, r.happened, 1
      );
    else
      perform moderation.award_per_spot(r.camper, 'photo', r.ref, r.spot, 5, r.happened, 3);
    end if;
  end loop;
  perform moderation.award(s.created_by, 'spot_confirmed', s.id, s.id, 50, s.updated_at)
  from public.spots s
  where s.verified and s.created_by is not null and s.hidden_at is null;
end;
$backfill$;

-- 8. Terms of use, version 2 ----------------------------------------------------------

-- The terms now cover cleanups and Embers (TERMS_VERSION in src/config.ts
-- says the same): campers agree again before their next post.
create or replace function moderation.current_terms_version()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2 $$;

-- 9. Who may run what -------------------------------------------------------------------

revoke execute on function moderation.is_moderator(uuid) from public, anon, authenticated;
revoke execute on function moderation.add_moderator(uuid) from public, anon, authenticated;
revoke execute on function moderation.remove_moderator(uuid) from public, anon, authenticated;
revoke execute on function moderation.cleanups_posted_today(uuid) from public, anon, authenticated;
revoke execute on function moderation.cleanups_sent_today(uuid) from public, anon, authenticated;
revoke execute on function moderation.cleanup_tries(uuid, uuid) from public, anon, authenticated;
revoke execute on function moderation.open_cleanup_near(extensions.geography) from public, anon, authenticated;
revoke execute on function moderation.cleanup_has_history(uuid) from public, anon, authenticated;
revoke execute on function moderation.cleanup_poster(uuid) from public, anon, authenticated;
revoke execute on function moderation.after_cleanup_sent() from public, anon, authenticated;
revoke execute on function moderation.embers_append_only() from public, anon, authenticated;
revoke execute on function moderation.award(uuid, text, text, text, integer, timestamptz) from public, anon, authenticated;
revoke execute on function moderation.award_per_spot(uuid, text, text, text, integer, timestamptz, integer)
  from public, anon, authenticated;
revoke execute on function moderation.take_back(text, text) from public, anon, authenticated;
revoke execute on function moderation.after_photo() from public, anon, authenticated;
revoke execute on function moderation.after_spot_confirmed() from public, anon, authenticated;
revoke execute on function moderation.after_photo_deleted() from public, anon, authenticated;
revoke execute on function moderation.hide_spot(text, text) from public, anon, authenticated;
revoke execute on function public.guard_cleanup_task_delete() from public, anon, authenticated;
revoke execute on function moderation.open_task_reporters(uuid) from public, anon, authenticated;
revoke execute on function moderation.hide_task(uuid, text) from public, anon, authenticated;
revoke execute on function moderation.restore_task(uuid) from public, anon, authenticated;
revoke execute on function moderation.hide_photo(uuid, text) from public, anon, authenticated;
revoke execute on function moderation.hide_checkin(bigint) from public, anon, authenticated;
revoke execute on function moderation.ban(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.guard_cleanup_task_write() from public, anon, authenticated;
revoke execute on function public.guard_cleanup_completion_write() from public, anon, authenticated;
revoke execute on function public.am_moderator() from public, anon, authenticated;
revoke execute on function public.cleanup_review_queue() from public, anon, authenticated;
revoke execute on function public.approve_cleanup(uuid, text) from public, anon, authenticated;
revoke execute on function public.reject_cleanup(uuid, text) from public, anon, authenticated;
revoke execute on function public.my_embers() from public, anon, authenticated;
-- Campers' writes and reads run these checks as themselves (they answer
-- only about the camper asking).
grant execute on function moderation.cleanups_posted_today(uuid) to authenticated;
grant execute on function moderation.cleanups_sent_today(uuid) to authenticated;
grant execute on function moderation.cleanup_tries(uuid, uuid) to authenticated;
grant execute on function moderation.open_cleanup_near(extensions.geography) to authenticated;
grant execute on function moderation.cleanup_has_history(uuid) to authenticated;
grant execute on function moderation.cleanup_poster(uuid) to authenticated;
-- What the app calls.
grant execute on function public.am_moderator() to authenticated;
grant execute on function public.cleanup_review_queue() to authenticated;
grant execute on function public.approve_cleanup(uuid, text) to authenticated;
grant execute on function public.reject_cleanup(uuid, text) to authenticated;
grant execute on function public.my_embers() to authenticated;
