import { describe, expect, it } from '@jest/globals';

import { applyFilters, buildSpotRows, countLabel, sortRows } from '@/lib/spotRows';
import { spotsStatus } from '@/lib/spotsStatus';
import { timeAgo } from '@/lib/time';

import { makeSpot, preset } from '../test/fixtures';

const here = { latitude: 39.35, longitude: -101.71 };
const near = makeSpot({ id: 'near', name: 'Near', latitude: 39.36, longitude: -101.71 });
const far = makeSpot({ id: 'far', name: 'Far', latitude: 40.5, longitude: -101.71 });
const rough = makeSpot({ id: 'rough', name: 'Rough', access: { clearanceTier: 7 } });
const paid = makeSpot({ id: 'paid', name: 'Paid', cost: { nightlyFeeUsd: 25 } });
const unrated = makeSpot({ id: 'unrated', name: 'Unrated', access: { clearanceTier: null } });

describe('buildSpotRows', () => {
  it('adds fit, cost and distance for each spot', () => {
    const [row] = buildSpotRows([near], preset('Mid-size 4x4 + RTT'), here);
    expect(row?.fit.status).toBe('fits');
    expect(row?.cost.level).toBe(0);
    expect(row?.distanceMi).toBeCloseTo(0.69, 1);
  });

  it('leaves distance empty without a location', () => {
    const [row] = buildSpotRows([near], preset('Sedan'), null);
    expect(row?.distanceMi).toBeNull();
  });
});

describe('applyFilters', () => {
  const rows = buildSpotRows([near, rough, paid, unrated], preset('Mid-size 4x4 + RTT'), null);

  it('keeps everything with no filters', () => {
    expect(applyFilters(rows, [])).toHaveLength(4);
  });

  it('"Fits my rig" keeps fits and tight, drops no and unknown', () => {
    expect(applyFilters(rows, ['fits']).map((r) => r.spot.id)).toEqual(['near', 'paid']);
  });

  it('"Free for my rig" keeps only free spots', () => {
    expect(applyFilters(rows, ['free']).map((r) => r.spot.id)).toEqual(['near', 'rough', 'unrated']);
  });

  it('combines filters', () => {
    expect(applyFilters(rows, ['fits', 'free']).map((r) => r.spot.id)).toEqual(['near']);
  });
});

describe('sortRows', () => {
  it('sorts best fit first, then nearest, then by name', () => {
    const rows = buildSpotRows([unrated, far, rough, near], preset('Mid-size 4x4 + RTT'), here);
    expect(sortRows(rows).map((r) => r.spot.id)).toEqual(['near', 'far', 'unrated', 'rough']);
  });

  it('sorts by name when there is no location', () => {
    const rows = buildSpotRows([far, near], preset('Mid-size 4x4 + RTT'), null);
    expect(sortRows(rows).map((r) => r.spot.id)).toEqual(['far', 'near']);
  });

  it('does not change the original array', () => {
    const rows = buildSpotRows([far, near], preset('Mid-size 4x4 + RTT'), null);
    const copy = [...rows];
    sortRows(rows);
    expect(rows).toEqual(copy);
  });
});

describe('countLabel', () => {
  it('counts spots in plain English', () => {
    expect(countLabel(0, false)).toBe('0 spots');
    expect(countLabel(1, false)).toBe('1 spot');
    expect(countLabel(3, false)).toBe('3 spots');
    expect(countLabel(1, true)).toBe('1 spot matches your filters');
    expect(countLabel(2, true)).toBe('2 spots match your filters');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');
  it('describes recent times', () => {
    expect(timeAgo(null, now)).toBeNull();
    expect(timeAgo('not a date', now)).toBeNull();
    expect(timeAgo('2026-10-06T11:59:30.000Z', now)).toBe('just now');
    expect(timeAgo('2026-10-06T11:55:00.000Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-10-06T09:00:00.000Z', now)).toBe('3 hr ago');
    expect(timeAgo('2026-10-05T11:00:00.000Z', now)).toBe('1 day ago');
    expect(timeAgo('2026-10-01T12:00:00.000Z', now)).toBe('5 days ago');
  });
});

describe('spotsStatus', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');
  const base = { remoteEnabled: true, error: null, loading: false, source: 'remote' as const, updatedAt: null };

  it('says nothing without a server or when all is well', () => {
    expect(spotsStatus({ ...base, remoteEnabled: false, error: 'x' }, now)).toBeNull();
    expect(spotsStatus(base, now)).toBeNull();
  });

  it('shows loading until the first server answer', () => {
    expect(spotsStatus({ ...base, loading: true, source: 'seed' }, now)).toEqual({
      tone: 'info',
      message: 'Loading the latest spots…',
      canRetry: false,
    });
  });

  it('explains what is showing after an error', () => {
    const offline = "You're offline or the server can't be reached.";
    expect(spotsStatus({ ...base, error: offline, source: 'seed' }, now)?.message).toBe(
      `${offline} Showing starter spots.`,
    );
    expect(
      spotsStatus({ ...base, error: offline, source: 'cache', updatedAt: '2026-10-06T10:00:00.000Z' }, now)?.message,
    ).toBe(`${offline} Showing spots saved 2 hr ago.`);
    expect(
      spotsStatus({ ...base, error: offline, source: 'remote', updatedAt: '2026-10-06T11:58:00.000Z' }, now)?.message,
    ).toBe(`${offline} Showing spots from 2 min ago.`);
    expect(spotsStatus({ ...base, error: offline, source: 'cache' }, now)?.canRetry).toBe(true);
  });
});
