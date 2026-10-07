// Builds supabase/seed.sql from the starter spots in src/data/seedSpots.ts,
// so the app's bundled spots and the database seed can never drift apart.
// Regenerate with: npm run seed:sql

import type { Spot } from '../src/types';

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const text = (s: string | null | undefined) => (s == null ? 'null' : quote(s));
const bool = (b: boolean | null) => (b == null ? 'null' : b ? 'true' : 'false');
const num = (n: number | null) => (n == null ? 'null' : String(n));
const textArray = (items: readonly string[]) =>
  items.length === 0 ? `'{}'::text[]` : `array[${items.map(quote).join(', ')}]::text[]`;

const COLUMNS = [
  'id',
  'name',
  'location',
  'site_type',
  'land_manager',
  'stay_limit_days',
  'clearance_tier',
  'drivetrain',
  'surface',
  'impassable_when_wet',
  'tent',
  'rtt',
  'van',
  'max_trailer_ft',
  'big_rig',
  'turnaround',
  'nightly_fee_usd',
  'rv_fee_usd',
  'hookups',
  'reservations',
  'cost_notes',
  'amenities',
  'rules',
  'directions',
  'phone',
  'sources',
  'verified',
  'report_count',
] as const;

function values(s: Spot): string[] {
  return [
    text(s.id),
    text(s.name),
    `extensions.st_setsrid(extensions.st_makepoint(${s.longitude}, ${s.latitude}), 4326)::extensions.geography`,
    text(s.siteType),
    text(s.landManager),
    num(s.stayLimitDays),
    num(s.access.clearanceTier),
    text(s.access.drivetrain),
    text(s.access.surface),
    bool(s.access.impassableWhenWet),
    bool(s.fit.tent),
    bool(s.fit.rtt),
    bool(s.fit.van),
    num(s.fit.maxTrailerFt),
    bool(s.fit.bigRig),
    bool(s.fit.turnaround),
    num(s.cost.nightlyFeeUsd),
    num(s.cost.rvFeeUsd),
    textArray(s.cost.hookups),
    text(s.cost.reservations),
    text(s.cost.notes),
    textArray(s.amenities),
    textArray(s.rules),
    text(s.directions),
    text(s.phone),
    `${quote(JSON.stringify(s.sources))}::jsonb`,
    bool(s.verified),
    num(s.reportCount),
  ];
}

/**
 * Filled in by campers over time, so re-running the seed must never reset them.
 * New spots still get the seed's values; existing spots keep their own.
 */
const COMMUNITY_COLUMNS: ReadonlySet<string> = new Set(['verified', 'report_count']);

export function buildSeedSql(spots: readonly Spot[]): string {
  const updates = COLUMNS.filter((c) => c !== 'id' && !COMMUNITY_COLUMNS.has(c))
    .map((c) => `  ${c} = excluded.${c}`)
    .join(',\n');
  const rows = spots
    .map((s) => {
      const v = values(s);
      if (v.length !== COLUMNS.length)
        throw new Error(`Seed row for ${s.id} has ${v.length} values, expected ${COLUMNS.length}`);
      return `(\n  ${v.join(',\n  ')}\n)`;
    })
    .join(',\n');
  return [
    '-- GENERATED FILE: do not edit by hand.',
    '-- Source: src/data/seedSpots.ts. Regenerate with `npm run seed:sql`.',
    '-- Run after every file in supabase/migrations. Safe to run again: it refreshes the',
    "-- starter spots' details but keeps camper-earned fields (verified, report_count).",
    '',
    `insert into public.spots (\n  ${COLUMNS.join(', ')}\n) values\n${rows}\non conflict (id) do update set\n${updates};`,
    '',
  ].join('\n');
}
