// Shared test data.

import { RIG_PRESETS } from '@/lib/rigPresets';
import type { Rig, Spot } from '@/types';

export function preset(name: string): Rig {
  const rig = RIG_PRESETS.find((r) => r.name === name);
  if (!rig) throw new Error(`No preset named ${name}`);
  return rig;
}

export const baseSpot: Spot = {
  id: 'test-spot',
  name: 'Test spot',
  latitude: 39.2,
  longitude: -101.7,
  siteType: 'dispersed',
  landManager: 'BLM',
  stayLimitDays: 14,
  access: { clearanceTier: 4, drivetrain: '2wd-ok', surface: 'Rocky dirt', impassableWhenWet: false },
  fit: { tent: true, rtt: true, van: true, maxTrailerFt: 25, bigRig: false, turnaround: false },
  cost: { nightlyFeeUsd: 0, rvFeeUsd: null, hookups: [], reservations: 'not-needed' },
  amenities: [],
  rules: [],
  verified: true,
  reportCount: 3,
  sources: [],
};

export function makeSpot(
  patch: Partial<Omit<Spot, 'access' | 'fit' | 'cost'>> & {
    access?: Partial<Spot['access']>;
    fit?: Partial<Spot['fit']>;
    cost?: Partial<Spot['cost']>;
  } = {},
): Spot {
  const { access, fit, cost, ...rest } = patch;
  return {
    ...baseSpot,
    ...rest,
    access: { ...baseSpot.access, ...access },
    fit: { ...baseSpot.fit, ...fit },
    cost: { ...baseSpot.cost, ...cost },
  };
}

/** A database row for `spots_api`, as Supabase would return it. */
export function makeRow(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'row-spot',
    name: 'Row spot',
    latitude: 39.19,
    longitude: -101.76,
    site_type: 'campground',
    land_manager: 'Sherman County',
    stay_limit_days: 14,
    clearance_tier: 2,
    drivetrain: '2wd-ok',
    surface: 'Gravel',
    impassable_when_wet: false,
    tent: true,
    rtt: true,
    van: true,
    max_trailer_ft: 40,
    big_rig: true,
    turnaround: true,
    nightly_fee_usd: 0,
    rv_fee_usd: '20.00',
    hookups: ['electric', 'water'],
    reservations: 'first-come',
    cost_notes: 'Hookups first come, first served.',
    amenities: ['Restroom'],
    rules: ['No swimming'],
    directions: 'South on Highway 27.',
    phone: '(785) 899-6334',
    sources: [{ label: 'County site', url: 'https://example.org/park' }],
    verified: true,
    report_count: 5,
    ...patch,
  };
}
