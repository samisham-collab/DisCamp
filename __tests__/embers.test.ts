// Embers and ranks: where a camper stands, and how amounts read.

import { describe, expect, it } from '@jest/globals';

import {
  CHECKIN_DAILY_LIMIT,
  CLEANUP_EMBERS,
  DAILY_LIMIT,
  EARNING_RULES,
  EMBERS,
  formatChange,
  formatEmbers,
  NEW_ACCOUNT_DAILY_LIMIT,
  RANKS,
  REASON_LABELS,
  standingFor,
} from '@/lib/embers';

describe('ranks', () => {
  it('climbs from Tenderfoot to Guardian at the planned totals', () => {
    expect(RANKS.map((r) => [r.name, r.min])).toEqual([
      ['Tenderfoot', 0],
      ['Scout', 250],
      ['Trailblazer', 1_000],
      ['Pathfinder', 3_000],
      ['Steward', 7_500],
      ['Guardian', 15_000],
    ]);
  });

  it('says where a camper stands and how far to the next rank', () => {
    expect(standingFor(0)).toEqual({ rank: RANKS[0], next: RANKS[1], progress: 0, toNext: 250 });
    expect(standingFor(125)).toMatchObject({ rank: { name: 'Tenderfoot' }, progress: 0.5, toNext: 125 });
    expect(standingFor(250)).toMatchObject({ rank: { name: 'Scout' }, next: { name: 'Trailblazer' }, toNext: 750 });
    expect(standingFor(14_999)).toMatchObject({ rank: { name: 'Steward' }, toNext: 1 });
    expect(standingFor(20_000)).toEqual({ rank: RANKS[5], next: null, progress: 1, toNext: 0 });
  });

  it('treats odd totals as zero (taken back below zero, or not a number)', () => {
    expect(standingFor(-40).rank.name).toBe('Tenderfoot');
    expect(standingFor(Number.NaN).toNext).toBe(250);
    expect(standingFor(299.9).rank.name).toBe('Scout');
  });
});

describe('amounts', () => {
  it('reads like people write them', () => {
    expect(formatEmbers(1)).toBe('1 Ember');
    expect(formatEmbers(1_250)).toBe('1,250 Embers');
    expect(formatEmbers(0)).toBe('0 Embers');
    expect(formatChange(10)).toBe('+10');
    expect(formatChange(-1_500)).toBe('−1,500');
    expect(formatChange(0)).toBe('0');
  });

  it('match the database (migration 0008)', () => {
    expect(CLEANUP_EMBERS).toEqual({ small: 50, medium: 100, large: 150 });
    expect(EMBERS).toEqual({ cleanupReported: 10, spotConfirmed: 50, stillGood: 10, changeReport: 10, photo: 5 });
    expect([DAILY_LIMIT, NEW_ACCOUNT_DAILY_LIMIT, CHECKIN_DAILY_LIMIT]).toEqual([300, 100, 50]);
    expect(EARNING_RULES).toHaveLength(6);
    expect(Object.keys(REASON_LABELS)).toHaveLength(7);
  });
});
