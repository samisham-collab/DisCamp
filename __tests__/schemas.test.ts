import { describe, expect, it } from '@jest/globals';

import { SEED_SPOTS } from '@/data/seedSpots';
import { cachedSpotsSchema, prefsSchema, spotRowSchema, spotSchema, storedRigSchema } from '@/lib/schemas';

import { baseSpot, makeRow } from '../test/fixtures';

describe('spotSchema', () => {
  it('accepts every starter spot', () => {
    for (const spot of SEED_SPOTS) {
      const result = spotSchema.safeParse(spot);
      expect(result.success ? 'valid' : result.error.issues).toBe('valid');
    }
  });

  it('rejects bad core data', () => {
    expect(spotSchema.safeParse({ ...baseSpot, latitude: 95 }).success).toBe(false);
    expect(spotSchema.safeParse({ ...baseSpot, id: 'has spaces' }).success).toBe(false);
    expect(spotSchema.safeParse({ ...baseSpot, name: '   ' }).success).toBe(false);
    expect(spotSchema.safeParse({ ...baseSpot, name: 'x'.repeat(121) }).success).toBe(false);
    expect(spotSchema.safeParse({ ...baseSpot, name: '🏕️'.repeat(60) }).success).toBe(true);
    expect(spotSchema.safeParse({ ...baseSpot, phone: '.......' }).success).toBe(false);
    expect(spotSchema.safeParse({ ...baseSpot, siteType: 'hotel' }).success).toBe(false);
  });

  it('only allows web links as sources', () => {
    const withLink = (url: string) => ({ ...baseSpot, sources: [{ label: 'Link', url }] });
    expect(spotSchema.safeParse(withLink('https://example.org')).success).toBe(true);
    expect(spotSchema.safeParse(withLink('javascript:alert(1)')).success).toBe(false);
    expect(spotSchema.safeParse(withLink('tel:5555555555')).success).toBe(false);
  });
});

describe('spotRowSchema (database rows)', () => {
  it('converts a full row to a Spot', () => {
    const result = spotRowSchema.safeParse(makeRow());
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    expect(result.data).toMatchObject({
      id: 'row-spot',
      siteType: 'campground',
      latitude: 39.19,
      access: { clearanceTier: 2, drivetrain: '2wd-ok' },
      fit: { maxTrailerFt: 40, bigRig: true },
      cost: { nightlyFeeUsd: 0, rvFeeUsd: 20, hookups: ['electric', 'water'], reservations: 'first-come' },
      phone: '(785) 899-6334',
      reportCount: 5,
    });
  });

  it('accepts Postgres numeric values sent as strings', () => {
    const result = spotRowSchema.safeParse(makeRow({ latitude: '39.5', nightly_fee_usd: '7.50' }));
    expect(result.success && result.data.latitude).toBe(39.5);
    expect(result.success && result.data.cost.nightlyFeeUsd).toBe(7.5);
  });

  it('skips rows with bad core fields', () => {
    expect(spotRowSchema.safeParse(makeRow({ latitude: 'north' })).success).toBe(false);
    expect(spotRowSchema.safeParse(makeRow({ site_type: 'resort' })).success).toBe(false);
    expect(spotRowSchema.safeParse(makeRow({ id: 'bad id!' })).success).toBe(false);
    expect(spotRowSchema.safeParse(makeRow({ verified: 'yes' })).success).toBe(false);
  });

  it('turns out-of-range secondary fields into "not reported" instead of dropping the spot', () => {
    const result = spotRowSchema.safeParse(
      makeRow({
        clearance_tier: 9,
        drivetrain: 'hovercraft',
        stay_limit_days: 0,
        max_trailer_ft: 500,
        nightly_fee_usd: -5,
        reservations: 'maybe',
        hookups: ['electric', 'electric', 'wifi'],
        phone: 'call the ranger',
        amenities: ['  Restroom  ', '', '   '],
        sources: [
          { label: 'Good', url: 'https://example.org' },
          { label: 'Bad', url: 'javascript:alert(1)' },
          'not an object',
        ],
      }),
    );
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    const spot = result.data;
    expect(spot.access.clearanceTier).toBeNull();
    expect(spot.access.drivetrain).toBeNull();
    expect(spot.stayLimitDays).toBeNull();
    expect(spot.fit.maxTrailerFt).toBeNull();
    expect(spot.cost.nightlyFeeUsd).toBeNull();
    expect(spot.cost.reservations).toBeNull();
    expect(spot.cost.hookups).toEqual(['electric']);
    expect(spot.phone).toBeUndefined();
    expect(spot.amenities).toEqual(['Restroom']);
    expect(spot.sources).toEqual([{ label: 'Good', url: 'https://example.org' }]);
  });

  it('keeps a spot whose name or list items are odd, instead of hiding it', () => {
    const emojiName = '🏕️'.repeat(60); // 120 characters to Postgres, 180 UTF-16 units to JavaScript
    const cases = [
      makeRow({ name: '\t ', amenities: ['Restroom', null], rules: [['nested'], 'No glass'] }),
      makeRow({ name: '\u00a0', hookups: [['electric', 'water']] }),
      makeRow({ name: emojiName }),
    ];
    const [blank, nbsp, emoji] = cases.map((row) => {
      const result = spotRowSchema.safeParse(row);
      if (!result.success) throw new Error(JSON.stringify(result.error.issues));
      return result.data;
    });
    expect(blank?.name).toBe('Unnamed spot');
    expect(blank?.amenities).toEqual(['Restroom']);
    expect(blank?.rules).toEqual(['No glass']);
    expect(nbsp?.name).toBe('Unnamed spot');
    expect(nbsp?.cost.hookups).toEqual([]);
    expect(emoji?.name).toBe(emojiName);
  });

  it('shortens long text without splitting characters', () => {
    const result = spotRowSchema.safeParse(makeRow({ name: `${'a'.repeat(119)}🏕️🏕️` }));
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    expect(result.data.name).toBe(`${'a'.repeat(119)}🏕`);
  });

  it('accepts real phone numbers only, and never shortens one', () => {
    const phoneOf = (phone: string) => {
      const result = spotRowSchema.safeParse(makeRow({ phone }));
      if (!result.success) throw new Error(JSON.stringify(result.error.issues));
      return result.data.phone;
    };
    expect(phoneOf('(785) 899-6334')).toBe('(785) 899-6334');
    expect(phoneOf('+1 785.899.6334')).toBe('+1 785.899.6334');
    expect(phoneOf('.......')).toBeUndefined();
    expect(phoneOf('( ) ( ) ( )')).toBeUndefined();
    // 25 digits: valid for the old pattern, but no real number is that long.
    expect(phoneOf(`+${'1'.repeat(25)}`)).toBeUndefined();
  });

  it('marks your own spot that is hidden for review, and nothing else', () => {
    const hidden = spotRowSchema.parse(makeRow({ hidden: true }));
    expect(hidden.hidden).toBe(true);
    for (const value of [false, null, undefined]) {
      expect(spotRowSchema.parse(makeRow({ hidden: value }))).not.toHaveProperty('hidden');
    }
  });

  it('reads when campers last confirmed a spot, and what changed since', () => {
    const spot = spotRowSchema.parse(
      makeRow({
        last_confirmed_at: '2026-10-01 12:00:00+00',
        alerts: [
          { kind: 'gate_closed', at: '2026-10-03T08:00:00Z' },
          { kind: 'still_good', at: '2026-10-03T08:00:00Z' },
          { kind: 'trash', at: 'yesterday' },
          { kind: 'trash', at: '2026-10-02T08:00:00Z' },
          'nope',
          { kind: 'other', at: '2026-10-02T07:00:00Z' },
          { kind: 'closed', at: '2026-10-02T06:00:00Z' },
        ],
      }),
    );
    expect(spot.lastConfirmedAt).toBe('2026-10-01T12:00:00.000Z');
    expect(spot.alerts).toEqual([
      { kind: 'gate_closed', at: '2026-10-03T08:00:00.000Z' },
      { kind: 'trash', at: '2026-10-02T08:00:00.000Z' },
      { kind: 'other', at: '2026-10-02T07:00:00.000Z' },
    ]);
    const quiet = spotRowSchema.parse(makeRow({ last_confirmed_at: null, alerts: [] }));
    expect(quiet).not.toHaveProperty('lastConfirmedAt');
    expect(quiet).not.toHaveProperty('alerts');
    expect(spotRowSchema.parse(makeRow({ alerts: 'nope' }))).not.toHaveProperty('alerts');
  });

  it('handles empty optional columns', () => {
    const result = spotRowSchema.safeParse(
      makeRow({
        hookups: null,
        amenities: null,
        rules: null,
        sources: null,
        cost_notes: '  ',
        directions: null,
        phone: null,
      }),
    );
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    // Hookups nobody reported stay unknown; empty lists are just empty.
    expect(result.data.cost.hookups).toBeNull();
    expect(result.data.amenities).toEqual([]);
    expect(result.data.sources).toEqual([]);
    expect(result.data.cost.notes).toBeUndefined();
    expect(result.data.directions).toBeUndefined();
  });
});

describe('saved settings schemas', () => {
  it('validates a saved rig', () => {
    expect(
      storedRigSchema.safeParse({ name: 'X', clearanceIn: 9, drivetrain: '4wd', setup: 'rtt', lengthFt: 0 }).success,
    ).toBe(true);
    expect(
      storedRigSchema.safeParse({ name: 'X', clearanceIn: 9, drivetrain: 'hover', setup: 'rtt', lengthFt: 0 }).success,
    ).toBe(false);
    expect(storedRigSchema.safeParse({ name: 'X' }).success).toBe(false);
  });

  it('validates saved preferences', () => {
    expect(prefsSchema.safeParse({ filters: ['fits'], mapType: 'hybrid', view: 'list' }).success).toBe(true);
    expect(prefsSchema.safeParse({ filters: ['cheap'], mapType: 'hybrid', view: 'list' }).success).toBe(false);
  });

  it('validates the offline cache', () => {
    const cache = { version: 1, savedAt: '2026-10-06T12:00:00.000Z', spots: SEED_SPOTS };
    expect(cachedSpotsSchema.safeParse(cache).success).toBe(true);
    expect(cachedSpotsSchema.safeParse({ ...cache, version: 2 }).success).toBe(false);
    expect(cachedSpotsSchema.safeParse({ ...cache, savedAt: 'yesterday' }).success).toBe(false);
  });
});
