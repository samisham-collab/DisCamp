-- DisCamp database: spots with access, fit and cost fields.
-- Run this first in the Supabase SQL editor (or with `supabase db push`),
-- then run supabase/seed.sql to add the starter spots.
-- NULL means "not reported yet", same as in the app.

-- Supabase already has the extensions schema; creating it keeps this file
-- usable on a self-hosted Postgres too.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table if not exists public.spots (
  id                  text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  name                text not null check (length(trim(name)) between 1 and 120),
  location            extensions.geography(point, 4326) not null,
  site_type           text not null check (site_type in ('dispersed', 'campground')),
  land_manager        text not null check (length(trim(land_manager)) between 1 and 120),
  stay_limit_days     smallint check (stay_limit_days between 1 and 365),

  -- Access
  clearance_tier      smallint check (clearance_tier between 1 and 7),
  drivetrain          text check (drivetrain in ('2wd-ok', 'awd-recommended', '4wd-required', '4wd-lockers')),
  surface             text check (length(surface) <= 200),
  impassable_when_wet boolean,

  -- Who fits
  tent                boolean,
  rtt                 boolean,
  van                 boolean,
  max_trailer_ft      smallint check (max_trailer_ft between 0 and 100),
  big_rig             boolean,
  turnaround          boolean,

  -- Cost meter
  nightly_fee_usd     numeric(7, 2) check (nightly_fee_usd between 0 and 10000),
  rv_fee_usd          numeric(7, 2) check (rv_fee_usd between 0 and 10000),
  hookups             text[] not null default '{}' check (hookups <@ array['electric', 'water', 'sewer']),
  reservations        text check (reservations in ('first-come', 'reservable', 'not-needed')),
  cost_notes          text check (length(cost_notes) <= 500),

  amenities           text[] not null default '{}',
  rules               text[] not null default '{}',
  directions          text check (length(directions) <= 1000),
  phone               text check (phone ~ '^\+?[0-9 ().-]{7,25}$'),
  sources             jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
  verified            boolean not null default false,
  report_count        integer not null default 0 check (report_count >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists spots_location_idx on public.spots using gist (location);

-- Keep updated_at current on every edit.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists spots_set_updated_at on public.spots;
create trigger spots_set_updated_at
before update on public.spots
for each row execute function public.set_updated_at();

-- The app reads this view: it turns the PostGIS point into plain latitude/longitude.
-- security_invoker means the view follows the table's row-level security.
create or replace view public.spots_api
with (security_invoker = true) as
select
  id, name,
  extensions.st_y(location::extensions.geometry) as latitude,
  extensions.st_x(location::extensions.geometry) as longitude,
  site_type, land_manager, stay_limit_days,
  clearance_tier, drivetrain, surface, impassable_when_wet,
  tent, rtt, van, max_trailer_ft, big_rig, turnaround,
  nightly_fee_usd, rv_fee_usd, hookups, reservations, cost_notes,
  amenities, rules, directions, phone, sources, verified, report_count
from public.spots;

-- Row-level security: anyone can read spots. There are no insert, update or
-- delete policies, so the app can't change data yet. Adding spots from the
-- app comes with sign-in in a later sprint.
alter table public.spots enable row level security;

drop policy if exists "Spots are public" on public.spots;
create policy "Spots are public" on public.spots for select to anon, authenticated using (true);

grant select on public.spots_api to anon, authenticated;
