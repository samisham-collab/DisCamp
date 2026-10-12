import { describe, expect, it } from '@jest/globals';

import { SEED_SPOTS } from '@/data/seedSpots';
import { costForRig, costLevel, describeRvFee, formatFee, formatHookups, knownHookups } from '@/lib/cost';
import type { SiteType, SpotCost } from '@/types';

import { makeSpot, preset } from '../test/fixtures';

const smoky = SEED_SPOTS.find((s) => s.id === 'smoky-gardens');
if (!smoky) throw new Error('Smoky Gardens is missing from the seed');

describe('costLevel', () => {
  it('buckets nightly fees into Free, $, $$ and $$$', () => {
    expect(costLevel(null)).toBeNull();
    expect(costLevel(Number.NaN)).toBeNull();
    expect(costLevel(0)).toBe(0);
    expect(costLevel(10)).toBe(1);
    expect(costLevel(14.99)).toBe(1);
    expect(costLevel(15)).toBe(2);
    expect(costLevel(30)).toBe(2);
    expect(costLevel(30.01)).toBe(3);
  });
});

describe('costForRig', () => {
  it('is free for tent and rooftop-tent campers at Smoky Gardens (dry camping)', () => {
    const cost = costForRig(smoky, preset('Mid-size 4x4 + RTT'));
    expect(cost).toEqual({ feeUsd: 0, level: 0, basis: 'standard site' });
  });

  it('uses the $20 RV hookup fee for big rigs and trailers', () => {
    for (const name of ['40 ft Class A', 'Truck + 25 ft trailer']) {
      expect(costForRig(smoky, preset(name))).toEqual({ feeUsd: 20, level: 2, basis: 'RV site' });
    }
  });

  it('uses the standard fee for towing rigs at spots without hookup sites', () => {
    const spot = makeSpot({ cost: { nightlyFeeUsd: 10, rvFeeUsd: null, hookups: [] } });
    expect(costForRig(spot, preset('40 ft Class A'))).toEqual({ feeUsd: 10, level: 1, basis: 'standard site' });
  });

  it("doesn't guess the hookup-site fee when nobody has reported it", () => {
    const spot = makeSpot({ cost: { nightlyFeeUsd: 0, rvFeeUsd: null, hookups: ['electric'] } });
    expect(costForRig(spot, preset('Truck + 25 ft trailer'))).toEqual({ feeUsd: null, level: null, basis: 'RV site' });
    // Tent campers still camp free there.
    expect(costForRig(spot, preset('Sedan'))).toEqual({ feeUsd: 0, level: 0, basis: 'standard site' });
  });

  it("doesn't guess for trailers when nobody said whether there are hookups", () => {
    const campground = makeSpot({ siteType: 'campground', cost: { nightlyFeeUsd: 0, rvFeeUsd: null, hookups: null } });
    expect(costForRig(campground, preset('Truck + 25 ft trailer'))).toEqual({
      feeUsd: null,
      level: null,
      basis: 'RV site',
    });
    expect(costForRig(campground, preset('Sedan'))).toEqual({ feeUsd: 0, level: 0, basis: 'standard site' });
    // Dispersed spots have no hookups, so the standard fee is the fee.
    const dispersed = makeSpot({ siteType: 'dispersed', cost: { nightlyFeeUsd: 0, rvFeeUsd: null, hookups: null } });
    expect(costForRig(dispersed, preset('Truck + 25 ft trailer'))).toEqual({
      feeUsd: 0,
      level: 0,
      basis: 'standard site',
    });
    expect(knownHookups(dispersed)).toEqual([]);
    expect(knownHookups(campground)).toBeNull();
  });

  it('reports an unknown fee as unknown', () => {
    const spot = makeSpot({ cost: { nightlyFeeUsd: null, rvFeeUsd: null } });
    expect(costForRig(spot, preset('Sedan'))).toEqual({ feeUsd: null, level: null, basis: 'standard site' });
  });
});

describe('formatting', () => {
  it('formats fees', () => {
    expect(formatFee(null)).toBe('Not reported');
    expect(formatFee(Number.POSITIVE_INFINITY)).toBe('Not reported');
    expect(formatFee(0)).toBe('Free');
    expect(formatFee(20)).toBe('$20 a night');
    expect(formatFee(12.5)).toBe('$12.50 a night');
  });

  it('describes the RV fee for every combination', () => {
    const rv = (cost: Pick<SpotCost, 'nightlyFeeUsd' | 'rvFeeUsd' | 'hookups'>, siteType: SiteType = 'campground') =>
      describeRvFee({ siteType, cost: { ...cost, reservations: null } });
    expect(rv({ nightlyFeeUsd: 0, rvFeeUsd: 20, hookups: ['electric'] })).toBe('$20 a night');
    expect(rv({ nightlyFeeUsd: 0, rvFeeUsd: null, hookups: [] })).toBe('Same as standard');
    expect(rv({ nightlyFeeUsd: 0, rvFeeUsd: null, hookups: ['water'] })).toBe('Not reported');
    expect(rv({ nightlyFeeUsd: null, rvFeeUsd: null, hookups: [] })).toBe('Not reported');
    // Hookups nobody reported: unknown at a campground; dispersed spots have none.
    expect(rv({ nightlyFeeUsd: 0, rvFeeUsd: null, hookups: null })).toBe('Not reported');
    expect(rv({ nightlyFeeUsd: 0, rvFeeUsd: null, hookups: null }, 'dispersed')).toBe('Same as standard');
  });

  it('formats hookups', () => {
    expect(formatHookups(null)).toBe('Not reported');
    expect(formatHookups([])).toBe('None');
    expect(formatHookups(['electric', 'water'])).toBe('Electric, Water');
  });
});
