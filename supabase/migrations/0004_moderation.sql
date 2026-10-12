-- DisCamp database, step 4: moderation for camper-added content.
-- Run after 0003_accounts.sql. Safe to run more than once.
--
-- Apple's App Review Guideline 1.2 asks apps where people post content for:
--   * terms campers agree to before posting (accept_terms; every write checks it);
--   * a filter for objectionable words (moderation.word_rules; every write checks it);
--   * a way to report content (public.flags, the app's Report buttons);
--   * a way to block abusive campers (public.blocks: their spots disappear for you);
--   * a way for you to act on reports within 24 hours (the moderation.* functions,
--     run from the Supabase SQL Editor; see MODERATION.md).
-- When 3 different campers report the same spot, it hides until you review
-- it. When 3 report the same name, it goes back to "Camper".

-- 0. Moderator tools get their own schema ------------------------------------

-- Bans read auth.identities (section 2). Stop now, with a clear message, if
-- this database user can't, instead of failing every camper's save later.
do $$
begin
  perform 1 from auth.identities limit 1;
exception when insufficient_privilege or undefined_table or undefined_column then
  raise exception 'DisCamp 0004 needs to read auth.identities (user_id, provider, provider_id). Run it in the Supabase SQL Editor.';
end;
$$;

-- Supabase's API only serves the public schema, so nothing here can be
-- called from the app. Campers' requests may use the few checks granted at
-- the end of this file (the write triggers need them), nothing else.
create schema if not exists moderation;
revoke all on schema moderation from public, anon, authenticated;
alter default privileges in schema moderation revoke execute on functions from public;

-- 1. Blocked words -------------------------------------------------------------

-- The same list the app uses (the "obscenity" library's English words, minus
-- cock, dick, dyke, hooker, scat and tit, which are also everyday place names
-- and trail words), as rules over text normalized by moderation.normalize_text
-- below (lower case, look-alike characters read as letters, everything else
-- a space):
--   * 'block' rules are regular expressions; a space stands for a word edge;
--   * 'allow' phrases are taken out of the text first, so words like
--     "assess", "cumulus" or "shitake" don't trip the filter.
-- src/lib/wordFilter.ts makes these rows; a test checks they still match.
-- Add your own words with moderation.block_word('...').
create table if not exists moderation.word_rules (
  rule text primary key check (rule ~ '^[ a-z().?:]+$'),
  kind text not null check (kind in ('block', 'allow'))
);

insert into moderation.word_rules (rule, kind) values
  (' ab(?:b)?o(?:s)? ', 'block'),
  (' anal', 'block'),
  (' ars(?:s)?e', 'block'),
  (' ass', 'block'),
  (' cum', 'block'),
  (' cunt', 'block'),
  (' fag', 'block'),
  (' fk', 'block'),
  (' fu ', 'block'),
  (' fuk', 'block'),
  (' nig ', 'block'),
  (' nigs ', 'block'),
  (' piss', 'block'),
  (' pnis', 'block'),
  (' prick(?:s)? ', 'block'),
  (' prn ', 'block'),
  (' rape', 'block'),
  (' rapis(?:s)?t', 'block'),
  (' s(?:s)?e(?:e)?me(?:e)?n', 'block'),
  (' s(?:s)?e(?:e)?x ', 'block'),
  (' s(?:s)?e(?:e)?xy ', 'block'),
  (' shit', 'block'),
  (' spastic', 'block'),
  (' trany', 'block'),
  (' turd', 'block'),
  (' twat', 'block'),
  (' v(?:.)?gina', 'block'),
  (' wank', 'block'),
  (' wh(?:o)?re ', 'block'),
  (' who(?:o)?res(?:s)? ', 'block'),
  ('(?:or)?gasm', 'block'),
  ('ab(?:b)?eed', 'block'),
  ('africoon', 'block'),
  ('anus', 'block'),
  ('arab(?:b)?ush', 'block'),
  ('b(?:b)?l(?:l)?(?:o)?wj(?:o)?b', 'block'),
  ('bas(?:s)?tard', 'block'),
  ('be(?:e)?(?:a)?s(?:s)?tial', 'block'),
  ('bich ', 'block'),
  ('bitch', 'block'),
  ('bol(?:l)?ock', 'block'),
  ('boob', 'block'),
  ('boonga', 'block'),
  ('buttplug', 'block'),
  ('chingchong', 'block'),
  ('chink', 'block'),
  ('cuck', 'block'),
  ('cunt ', 'block'),
  ('d(?:o)?g(?:g)?ys(?:s)?t(?:y)?l(?:l)?', 'block'),
  ('danal', 'block'),
  ('deepthro(?:o)?at', 'block'),
  ('deepthro(?:o)?t', 'block'),
  ('dildo', 'block'),
  ('double penetra', 'block'),
  ('e(?:e)?acul(?:l)?ate', 'block'),
  ('e(?:e)?jacul', 'block'),
  ('e(?:e)?jakul', 'block'),
  ('eanal', 'block'),
  ('f(?:.)?ck', 'block'),
  ('f(?:e)?(?:e)?llat', 'block'),
  ('fanal', 'block'),
  ('fe(?:e)?l(?:l)?ch', 'block'),
  ('fggot', 'block'),
  ('fingerbang', 'block'),
  ('fistin', 'block'),
  ('g(?:.)?ngbang', 'block'),
  ('ganal', 'block'),
  ('h(?:.)?ndjob', 'block'),
  ('h(?:e)?(?:e)?ntai', 'block'),
  ('ianal', 'block'),
  ('incest', 'block'),
  ('janal', 'block'),
  ('jerkoff', 'block'),
  ('jizz', 'block'),
  ('kanal', 'block'),
  ('kike', 'block'),
  ('lanal', 'block'),
  ('lubejob', 'block'),
  ('m(?:.)?sturbate', 'block'),
  ('masterbate', 'block'),
  ('n(?:i)?gga', 'block'),
  ('n(?:i)?gger', 'block'),
  ('negro', 'block'),
  ('oanal ', 'block'),
  ('orgies', 'block'),
  ('orgy', 'block'),
  ('p(?:u)?ssy', 'block'),
  ('panal', 'block'),
  ('pe(?:e)?nis', 'block'),
  ('porn', 'block'),
  ('qanal', 'block'),
  ('ranal', 'block'),
  ('retard', 'block'),
  ('s(?:s)?lut', 'block'),
  ('sanal', 'block'),
  ('shit ', 'block'),
  ('tanal', 'block'),
  ('uanal', 'block'),
  ('vagina', 'block'),
  ('vanal', 'block'),
  ('wanal', 'block'),
  ('xanal', 'block'),
  ('yanal', 'block'),
  ('zanal', 'block'),
  ('an al', 'allow'),
  ('an us', 'allow'),
  ('analabos', 'allow'),
  ('analagous', 'allow'),
  ('analav', 'allow'),
  ('analog', 'allow'),
  ('analy', 'allow'),
  ('arsen', 'allow'),
  ('assa', 'allow'),
  ('assem', 'allow'),
  ('assen', 'allow'),
  ('asser', 'allow'),
  ('assess', 'allow'),
  ('asset', 'allow'),
  ('assev', 'allow'),
  ('assi', 'allow'),
  ('assoc', 'allow'),
  ('assoi', 'allow'),
  ('assu', 'allow'),
  ('baboon ga', 'allow'),
  ('chin k', 'allow'),
  ('cuckoo', 'allow'),
  ('cumb', 'allow'),
  ('cumu', 'allow'),
  ('fan al', 'allow'),
  ('fick', 'allow'),
  ('gan al', 'allow'),
  ('gasma', 'allow'),
  ('ian al', 'allow'),
  ('janus', 'allow'),
  ('kung fu', 'allow'),
  ('lan al', 'allow'),
  ('manus', 'allow'),
  ('montenegro', 'allow'),
  ('negron', 'allow'),
  ('p orna', 'allow'),
  ('pan al', 'allow'),
  ('pen is', 'allow'),
  ('porgy', 'allow'),
  ('rapper', 'allow'),
  ('s hit', 'allow'),
  ('sh it', 'allow'),
  ('shi t', 'allow'),
  ('shitake', 'allow'),
  ('snigger', 'allow'),
  ('stoneground', 'allow'),
  ('tan al', 'allow'),
  ('tetanus', 'allow'),
  ('texan al', 'allow'),
  ('trojan al', 'allow'),
  ('turducken', 'allow'),
  ('twattle', 'allow'),
  ('uan al', 'allow'),
  ('uranus', 'allow'),
  ('van al', 'allow'),
  ('who re', 'allow'),
  ('winegrow', 'allow')
on conflict (rule) do nothing;

-- Text as the filter reads it: Unicode look-alikes folded (full-width
-- letters and the like), lower case, common accents dropped, and in
-- words with at least two letters, look-alike digits and symbols read as
-- letters ("sh1t", "a$$hole"). Plain numbers stay numbers, so "Road 455" or
-- "Site A55" are fine. Then everything that isn't a letter becomes a space,
-- with a space at each end. normalizeForServer in src/lib/wordFilter.ts is
-- the same steps; a test checks they agree.
create or replace function moderation.normalize_text(input text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  word text;
  result text := '';
begin
  foreach word in array regexp_split_to_array(lower(normalize(coalesce(input, ''), NFKC)), '[[:space:]]+') loop
    word := translate(word, 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿšžčćřłğşď', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyyszccrlgsd');
    if word ~ '[a-z].*[a-z]' then
      word := translate(word, '013457@$!|', 'oieastasii');
    end if;
    result := result || ' ' || word;
  end loop;
  return ' ' || btrim(regexp_replace(result, '[^a-z]+', ' ', 'g')) || ' ';
end;
$$;

-- True when the text has a blocked word.
create or replace function moderation.has_blocked_words(input text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  text_ text := moderation.normalize_text(input);
  phrase text;
begin
  if btrim(text_) = '' then
    return false;
  end if;
  for phrase in select rule from moderation.word_rules where kind = 'allow' loop
    text_ := replace(text_, phrase, ' ');
  end loop;
  return exists (select 1 from moderation.word_rules where kind = 'block' and text_ ~ rule);
end;
$$;

-- 2. Terms of use and bans -----------------------------------------------------

alter table public.profiles add column if not exists terms_version integer;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists banned_reason text;

-- The terms campers must have agreed to. When the terms change, raise this
-- in a new migration (and TERMS_VERSION in src/config.ts), and everyone is
-- asked to agree again before their next spot.
create or replace function moderation.current_terms_version()
returns integer
language sql
immutable
set search_path = ''
as $$ select 1 $$;

-- Bans hold even if the camper deletes their account and signs up again:
-- a ban also keeps a SHA-256 hash of the account's email address and of each
-- sign-in identity (say "apple:<Apple's id for them>"). Hashes, so the list
-- itself holds no readable addresses. The privacy policy mentions this.
create table if not exists moderation.banned_identities (
  hash text primary key,
  banned_at timestamptz not null default now(),
  reason text
);

create or replace function moderation.sha(value text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(sha256(convert_to(lower(btrim(value)), 'UTF8')), 'hex') $$;

-- Every hash that identifies this camper's account.
create or replace function moderation.identity_hashes(camper uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select moderation.sha('email:' || u.email) from auth.users u where u.id = camper and u.email is not null
  union
  select moderation.sha(i.provider || ':' || i.provider_id) from auth.identities i where i.user_id = camper;
$$;

-- 'banned', 'terms_required' or 'ok': may this camper post? A signed-in
-- camper can only ask about themselves (anyone else reads as 'ok'); the
-- moderator, with no camper signed in, can ask about anyone.
create or replace function moderation.camper_status(camper uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is not null and camper is distinct from auth.uid() then 'ok'
    when p.banned_at is not null
      or exists (
        select 1 from moderation.banned_identities b
        where b.hash in (select moderation.identity_hashes(camper))
      ) then 'banned'
    when p.terms_version is null or p.terms_version < moderation.current_terms_version() then 'terms_required'
    else 'ok'
  end
  from (select 1) as one
  left join public.profiles p on p.id = camper;
$$;

-- Agreeing to the terms. The app sends the version it showed; an older app
-- showing older terms is turned away.
create or replace function public.accept_terms(version integer)
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
  if version is distinct from moderation.current_terms_version() then
    raise exception 'terms_outdated' using detail = 'Update DisCamp to read the current terms.';
  end if;
  update public.profiles set terms_version = version, terms_accepted_at = now() where id = uid;
end;
$$;

-- Campers can read which terms they agreed to (the app asks before the first spot).
grant select (terms_version) on table public.profiles to authenticated;

-- Display names: no blocked words, and a banned camper can't rename.
create or replace function public.guard_profile_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;  -- the dashboard and moderator tools are trusted
  end if;
  if moderation.camper_status(old.id) = 'banned' then
    raise exception 'banned';
  end if;
  if new.display_name is distinct from old.display_name then
    if moderation.has_blocked_words(new.display_name) then
      raise exception 'blocked_words' using detail = 'Pick a name without offensive words.';
    end if;
    -- After 3 reports reset a name, it stays "Camper" until reviewed.
    if moderation.name_under_review(old.id) then
      raise exception 'name_under_review' using detail = 'Your name can change once the reports about it are reviewed.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_write on public.profiles;
create trigger profiles_guard_write
before update on public.profiles
for each row execute function public.guard_profile_write();

-- New accounts: same as 0003, but a name from the sign-in provider must pass
-- the word filter too (else "Camper"), and an account that comes back after
-- a ban starts out banned.
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
  returning_ban boolean := new.email is not null and exists (
    select 1 from moderation.banned_identities where hash = moderation.sha('email:' || new.email)
  );
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
      and char_length(candidate) <= 40
      and not moderation.has_blocked_words(candidate) then
      chosen := candidate;
      exit;
    end if;
  end loop;

  insert into public.profiles (id, display_name, banned_at, banned_reason)
  values (
    new.id,
    coalesce(chosen, 'Camper'),
    case when returning_ban then now() end,
    case when returning_ban then 'Came back after a ban' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Hidden spots ---------------------------------------------------------------

-- A hidden spot is off the map for everyone except the camper who added it.
-- Only the moderator tools (and 3 reports) hide or restore spots.
alter table public.spots add column if not exists hidden_at timestamptz;
alter table public.spots add column if not exists hidden_reason text;
alter table public.spots drop constraint if exists spots_hidden_reason_length;
alter table public.spots add constraint spots_hidden_reason_length check (char_length(hidden_reason) <= 200);

-- Same rules as 0003, plus: campers must have agreed to the current terms,
-- banned campers can't add or edit, no blocked words, and only moderators
-- hide or restore spots.
create or replace function public.guard_spot_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status text;
begin
  if current_user <> 'authenticated' then
    return new;  -- the dashboard, the seed, the service role and moderator tools are trusted
  end if;

  status := moderation.camper_status(auth.uid());
  if status <> 'ok' then
    raise exception '%', status;
  end if;
  if moderation.has_blocked_words(concat_ws(' ',
    new.name, new.land_manager, new.surface, new.cost_notes, new.directions,
    array_to_string(new.amenities, ' '), array_to_string(new.rules, ' ')
  )) then
    raise exception 'blocked_words' using detail = 'Some words aren''t allowed on DisCamp.';
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
    new.hidden_at := null;
    new.hidden_reason := null;
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
    new.hidden_at := old.hidden_at;
    new.hidden_reason := old.hidden_reason;
    new.verified := false;  -- an edited spot needs confirming again
  end if;
  return new;
end;
$$;

-- 4. Blocking campers -----------------------------------------------------------

-- "Block": you stop seeing the spots a camper adds. Private to you.
create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocks drop constraint if exists blocks_not_self;
alter table public.blocks add constraint blocks_not_self check (blocker_id <> blocked_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
revoke all on table public.blocks from anon, authenticated;
-- Visitors need to read blocks only for the spots rule below; they see none.
grant select (blocker_id, blocked_id, created_at) on table public.blocks to anon, authenticated;
grant insert (blocked_id) on table public.blocks to authenticated;
grant delete on table public.blocks to authenticated;

drop policy if exists "Campers see their own blocks" on public.blocks;
create policy "Campers see their own blocks" on public.blocks
for select to anon, authenticated
using (blocker_id = (select auth.uid()));

drop policy if exists "Campers block as themselves" on public.blocks;
create policy "Campers block as themselves" on public.blocks
for insert to authenticated
with check (blocker_id = (select auth.uid()));

drop policy if exists "Campers unblock" on public.blocks;
create policy "Campers unblock" on public.blocks
for delete to authenticated
using (blocker_id = (select auth.uid()));

-- Who you've blocked, with their names (for the Account screen). Their spots
-- are hidden from you, so the usual rule for showing names can't apply here;
-- a name shows if it's public to everyone else.
create or replace function public.my_blocks()
returns table (camper_id uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.blocked_id,
    -- Their name only if it would be public anyway (they have a spot on the map).
    case when exists (
      select 1 from public.spots s where s.created_by = b.blocked_id and s.hidden_at is null
    ) then p.display_name end,
    b.created_at
  from public.blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- 5. Which spots campers see -----------------------------------------------------

-- Everyone sees every spot, except hidden spots (only their own camper sees
-- those) and spots from campers you've blocked.
drop policy if exists "Spots are public" on public.spots;
drop policy if exists "Visible spots are public" on public.spots;
create policy "Visible spots are public" on public.spots
for select to anon, authenticated
using (
  (hidden_at is null or created_by = (select auth.uid()))
  and not exists (
    select 1 from public.blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = spots.created_by
  )
);

-- The API view gains "hidden" (true only on your own hidden spots), at the end
-- so existing columns keep their places.
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
  s.hidden_at is not null as hidden
from public.spots s
left join public.profiles p on p.id = s.created_by;

revoke all on table public.spots_api from anon, authenticated;
grant select on table public.spots_api to anon, authenticated;

-- 6. Reports ("flags") -----------------------------------------------------------

-- What the app's Report buttons send: a spot, or a camper's name. Only the
-- moderator reads them (moderation.queue). Named "flags" so they're never
-- confused with spots' report_count, which counts on-site camper reports.
create table if not exists public.flags (
  id bigint generated always as identity primary key,
  reporter_id uuid default auth.uid() references auth.users (id) on delete set null,
  spot_id text references public.spots (id) on delete cascade,
  camper_id uuid references auth.users (id) on delete cascade,
  reason text not null check (reason in ('offensive', 'spam', 'fake', 'unsafe', 'other')),
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.flags drop constraint if exists flags_one_target;
alter table public.flags add constraint flags_one_target check (num_nonnulls(spot_id, camper_id) = 1);

-- One open report per camper per spot (or name): reporting twice changes nothing.
create unique index if not exists flags_one_open_per_spot
  on public.flags (reporter_id, spot_id) where status = 'open' and spot_id is not null;
create unique index if not exists flags_one_open_per_name
  on public.flags (reporter_id, camper_id) where status = 'open' and camper_id is not null;
create index if not exists flags_open_idx on public.flags (created_at) where status = 'open';
create index if not exists flags_spot_idx on public.flags (spot_id);
create index if not exists flags_camper_idx on public.flags (camper_id);

alter table public.flags enable row level security;
revoke all on table public.flags from anon, authenticated;
grant insert (spot_id, camper_id, reason, details) on table public.flags to authenticated;

drop policy if exists "Campers report as themselves" on public.flags;
create policy "Campers report as themselves" on public.flags
for insert to authenticated
with check (reporter_id = (select auth.uid()));

-- Campers whose open report on a spot (or name) counts toward hiding it: a
-- camper whose earlier report on it was dismissed doesn't count again, so a
-- spot the moderator restored can't be hidden again by the same campers.
create or replace function moderation.open_reporters(spot text, camper uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct f.reporter_id) from public.flags f
  where f.status = 'open'
    and (f.spot_id = spot or f.camper_id = camper)
    and not exists (
      select 1 from public.flags d
      where d.status = 'dismissed' and d.reporter_id = f.reporter_id
        and (d.spot_id = f.spot_id or d.camper_id = f.camper_id)
    );
$$;

-- A name 3 campers reported stays "Camper" until the moderator reviews it.
create or replace function moderation.name_under_review(camper uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (auth.uid() is null or camper = auth.uid()) and moderation.open_reporters(null, camper) >= 3
$$;

-- Open reports on a spot (its owner can't delete it while they're open).
create or replace function moderation.has_open_flags(spot text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Campers can only ask about their own spots.
  select exists (
    select 1 from public.flags f
    where f.spot_id = spot and f.status = 'open'
      and (auth.uid() is null or exists (select 1 from public.spots s where s.id = spot and s.created_by = auth.uid()))
  )
$$;

-- How many reports a camper has sent today (campers can't read flags).
create or replace function moderation.flags_today(camper uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.flags
  where reporter_id = camper and created_at > now() - interval '1 day'
    and (auth.uid() is null or camper = auth.uid());
$$;

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
    or exists (select 1 from public.spots s where s.id = new.spot_id and s.created_by = uid) then
    raise exception 'own_content' using detail = 'You can''t report your own spot or name.';
  end if;
  -- One report at a time per camper, then at most 30 a day.
  perform pg_advisory_xact_lock(hashtextextended('discamp.flags:' || uid::text, 0));
  if moderation.flags_today(uid) >= 30 then
    raise exception 'flag_limit' using detail = 'You can send up to 30 reports a day.';
  end if;
  -- One report at a time per spot or name too, so reports sent together all
  -- count toward hiding it.
  perform pg_advisory_xact_lock(
    hashtextextended('discamp.flag-target:' || coalesce(new.spot_id, new.camper_id::text, ''), 0)
  );
  return new;
end;
$$;

drop trigger if exists flags_guard_write on public.flags;
create trigger flags_guard_write
before insert on public.flags
for each row execute function public.guard_flag_write();

-- 3 different campers reporting the same spot hides it until reviewed; 3
-- reporting the same name resets it to "Camper" (moderation.open_reporters
-- says who counts). Runs as the table owner.
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
  elsif moderation.open_reporters(null, new.camper_id) >= 3 then
    update public.profiles set display_name = 'Camper'
    where id = new.camper_id and display_name <> 'Camper';
  end if;
  return null;
end;
$$;

drop trigger if exists flags_after_insert on public.flags;
create trigger flags_after_insert
after insert on public.flags
for each row execute function moderation.after_flag();

-- A camper can't delete a spot while it's hidden or has open reports: that
-- would take it out of review (and its reports with it). Otherwise the rule
-- from 0003 stands.
drop policy if exists "Campers delete their own unconfirmed spots" on public.spots;
create policy "Campers delete their own unconfirmed spots" on public.spots
for delete to authenticated
using (
  created_by = (select auth.uid())
  and report_count = 0
  and not verified
  and hidden_at is null
  and not moderation.has_open_flags(id)
);

-- 7. Moderator tools ---------------------------------------------------------------

-- Run these in the Supabase SQL Editor (it signs in as the project owner).
-- MODERATION.md has the daily routine.

-- Open reports, one row per spot or name, oldest first.
create or replace view moderation.queue as
select
  case when f.spot_id is not null then 'spot' else 'name' end as kind,
  f.spot_id,
  s.name as spot_name,
  coalesce(f.camper_id, s.created_by) as camper_id,
  p.display_name as camper_name,
  count(*) as reports,
  count(distinct f.reporter_id) as reporters,
  string_agg(distinct f.reason, ', ') as reasons,
  string_agg(f.details, ' | ' order by f.created_at) filter (where f.details is not null) as details,
  min(f.created_at) as first_reported,
  bool_or(s.hidden_at is not null) as spot_hidden,
  bool_or(p.id is not null and moderation.camper_status(p.id) = 'banned') as camper_banned
from public.flags f
left join public.spots s on s.id = f.spot_id
left join public.profiles p on p.id = coalesce(f.camper_id, s.created_by)
where f.status = 'open'
group by 1, f.spot_id, s.name, coalesce(f.camper_id, s.created_by), p.display_name
order by min(f.created_at);

-- Take a spot off the map and close its reports.
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
end;
$$;

-- Put a spot back (or keep it up) and dismiss its reports.
create or replace function moderation.restore_spot(spot text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.spots set hidden_at = null, hidden_reason = null where id = spot;
  if not found then
    raise exception 'No spot with id %', spot;
  end if;
  update public.flags set status = 'dismissed', reviewed_at = now() where spot_id = spot and status = 'open';
end;
$$;

-- Reset a camper's name to "Camper" and close the reports about it.
create or replace function moderation.reset_name(camper uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles set display_name = 'Camper' where id = camper;
  if not found then
    raise exception 'No camper with id %', camper;
  end if;
  update public.flags set status = 'actioned', reviewed_at = now() where camper_id = camper and status = 'open';
end;
$$;

-- Keep a name and dismiss the reports about it.
create or replace function moderation.dismiss_name(camper uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.flags set status = 'dismissed', reviewed_at = now() where camper_id = camper and status = 'open';
end;
$$;

-- Ban a camper: they can't add, edit, rename or report, their spots come off
-- the map (unless keep_spots), and reports about them close. The ban holds
-- if they delete their account and sign up again with the same email or
-- sign-in (see banned_identities).
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
  -- Remembered by hash, so deleting the account doesn't lift the ban.
  insert into moderation.banned_identities (hash, reason)
  select h, reason from moderation.identity_hashes(camper) as h
  on conflict (hash) do nothing;
  if not keep_spots then
    update public.spots set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'Camper banned'
    where created_by = camper;
  end if;
  update public.flags set status = 'actioned', reviewed_at = now()
  where status = 'open'
    and (camper_id = camper or spot_id in (select id from public.spots where created_by = camper));
end;
$$;

-- Lift a ban. Their spots stay hidden; restore each one you want back.
create or replace function moderation.unban(camper uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles set banned_at = null, banned_reason = null where id = camper;
  if not found then
    raise exception 'No camper with id %', camper;
  end if;
  delete from moderation.banned_identities where hash in (select moderation.identity_hashes(camper));
end;
$$;

-- Lift a ban for an account that's already been deleted (unban needs the
-- account): forgets that email address and, if given, a sign-in.
create or replace function moderation.forget_ban(email text, provider text default null, provider_id text default null)
returns void
language sql
set search_path = ''
as $$
  delete from moderation.banned_identities
  where hash = moderation.sha('email:' || email)
     or (provider is not null and hash = moderation.sha(provider || ':' || provider_id));
$$;

-- Add a word or phrase to the filter (whole words: "litter bug" blocks
-- "Litter-Bug" but not "litterbugs").
create or replace function moderation.block_word(word text)
returns void
language sql
set search_path = ''
as $$
  insert into moderation.word_rules (rule, kind)
  values (' ' || btrim(regexp_replace(lower(word), '[^a-z]+', ' ', 'g')) || ' ', 'block')
  on conflict (rule) do nothing;
$$;

-- Let a phrase through that the filter wrongly blocks (say, a real place name).
create or replace function moderation.allow_phrase(phrase text)
returns void
language sql
set search_path = ''
as $$
  insert into moderation.word_rules (rule, kind)
  values (btrim(regexp_replace(lower(phrase), '[^a-z]+', ' ', 'g')), 'allow')
  on conflict (rule) do update set kind = 'allow';
$$;

-- Find a camper's id by (part of) their name.
create or replace function moderation.find_camper(name_like text)
returns table (camper_id uuid, display_name text, spots bigint, banned boolean)
language sql
stable
set search_path = ''
as $$
  select p.id, p.display_name, count(s.id), moderation.camper_status(p.id) = 'banned'
  from public.profiles p
  left join public.spots s on s.created_by = p.id
  where p.display_name ilike '%' || name_like || '%'
  group by p.id
  order by p.display_name;
$$;

-- 8. Who may run what ---------------------------------------------------------------

-- Campers' writes run the checks above as themselves, so those few need to
-- be callable. Everything else in the moderation schema stays owner-only.
revoke all on all tables in schema moderation from public, anon, authenticated;
revoke execute on all functions in schema moderation from public, anon, authenticated;
grant usage on schema moderation to authenticated;
grant execute on function moderation.has_blocked_words(text) to authenticated;
grant execute on function moderation.camper_status(uuid) to authenticated;
grant execute on function moderation.current_terms_version() to authenticated;
grant execute on function moderation.flags_today(uuid) to authenticated;
grant execute on function moderation.normalize_text(text) to authenticated;
grant execute on function moderation.name_under_review(uuid) to authenticated;
grant execute on function moderation.has_open_flags(text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.accept_terms(integer) from public, anon, authenticated;
grant execute on function public.accept_terms(integer) to authenticated;
revoke execute on function public.my_blocks() from public, anon, authenticated;
grant execute on function public.my_blocks() to authenticated;
revoke execute on function public.guard_profile_write() from public, anon, authenticated;
revoke execute on function public.guard_spot_write() from public, anon, authenticated;
revoke execute on function public.guard_flag_write() from public, anon, authenticated;
