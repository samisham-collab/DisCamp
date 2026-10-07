-- DisCamp database, step 2: tighter access and data checks.
-- Run after 0001_init.sql. Safe to run more than once.

-- 1. Read-only for the app ---------------------------------------------------
-- Supabase gives the API roles (anon, authenticated) every privilege on new
-- tables by default and relies on row-level security to stop writes. RLS does
-- not cover TRUNCATE, so grant exactly what the app needs: reading spots.
-- Adding and editing spots from the app comes with sign-in in a later sprint.
revoke all on table public.spots, public.spots_api from anon, authenticated;
grant select on table public.spots, public.spots_api to anon, authenticated;

-- The trigger function never needs to be called directly (triggers still run).
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- 2. Data checks the app relies on ------------------------------------------
-- Each check is dropped and re-added so this file can run again safely.

-- Names must contain something other than whitespace (tabs and newlines too,
-- not just spaces).
alter table public.spots drop constraint if exists spots_name_visible;
alter table public.spots add constraint spots_name_visible check (name ~ '[^[:space:]]');
alter table public.spots drop constraint if exists spots_land_manager_visible;
alter table public.spots add constraint spots_land_manager_visible check (land_manager ~ '[^[:space:]]');

-- A real point on the map: not empty, and finite (PostGIS accepts NaN).
alter table public.spots drop constraint if exists spots_location_valid;
alter table public.spots add constraint spots_location_valid check (
  not extensions.st_isempty(location::extensions.geometry)
  and extensions.st_x(location::extensions.geometry) between -180 and 180
  and extensions.st_y(location::extensions.geometry) between -90 and 90
);

-- Lists are flat (no nested arrays), have no empty (NULL) items, and stay a
-- reasonable size. An empty list has no dimensions, hence the coalesce.
alter table public.spots drop constraint if exists spots_hookups_flat;
alter table public.spots add constraint spots_hookups_flat check (
  coalesce(array_ndims(hookups), 1) = 1 and array_position(hookups, null) is null
);
alter table public.spots drop constraint if exists spots_amenities_flat;
alter table public.spots add constraint spots_amenities_flat check (
  coalesce(array_ndims(amenities), 1) = 1
  and array_position(amenities, null) is null
  and coalesce(array_length(amenities, 1), 0) <= 30
);
alter table public.spots drop constraint if exists spots_rules_flat;
alter table public.spots add constraint spots_rules_flat check (
  coalesce(array_ndims(rules), 1) = 1
  and array_position(rules, null) is null
  and coalesce(array_length(rules, 1), 0) <= 30
);

-- Phone numbers need 7 to 15 actual digits (the international maximum), not
-- just phone-like punctuation.
alter table public.spots drop constraint if exists spots_phone_digits;
alter table public.spots add constraint spots_phone_digits check (
  phone is null or length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15
);
