import { describe, expect, it } from '@jest/globals';

import { SEED_SPOTS } from '@/data/seedSpots';
import { spotSchema } from '@/lib/schemas';
import {
  checkDraft,
  draftFromSpot,
  emptyDraft,
  isBlankDraft,
  nearbySpot,
  parseCoordinates,
  storedDraftSchema,
  type SpotDraft,
} from '@/lib/spotDraft';

const smoky = SEED_SPOTS.find((s) => s.id === 'smoky-gardens')!;

const filled = (patch: Partial<SpotDraft> = {}): SpotDraft => ({
  ...emptyDraft(),
  name: 'Bluff Pull-off',
  landManager: 'National Forest',
  coordinates: '46.653, -121.614',
  ...patch,
});

describe('coordinates', () => {
  it('reads decimal degrees with a comma or a space', () => {
    expect(parseCoordinates('46.653, -121.614')).toEqual({ latitude: 46.653, longitude: -121.614 });
    expect(parseCoordinates(' 46.653 -121.614 ')).toEqual({ latitude: 46.653, longitude: -121.614 });
    expect(parseCoordinates('46,-121')).toEqual({ latitude: 46, longitude: -121 });
  });

  it('rejects anything else', () => {
    for (const bad of ['', '46.653', 'N46 W121', '95, 10', '46.6, -190', '46.6; -121.6', '46.6, -121.6, 3']) {
      expect(parseCoordinates(bad)).toBeNull();
    }
  });
});

describe('checking a draft', () => {
  it('needs only a name, land manager and location', () => {
    const { input, errors } = checkDraft(filled());
    expect(errors).toEqual({});
    expect(input).toEqual({
      name: 'Bluff Pull-off',
      latitude: 46.653,
      longitude: -121.614,
      siteType: 'dispersed',
      landManager: 'National Forest',
      stayLimitDays: null,
      access: { clearanceTier: null, drivetrain: null, surface: null, impassableWhenWet: null },
      fit: { tent: null, rtt: null, van: null, maxTrailerFt: null, bigRig: null, turnaround: null },
      cost: { nightlyFeeUsd: null, rvFeeUsd: null, hookups: [], reservations: null },
      amenities: [],
      rules: [],
    });
  });

  it('explains each missing required field', () => {
    const { input, errors } = checkDraft(emptyDraft());
    expect(input).toBeNull();
    expect(errors).toEqual({
      name: 'Give the spot a name.',
      landManager: 'Say who manages the land, or "Not sure".',
      coordinates: 'Drop a pin or enter the GPS location.',
    });
    expect(checkDraft(filled({ coordinates: 'here' })).errors.coordinates).toMatch(/decimal degrees/);
    expect(checkDraft(filled({ coordinates: '0, 0' })).errors.coordinates).toMatch(/0, 0/);
  });

  it('cleans up text, lists and numbers', () => {
    const { input } = checkDraft(
      filled({
        name: '  Bluff   Pull-off ',
        stayLimitDays: ' 14 ',
        surface: '  Gravel  ',
        maxTrailerFt: '0',
        feeKind: 'paid',
        feeAmount: '$22.50',
        rvFee: '30',
        hookups: ['water', 'water'],
        costNotes: '  Cash only ',
        amenities: '- Vault toilet\n\n• Fire ring \n',
        rules: '* No fireworks',
        directions: '  Left at the gate. ',
        phone: '(360) 497-1103',
      }),
    );
    expect(input).toMatchObject({
      name: 'Bluff Pull-off',
      stayLimitDays: 14,
      access: { surface: 'Gravel' },
      fit: { maxTrailerFt: 0 },
      cost: { nightlyFeeUsd: 22.5, rvFeeUsd: 30, hookups: ['water'], notes: 'Cash only' },
      amenities: ['Vault toilet', 'Fire ring'],
      rules: ['No fireworks'],
      directions: 'Left at the gate.',
      phone: '(360) 497-1103',
    });
    expect(checkDraft(filled({ feeKind: 'free', feeAmount: '99' })).input?.cost.nightlyFeeUsd).toBe(0);
  });

  it('flags numbers and text it can’t use', () => {
    const { errors } = checkDraft(
      filled({
        stayLimitDays: '400',
        maxTrailerFt: '25.5',
        feeKind: 'paid',
        feeAmount: '0',
        rvFee: 'lots',
        phone: 'call the ranger',
        name: 'x'.repeat(121),
        surface: 'x'.repeat(201),
        costNotes: 'x'.repeat(501),
        directions: 'x'.repeat(1001),
        amenities: Array.from({ length: 31 }, (_, i) => `Item ${i}`).join('\n'),
        rules: 'x'.repeat(201),
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      [
        'amenities',
        'costNotes',
        'directions',
        'feeAmount',
        'maxTrailerFt',
        'name',
        'phone',
        'rules',
        'rvFee',
        'stayLimitDays',
        'surface',
      ].sort(),
    );
    expect(checkDraft(filled({ amenities: 'x'.repeat(81) })).errors.amenities).toMatch(/80 characters/);
    expect(checkDraft(filled({ rules: Array(31).fill('r').join('\n') })).errors.rules).toMatch(/up to 30/);
    expect(checkDraft(filled({ feeKind: 'paid', feeAmount: '20000' })).errors.feeAmount).toBeDefined();
  });

  it('produces spots the app accepts', () => {
    const { input } = checkDraft(draftFromSpot(smoky));
    expect(spotSchema.safeParse({ ...input, id: 'x', verified: false, reportCount: 0, sources: [] }).success).toBe(
      true,
    );
  });
});

describe('editing an existing spot', () => {
  it('round-trips every field', () => {
    const draft = draftFromSpot(smoky);
    expect(draft).toMatchObject({
      name: 'Smoky Gardens',
      siteType: 'campground',
      coordinates: '39.19000, -101.76000',
      clearanceTier: 2,
      feeKind: 'free',
      feeAmount: '',
      rvFee: '20',
      hookups: ['electric', 'water'],
    });
    const { input } = checkDraft(draft);
    const { id: _id, verified: _v, reportCount: _r, sources: _s, ...rest } = smoky;
    expect(input).toEqual(rest);
  });

  it('shows a paid fee and an unknown one', () => {
    const paid = { ...smoky, cost: { ...smoky.cost, nightlyFeeUsd: 18 } };
    expect(draftFromSpot(paid)).toMatchObject({ feeKind: 'paid', feeAmount: '18' });
    const unknown = { ...smoky, cost: { ...smoky.cost, nightlyFeeUsd: null, rvFeeUsd: null } };
    expect(draftFromSpot(unknown)).toMatchObject({ feeKind: null, feeAmount: '', rvFee: '' });
  });
});

describe('drafts', () => {
  it('knows when nothing has been entered', () => {
    expect(isBlankDraft(emptyDraft())).toBe(true);
    expect(isBlankDraft({ ...emptyDraft(), name: 'x' })).toBe(false);
  });

  it('loads a saved draft, filling in anything an older version didn’t save', () => {
    expect(storedDraftSchema.parse({ name: 'Half done' })).toEqual({ ...emptyDraft(), name: 'Half done' });
    expect(storedDraftSchema.safeParse({ siteType: 'hotel' }).success).toBe(false);
  });
});

describe('nearby spots', () => {
  it('finds the closest spot within a quarter mile', () => {
    const near = nearbySpot(SEED_SPOTS, { latitude: 39.1905, longitude: -101.7605 });
    expect(near?.spot.id).toBe('smoky-gardens');
    expect(near?.miles).toBeLessThan(0.1);
  });

  it('ignores far spots, the spot being edited, and no pin', () => {
    expect(nearbySpot(SEED_SPOTS, { latitude: 40, longitude: -100 })).toBeNull();
    expect(nearbySpot(SEED_SPOTS, { latitude: 39.19, longitude: -101.76 }, 'smoky-gardens')).toBeNull();
    expect(nearbySpot(SEED_SPOTS, null)).toBeNull();
  });
});
