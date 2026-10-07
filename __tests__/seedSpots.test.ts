// Checks the starter spots themselves: well-formed, in the right state, and
// rated the way their sources describe for each preset rig.

import { describe, expect, it } from '@jest/globals';

import { SEED_SPOTS } from '@/data/seedSpots';
import { costForRig } from '@/lib/cost';
import { fitFor, type FitStatus } from '@/lib/fit';
import { RIG_PRESETS } from '@/lib/rigPresets';
import { spotSchema } from '@/lib/schemas';
import type { Spot } from '@/types';

/** Rough state outlines (south, north, west, east) to catch swapped or mistyped coordinates. */
const STATES = {
  KS: [37, 40, -102.05, -94.59],
  ID: [42, 49, -117.25, -111.04],
  WA: [45.54, 49, -124.85, -116.91],
  SD: [42.48, 45.95, -104.06, -96.44],
} as const;

const EXPECTED_STATE: Record<string, keyof typeof STATES> = {
  'smoky-gardens': 'KS',
  'sublett-dam': 'ID',
  'sublett-campground': 'ID',
  'south-fork-sublett-creek': 'ID',
  'forest-road-46-packwood': 'WA',
  'forest-road-356-black-hills': 'SD',
};

const byId = (id: string): Spot => {
  const spot = SEED_SPOTS.find((s) => s.id === id);
  if (!spot) throw new Error(`No starter spot ${id}`);
  return spot;
};

describe('starter spots', () => {
  it('are the expected set, with unique ids and names', () => {
    expect(SEED_SPOTS.map((s) => s.id).sort()).toEqual(Object.keys(EXPECTED_STATE).sort());
    expect(new Set(SEED_SPOTS.map((s) => s.name)).size).toBe(SEED_SPOTS.length);
  });

  it.each(SEED_SPOTS.map((s) => [s.id, s] as const))('%s is valid and sits in its state', (id, spot) => {
    const parsed = spotSchema.safeParse(spot);
    expect(parsed.success ? 'valid' : parsed.error.issues).toBe('valid');
    const [south, north, west, east] = STATES[EXPECTED_STATE[id]!];
    expect(spot.latitude).toBeGreaterThan(south);
    expect(spot.latitude).toBeLessThan(north);
    expect(spot.longitude).toBeGreaterThan(west);
    expect(spot.longitude).toBeLessThan(east);
  });

  it.each(SEED_SPOTS.map((s) => [s.id, s] as const))(
    '%s cites https sources and is marked unconfirmed',
    (_id, spot) => {
      expect(spot.sources.length).toBeGreaterThan(0);
      for (const source of spot.sources) expect(source.url).toMatch(/^https:\/\//);
      // Nobody has confirmed these on site yet, and no camper has reported.
      expect(spot.verified).toBe(false);
      expect(spot.reportCount).toBe(0);
      expect(spot.phone).toBeTruthy();
      expect(spot.directions).toBeTruthy();
    },
  );

  it('puts the Sublett spots within a few miles of each other', () => {
    const lats = ['sublett-dam', 'sublett-campground', 'south-fork-sublett-creek'].map((id) => byId(id).latitude);
    expect(Math.max(...lats) - Math.min(...lats)).toBeLessThan(0.05);
  });
});

describe('starter spots for each preset rig', () => {
  // What each preset sees, worked out by hand from the sources. If a change
  // to a spot or to the fit rules moves one of these, check it was meant to.
  const EXPECTED: Record<string, Record<string, FitStatus>> = {
    Sedan: {
      'smoky-gardens': 'fits',
      'sublett-dam': 'fits',
      'sublett-campground': 'tight', // washboard road, C3
      'south-fork-sublett-creek': 'unknown', // no road reports yet
      'forest-road-46-packwood': 'fits',
      'forest-road-356-black-hills': 'tight', // bumpy, rutted, C3
    },
    'Mid-size 4x4 + RTT': {
      'smoky-gardens': 'fits',
      'sublett-dam': 'fits',
      'sublett-campground': 'fits',
      'south-fork-sublett-creek': 'unknown',
      'forest-road-46-packwood': 'fits',
      'forest-road-356-black-hills': 'fits',
    },
    'Camper van': {
      'smoky-gardens': 'fits',
      'sublett-dam': 'fits',
      'sublett-campground': 'fits',
      'south-fork-sublett-creek': 'unknown',
      'forest-road-46-packwood': 'fits',
      'forest-road-356-black-hills': 'fits',
    },
    'Truck + 25 ft trailer': {
      'smoky-gardens': 'unknown', // max length not reported
      'sublett-dam': 'fits', // up to 35 ft
      'sublett-campground': 'no', // up to 20 ft
      'south-fork-sublett-creek': 'unknown',
      'forest-road-46-packwood': 'unknown',
      'forest-road-356-black-hills': 'fits', // a 30 ft trailer made it
    },
    '40 ft Class A': {
      'smoky-gardens': 'unknown', // turnaround and length not reported
      'sublett-dam': 'no',
      'sublett-campground': 'no',
      'south-fork-sublett-creek': 'unknown',
      'forest-road-46-packwood': 'unknown',
      'forest-road-356-black-hills': 'no',
    },
  };

  it.each(RIG_PRESETS.map((r) => [r.name, r] as const))('%s', (name, rig) => {
    const actual = Object.fromEntries(SEED_SPOTS.map((s) => [s.id, fitFor(s, rig).status]));
    expect(actual).toEqual(EXPECTED[name]);
  });

  it('tells a 25 ft trailer exactly why Sublett Campground is out', () => {
    const trailer = RIG_PRESETS.find((r) => r.name === 'Truck + 25 ft trailer')!;
    expect(fitFor(byId('sublett-campground'), trailer).reasons).toEqual(['Fits up to 20 ft; yours is 25 ft']);
  });

  it('prices every new spot as free for every rig', () => {
    for (const spot of SEED_SPOTS.filter((s) => s.id !== 'smoky-gardens')) {
      for (const rig of RIG_PRESETS) {
        expect(costForRig(spot, rig)).toMatchObject({ feeUsd: 0, level: 0 });
      }
    }
  });
});
