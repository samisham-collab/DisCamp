-- GENERATED FILE: do not edit by hand.
-- Source: src/data/seedSpots.ts. Regenerate with `npm run seed:sql`.
-- Run after every file in supabase/migrations. Safe to run again: it refreshes the
-- starter spots' details but keeps camper-earned fields (verified, report_count).

insert into public.spots (
  id, name, location, site_type, land_manager, stay_limit_days, clearance_tier, drivetrain, surface, impassable_when_wet, tent, rtt, van, max_trailer_ft, big_rig, turnaround, nightly_fee_usd, rv_fee_usd, hookups, reservations, cost_notes, amenities, rules, directions, phone, sources, verified, report_count
) values
(
  'smoky-gardens',
  'Smoky Gardens',
  extensions.st_setsrid(extensions.st_makepoint(-101.76, 39.19), 4326)::extensions.geography,
  'campground',
  'Sherman County · Soldiers Memorial Park',
  null,
  2,
  '2wd-ok',
  'Highway 27, then county roads',
  null,
  true,
  true,
  true,
  null,
  true,
  null,
  0,
  20,
  array['electric', 'water']::text[],
  'not-needed',
  '15 RV sites with electric and water, first come, first served. Dry camping anywhere in the park is free.',
  array['Stocked fishing lake', 'Restroom', 'Walking trails', '9-hole disc golf', 'Picnic shelters', 'Playground', 'Boat ramp']::text[],
  array['Kansas fishing license required', 'No swimming', 'Boats allowed: life jackets required, no gas motors', 'No park pass needed']::text[],
  'From Goodland, take Highway 27 south 6 miles. Turn right (west) on County Road 57 for 2 miles, left (south) on County Road 17 for 3 miles, then left into Soldiers Memorial Park.',
  '(785) 899-6334',
  '[{"label":"Sherman County Community Development: Lodging","url":"https://www.thetopsideofkansas.org/community/plan-your-visit/lodging"},{"label":"Sherman County Community Development: Soldiers Memorial Park","url":"https://www.thetopsideofkansas.org/community/plan-your-visit/attractions/soldiers-memorial-park"},{"label":"PDGA: Smoky Gardens Disc Golf Course","url":"https://www.pdga.com/course-directory/course/smoky-gardens-disc-golf-course"}]'::jsonb,
  false,
  0
)
on conflict (id) do update set
  name = excluded.name,
  location = excluded.location,
  site_type = excluded.site_type,
  land_manager = excluded.land_manager,
  stay_limit_days = excluded.stay_limit_days,
  clearance_tier = excluded.clearance_tier,
  drivetrain = excluded.drivetrain,
  surface = excluded.surface,
  impassable_when_wet = excluded.impassable_when_wet,
  tent = excluded.tent,
  rtt = excluded.rtt,
  van = excluded.van,
  max_trailer_ft = excluded.max_trailer_ft,
  big_rig = excluded.big_rig,
  turnaround = excluded.turnaround,
  nightly_fee_usd = excluded.nightly_fee_usd,
  rv_fee_usd = excluded.rv_fee_usd,
  hookups = excluded.hookups,
  reservations = excluded.reservations,
  cost_notes = excluded.cost_notes,
  amenities = excluded.amenities,
  rules = excluded.rules,
  directions = excluded.directions,
  phone = excluded.phone,
  sources = excluded.sources;
