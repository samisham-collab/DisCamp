// Quality checks for the starter spots in src/data/seeds/: each region file
// on its own (so one bad file doesn't hide another's problems), then all of
// them together.

import { describe, expect, it } from '@jest/globals';

import { SEED_SPOTS } from '@/data/seedSpots';
import { distanceMeters } from '@/lib/geo';
import { spotSchema } from '@/lib/schemas';
import type { Spot } from '@/types';

const REGIONS = {
  southwest: 'SOUTHWEST_SPOTS',
  rockies: 'ROCKIES_SPOTS',
  pacific: 'PACIFIC_SPOTS',
  east: 'EAST_SPOTS',
} as const;

function load(region: keyof typeof REGIONS): Spot[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(`@/data/seeds/${region}`) as Record<string, Spot[]>;
  return mod[REGIONS[region]] ?? [];
}

/** Problems with one spot, in words (empty when it's fine). */
function problemsWith(spot: Spot): string[] {
  const problems: string[] = [];
  const parsed = spotSchema.safeParse(spot);
  if (!parsed.success) {
    problems.push(...parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  // The lower 48 (no seed spots in Alaska or Hawaii yet).
  if (spot.latitude < 24.5 || spot.latitude > 49.5) problems.push('latitude outside the lower 48');
  if (spot.longitude < -125 || spot.longitude > -66.9) problems.push('longitude outside the lower 48');
  if (spot.sources.length === 0) problems.push('no sources');
  if (spot.verified) problems.push('starter spots start unverified');
  if (spot.reportCount !== 0) problems.push('starter spots start with no reports');
  if (spot.createdBy || spot.addedBy) problems.push('starter spots have no camper');
  if (spot.siteType === 'dispersed') {
    if (spot.cost.hookups && spot.cost.hookups.length > 0) problems.push('dispersed spots have no hookups');
    if (spot.cost.reservations === 'reservable') problems.push('dispersed spots are not reservable');
  }
  if (/\bKOA\b/.test(spot.name)) {
    if (spot.siteType !== 'campground') problems.push('a KOA is a campground');
    if (!/KOA/.test(spot.landManager)) problems.push('a KOA names KOA as the land manager');
  }
  return problems;
}

describe.each(Object.keys(REGIONS) as (keyof typeof REGIONS)[])('%s starter spots', (region) => {
  it('load, and each one is complete', () => {
    const spots = load(region);
    const problems = spots.flatMap((spot) => problemsWith(spot).map((p) => `${spot.id}: ${p}`));
    expect(problems).toEqual([]);
  });
});

describe('all starter spots', () => {
  it('have unique ids and names', () => {
    const ids = SEED_SPOTS.map((s) => s.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const names = SEED_SPOTS.map((s) => s.name.toLowerCase());
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('are not the same place twice (at least 150 m apart)', () => {
    const close: string[] = [];
    SEED_SPOTS.forEach((a, i) => {
      SEED_SPOTS.slice(i + 1).forEach((b) => {
        if (distanceMeters(a, b) < 150) close.push(`${a.id} / ${b.id}`);
      });
    });
    expect(close).toEqual([]);
  });

  it('include dispersed spots and KOA campgrounds', () => {
    expect(SEED_SPOTS.filter((s) => s.siteType === 'dispersed').length).toBeGreaterThan(0);
    expect(SEED_SPOTS.some((s) => /\bKOA\b/.test(s.name))).toBe(true);
  });
});
