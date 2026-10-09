-- DisCamp database, step 3: accounts and camper-added spots.
-- Run after 0002_harden.sql. Safe to run more than once.
--
-- Needs Supabase Auth (the auth schema every Supabase project has). The
-- sign-in providers themselves are switched on in the Supabase dashboard:
-- see "Sign-in" in the README.
--
-- What campers can do once signed in:
--   * add spots (up to 20 a day), which show for everyone right away;
--   * edit spots they added (an edit clears "confirmed" until it's checked again);
--   * delete spots they added, until someone else has reported on them or
--     they've been confirmed;
--   * change their display name, and delete their account.
-- Nobody can change a starter spot or anyone else's spot from the app.

-- 1. Profiles: the public name shown on spots a camper adds ------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 1 to 40 characters, something visible, no spaces at either end, and never
-- an email address (a provider's "name" is sometimes the email).
alter table public.profiles drop constraint if exists profiles_display_name_ok;
alter table public.profiles add constraint profiles_display_name_ok check (
  char_length(display_name) between 1 and 40
  and display_name ~ '[^[:space:]]'
  and display_name !~ '^[[:space:]]|[[:space:]]$'
  and position('@' in display_name) = 0
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- A profile for every new account. The starting name is the first name (or
-- GitHub username) from the sign-in provider; campers can change it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  candidate text;
  chosen text;
begin
  foreach candidate in array array[
    meta ->> 'given_name',
    split_part(btrim(coalesce(meta ->> 'full_name', '')), ' ', 1),
    split_part(btrim(coalesce(meta ->> 'name', '')), ' ', 1),
    meta ->> 'user_name',
    meta ->> 'preferred_username'
  ]
  loop
    candidate := btrim(coalesce(candidate, ''));
    if candidate ~ '[^[:space:]]'
      and candidate !~ '^[[:space:]]|[[:space:]]$'
      and position('@' in candidate) = 0
      and char_length(candidate) <= 40 then
      chosen := candidate;
      exit;
    end if;
  end loop;

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(chosen, 'Camper'))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Supabase lets projects add triggers to auth.users but not always drop
-- them, so create it only if it isn't there yet. Changes to the function
-- above still apply, since the trigger calls it by name.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'discamp_on_auth_user_created' and tgrelid = 'auth.users'::regclass
  ) then
    create trigger discamp_on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end;
$$;

-- Accounts made before this migration get a profile too.
insert into public.profiles (id, display_name)
select id, 'Camper' from auth.users
on conflict (id) do nothing;

-- 2. Who added each spot ------------------------------------------------------

-- Starter spots have no owner (NULL), so nobody can edit them from the app.
-- Deleting an account keeps the spots it added, without a name on them.
alter table public.spots
  add column if not exists created_by uuid references auth.users (id) on delete set null default auth.uid();

create index if not exists spots_created_by_idx on public.spots (created_by);

-- Who can read and change profiles. (After created_by exists: names show
-- only for campers who have added a spot.)
alter table public.profiles enable row level security;

-- Only the id and name are readable, and only for campers who have added a
-- spot (that's where names show), plus your own.
revoke all on table public.profiles from anon, authenticated;
grant select (id, display_name) on table public.profiles to anon, authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists "Profiles are public" on public.profiles;
drop policy if exists "Names of campers who added spots are public" on public.profiles;
create policy "Names of campers who added spots are public" on public.profiles
for select to anon, authenticated
using (
  id = (select auth.uid())
  or exists (select 1 from public.spots s where s.created_by = profiles.id)
);

drop policy if exists "Campers rename themselves" on public.profiles;
create policy "Campers rename themselves" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Spots added from the app have a random UUID for an id. The app picks it
-- (so trying again after a lost connection can't add the spot twice); the
-- server picks one if the app doesn't.
alter table public.spots alter column id set default gen_random_uuid()::text;

-- 3. Server-owned fields, edits and the daily limit ---------------------------

-- Campers write through the "authenticated" API role. For them the server
-- decides who owns a spot, whether it's confirmed, its report count and its
-- sources, whatever the app sends. The column grants below already stop
-- those fields from being sent; this keeps the rule even if grants change.
create or replace function public.guard_spot_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;  -- the dashboard, the seed and the service role are trusted
  end if;

  if tg_op = 'INSERT' then
    if new.id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_id' using detail = 'Spots added from the app need a UUID id.';
    end if;
    new.created_by := auth.uid();
    new.verified := false;
    new.report_count := 0;
    new.sources := '[]'::jsonb;
    new.created_at := now();
    new.updated_at := now();
    if new.created_by is not null then
      -- One add at a time per camper, so requests sent together can't all
      -- slip under the limit. Released when the transaction ends.
      perform pg_advisory_xact_lock(hashtextextended('discamp.spots:' || new.created_by::text, 0));
      if (
        select count(*) from public.spots
        where created_by = new.created_by and created_at > now() - interval '1 day'
      ) >= 20 then
        raise exception 'daily_limit'
          using detail = 'You can add up to 20 spots a day. Try again tomorrow.';
      end if;
    end if;
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.report_count := old.report_count;
    new.sources := old.sources;
    new.created_at := old.created_at;
    new.verified := false;  -- an edited spot needs confirming again
  end if;
  return new;
end;
$$;

drop trigger if exists spots_guard_write on public.spots;
create trigger spots_guard_write
before insert or update on public.spots
for each row execute function public.guard_spot_write();

-- 4. What the app may write ---------------------------------------------------

-- Exactly the fields on the "Add a spot" form, plus the id the app picks.
-- Not created_by, verified, report_count, sources or the timestamps.
grant insert (
  id, name, location, site_type, land_manager, stay_limit_days,
  clearance_tier, drivetrain, surface, impassable_when_wet,
  tent, rtt, van, max_trailer_ft, big_rig, turnaround,
  nightly_fee_usd, rv_fee_usd, hookups, reservations, cost_notes,
  amenities, rules, directions, phone
) on table public.spots to authenticated;

grant update (
  name, location, site_type, land_manager, stay_limit_days,
  clearance_tier, drivetrain, surface, impassable_when_wet,
  tent, rtt, van, max_trailer_ft, big_rig, turnaround,
  nightly_fee_usd, rv_fee_usd, hookups, reservations, cost_notes,
  amenities, rules, directions, phone
) on table public.spots to authenticated;

grant delete on table public.spots to authenticated;

drop policy if exists "Campers add spots as themselves" on public.spots;
create policy "Campers add spots as themselves" on public.spots
for insert to authenticated
with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

drop policy if exists "Campers edit their own spots" on public.spots;
create policy "Campers edit their own spots" on public.spots
for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

-- Once another camper has reported on a spot (or it's been confirmed), it
-- belongs to everyone and can't be deleted from the app. The camper who
-- added it can still fix it; an edit clears "confirmed" (see above).
-- Revisit when reports arrive (Sprint 3).
drop policy if exists "Campers delete their own unconfirmed spots" on public.spots;
create policy "Campers delete their own unconfirmed spots" on public.spots
for delete to authenticated
using (created_by = (select auth.uid()) and report_count = 0 and not verified);

-- 5. The API view: who added a spot, and when ---------------------------------

-- New columns go at the end so existing ones keep their places.
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
  s.created_at
from public.spots s
left join public.profiles p on p.id = s.created_by;

revoke all on table public.spots_api from anon, authenticated;
grant select on table public.spots_api to anon, authenticated;

-- 6. Deleting your account ----------------------------------------------------

-- App Store rules require in-app account deletion. Removes the sign-in and
-- the profile; spots the camper added stay, without a name.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  delete from auth.users where id = uid;
end;
$$;

-- Supabase lets every API role run new functions by default. Only signed-in
-- campers may delete (their own) account; the trigger functions are never
-- called directly.
revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_spot_write() from public, anon, authenticated;
