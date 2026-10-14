-- DisCamp 1.5.1: "Still good" once per spot every 30 days, and taking it back.
--
--   1. A camper can say "Still good" about a spot once every 30 days (it was
--      once a day). Change reports stay once per kind, per spot, per day.
--   2. A change report takes back that camper's "Still good" on the spot: it
--      stops counting toward the spot's confirmed date and toward confirming
--      the spot. The check-in itself stays (withdrawn_at), so Embers (1.6)
--      can still count each camper's first "Still good" per spot, and a
--      taken-back one still counts toward the 30 days.
--   3. checkins_api leaves out taken-back check-ins, except the camper's own
--      (so the app can say when they can confirm again), and says which.
--
-- Run after 0006 (scripts/setup-database.sh does it). Safe to run twice.

-- 1. When a "Still good" was taken back -------------------------------------------

alter table public.checkins add column if not exists withdrawn_at timestamptz;
grant select (withdrawn_at) on table public.checkins to anon, authenticated;

-- Check-ins this camper sent: of a kind, on a spot, recently ("Still good":
-- 30 days, taken-back ones included; changes: 20 hours), or in the last day
-- (spot null). Campers can only ask about themselves.
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
      when what = 'still_good' then spot_id = spot and kind = what and created_at > now() - interval '30 days'
      else spot_id = spot and kind = what and created_at > now() - interval '20 hours'
    end;
$$;

-- Campers (other than the one who added it) whose "Still good" on a spot
-- counts: not hidden, not taken back, and since the spot's last edit.
create or replace function moderation.confirmations(spot text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct c.camper_id) from public.checkins c
  join public.spots s on s.id = c.spot_id
  where c.spot_id = spot and c.kind = 'still_good'
    and c.hidden_at is null and c.withdrawn_at is null
    and c.camper_id is distinct from s.created_by
    and c.created_at > coalesce(s.edited_at, '-infinity');
$$;

-- As in 0006, with its own answer when a "Still good" comes too soon.
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
  new.withdrawn_at := null;
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
    if new.kind = 'still_good' then
      raise exception 'confirmed_recently' using detail = 'You can confirm a spot once every 30 days.';
    end if;
    raise exception 'checkin_recent' using detail = 'You already said that about this spot today.';
  end if;
  if moderation.checkin_count(uid, null, null) >= 50 then
    raise exception 'checkin_limit' using detail = 'You can check in up to 50 times a day.';
  end if;
  return new;
end;
$$;

-- 2. After a check-in ---------------------------------------------------------------

-- Every check-in is an on-site report. Two campers other than the one who
-- added a spot saying "Still good" since its last edit confirm it. A change
-- report takes back the same camper's "Still good" here, and a camper-added
-- spot it confirmed stops being confirmed if that leaves fewer than two.
-- (Starter spots stay as they are: you may have confirmed one yourself.)
-- Runs as the table owner.
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
  return null;
end;
$$;

-- 3. What the app reads -----------------------------------------------------------

-- Check-ins with the camper's name, newest first. Taken-back ones only for
-- the camper who sent them, marked as such (added at the end).
create or replace view public.checkins_api
with (security_invoker = true) as
select
  c.id, c.spot_id, c.camper_id, p.display_name as camper_name, c.kind, c.note, c.created_at,
  c.withdrawn_at is not null as withdrawn
from public.checkins c
left join public.profiles p on p.id = c.camper_id
where c.withdrawn_at is null or c.camper_id = (select auth.uid());

revoke all on table public.checkins_api from anon, authenticated;
grant select on table public.checkins_api to anon, authenticated;

-- The map's spots, as in 0006, except that a taken-back "Still good" no
-- longer sets the confirmed date (or holds back older change reports).
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
  where c.spot_id = s.id and c.kind = 'still_good' and c.withdrawn_at is null
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

-- 4. Who may run what ------------------------------------------------------------

revoke execute on function moderation.confirmations(text) from public, anon, authenticated;
