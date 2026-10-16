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
  AR: [33, 36.5, -94.62, -89.64],
  AZ: [31.33, 37, -114.82, -109.04],
  CA: [32.53, 42, -124.42, -114.13],
  CO: [37, 41, -109.06, -102.04],
  ID: [42, 49, -117.25, -111.04],
  KS: [37, 40, -102.05, -94.59],
  MI: [41.7, 48.3, -90.42, -82.12],
  MO: [35.99, 40.61, -95.77, -89.1],
  MT: [44.36, 49, -116.05, -104.04],
  ND: [45.94, 49, -104.05, -96.55],
  NE: [40, 43, -104.05, -95.31],
  NH: [42.7, 45.31, -72.56, -70.6],
  NM: [31.33, 37, -109.05, -103],
  NV: [35, 42, -120, -114.04],
  OR: [41.99, 46.29, -124.57, -116.46],
  PA: [39.72, 42.27, -80.52, -74.69],
  SD: [42.48, 45.95, -104.06, -96.44],
  TN: [34.98, 36.68, -90.31, -81.65],
  TX: [25.84, 36.5, -106.65, -93.51],
  UT: [37, 42, -114.05, -109.04],
  VA: [36.54, 39.47, -83.68, -75.24],
  WA: [45.54, 49, -124.85, -116.91],
  WV: [37.2, 40.64, -82.64, -77.72],
  WY: [41, 45, -111.06, -104.05],
} as const;

const EXPECTED_STATE: Record<string, keyof typeof STATES> = {
  'smoky-gardens': 'KS',
  'sublett-dam': 'ID',
  'sublett-campground': 'ID',
  'south-fork-sublett-creek': 'ID',
  'forest-road-46-packwood': 'WA',
  'forest-road-356-black-hills': 'SD',
  // src/data/seeds/ (1.7.0)
  'forest-road-525-surprise-sedona': 'AZ',
  'forest-road-302-tusayan': 'AZ',
  'grand-canyon-south-rim-koa-holiday': 'AZ',
  'alabama-hills-movie-road': 'CA',
  'joshua-tree-south-blm': 'CA',
  'kelso-dunes-mine-mojave': 'CA',
  'sunrise-rock-mojave': 'CA',
  'barstow-calico-koa-holiday': 'CA',
  'whitney-pocket-gold-butte': 'NV',
  'chosa-blm-carlsbad-caverns': 'NM',
  'carlsbad-koa-holiday': 'NM',
  'cattlemen-trail-gila': 'NM',
  'moab-koa-holiday': 'UT',
  'valley-of-the-gods': 'UT',
  'hurricane-cliffs-sheep-bridge': 'UT',
  'kenosha-pass-dispersed': 'CO',
  'alta-lakes-telluride': 'CO',
  'denver-east-strasburg-koa': 'CO',
  'nip-and-tuck-road-stanley': 'ID',
  'goodland-koa': 'KS',
  'osage-state-fishing-lake': 'KS',
  'west-fork-denny-creek-west-yellowstone': 'MT',
  'yellowstone-park-west-gate-koa': 'MT',
  'pine-ridge-fr-714a-chadron': 'NE',
  'scoria-pit-medora': 'ND',
  'pinnacles-nomad-view-wall': 'SD',
  'mount-rushmore-koa-palmer-gulch': 'SD',
  'shadow-mountain-jackson': 'WY',
  'vedauwoo-fr-700': 'WY',
  'forest-road-29-sappho': 'WA',
  'old-cascade-highway-skykomish': 'WA',
  'concrete-grandy-creek-koa': 'WA',
  'trillium-lake-airstrip': 'OR',
  'forest-road-4606-sisters': 'OR',
  'redmond-central-oregon-koa': 'OR',
  'alvord-desert-playa': 'OR',
  'sand-flat-mount-shasta': 'CA',
  'mount-shasta-city-koa': 'CA',
  'north-manzanita-lassen': 'CA',
  'hardin-flat-road-yosemite': 'CA',
  'big-meadows-road-sequoia': 'CA',
  'morgan-mountain-road-spy-rock-ozark': 'AR',
  'harrison-koa-holiday': 'AR',
  'search-bay-hiawatha': 'MI',
  'st-ignace-mackinac-island-koa-holiday': 'MI',
  'sugar-camp-lookout-tower-mark-twain': 'MO',
  'gale-river-loop-road-white-mountain': 'NH',
  'twin-mountain-mt-washington-koa-holiday': 'NH',
  'clarion-river-campsites-allegheny': 'PA',
  'gatlinburg-east-smoky-mountain-koa-holiday': 'TN',
  'hunter-camp-217a-sam-houston': 'TX',
  'flagpole-knob-george-washington': 'VA',
  'gandy-creek-dispersed-monongahela': 'WV',
};

/** The first six spots, rated by hand for each preset rig below. */
const HAND_RATED = Object.keys(EXPECTED_STATE).slice(0, 6);

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
    const actual = Object.fromEntries(HAND_RATED.map((id) => [id, fitFor(byId(id), rig).status]));
    expect(actual).toEqual(EXPECTED[name]);
  });

  it('rates every starter spot for every preset rig', () => {
    for (const spot of SEED_SPOTS) {
      for (const rig of RIG_PRESETS) {
        expect(['fits', 'tight', 'no', 'unknown']).toContain(fitFor(spot, rig).status);
      }
    }
  });

  it('fits a big rig at every KOA, which all take reservations', () => {
    const classA = RIG_PRESETS.find((r) => r.name === '40 ft Class A')!;
    const koas = SEED_SPOTS.filter((s) => /\bKOA\b/.test(s.name));
    expect(koas.length).toBeGreaterThanOrEqual(12);
    for (const koa of koas) {
      expect(koa.cost.reservations).toBe('reservable');
      expect(fitFor(koa, classA).status).not.toBe('no');
    }
  });

  it('tells a 25 ft trailer exactly why Sublett Campground is out', () => {
    const trailer = RIG_PRESETS.find((r) => r.name === 'Truck + 25 ft trailer')!;
    expect(fitFor(byId('sublett-campground'), trailer).reasons).toEqual(['Fits up to 20 ft; yours is 25 ft']);
  });

  it('prices every dispersed spot as free for every rig', () => {
    for (const spot of SEED_SPOTS.filter((s) => s.siteType === 'dispersed')) {
      for (const rig of RIG_PRESETS) {
        expect(costForRig(spot, rig)).toMatchObject({ feeUsd: 0, level: 0 });
      }
    }
  });
});
