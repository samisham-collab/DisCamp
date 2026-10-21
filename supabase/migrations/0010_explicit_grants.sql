-- DisCamp 1.8.0: every table and view in public gets its grants written out.
--
-- Until October 30, 2026, Supabase gave the API roles (anon, authenticated and
-- service_role) select, insert, update and delete on every new table in public
-- by default. From then on, new tables get nothing until a migration grants
-- it. That covers new projects, preview branches and `supabase db reset` too:
-- https://supabase.com/changelog/45329
--
-- The app's roles already have explicit grants: every earlier migration
-- revokes everything from anon and authenticated, then grants exactly what
-- the app needs. The service role was still relying on the default. The
-- report-alert Edge Function reads spots, profiles, flags, photos, check-ins
-- and cleanups with the service-role key, so on a project set up after
-- October 30 it would get "permission denied".
--
-- This grants the service role what it has today on DisCamp's existing
-- project, so a new project and the existing one match. It changes nothing
-- for anon or authenticated, and nothing on a project that already has these
-- grants. Row-level security still applies to everyone but the service role,
-- which bypasses it, as before.
--
-- A new table in public needs its own grants, in the same migration that
-- creates it (the database tests check this).
--
-- Run after 0009 (scripts/setup-database.sh does it). Safe to run twice.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.spots,
  public.profiles,
  public.blocks,
  public.flags,
  public.spot_photos,
  public.checkins,
  public.cleanup_tasks,
  public.cleanup_completions,
  public.embers,
  public.push_tokens
to service_role;

grant select on table
  public.spots_api,
  public.spot_photos_api,
  public.checkins_api,
  public.cleanup_tasks_api,
  public.embers_api
to service_role;
