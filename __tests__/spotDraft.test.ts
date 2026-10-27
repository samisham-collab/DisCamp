import { describe, expect, it } from '@jest/globals';

import { SEED_SPOTS } from '@/data/seedSpots';
import { spotSchema } from '@/lib/schemas';
import {
  BLOCKED_WORDS_MESSAGE,
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

  it('reads coordinates the way map apps copy them, with degrees and compass letters', () => {
    const point = { latitude: 46.653, longitude: -121.614 };
    expect(parseCoordinates('46.653° N, 121.614° W')).toEqual(point);
    expect(parseCoordinates('46.653°N 121.614°W')).toEqual(point);
    expect(parseCoordinates('N46.653 W121.614')).toEqual(point);
    expect(parseCoordinates('46.653n, 121.614w')).toEqual(point);
    expect(parseCoordinates('46.653°, -121.614°')).toEqual(point);
    expect(parseCoordinates('S 33.9, E 18.4')).toEqual({ latitude: -33.9, longitude: 18.4 });
  });

  it('rejects anything else', () => {
    for (const bad of [
      '',
      '46.653',
      '95, 10',
      '46.6, -190',
      '46.6; -121.6',
      '46.6, -121.6, 3',
      // A letter on the wrong number, a letter and a minus, or two letters.
      'W46 N121',
      'N-46 W121',
      'N46N W121',
    ]) {
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
      cost: { nightlyFeeUsd: null, rvFeeUsd: null, hookups: null, reservations: null },
      amenities: [],
      rules: [],
    });
  });

  it('keeps hookups unknown until the camper picks some, or "None"', () => {
    const hookups = (patch: Partial<SpotDraft>) => checkDraft(filled(patch)).input?.cost.hookups;
    expect(hookups({})).toBeNull();
    expect(hookups({ noHookups: true })).toEqual([]);
    expect(hookups({ hookups: ['water', 'water', 'electric'] })).toEqual(['water', 'electric']);
    // "None" wins over a stale pick (the form clears picks when None is tapped).
    expect(hookups({ noHookups: true, hookups: ['water'] })).toEqual([]);
    // Editing a spot shows what it says, including "None" and "not reported".
    const spot = SEED_SPOTS[0]!;
    expect(draftFromSpot({ ...spot, cost: { ...spot.cost, hookups: [] } })).toMatchObject({
      hookups: [],
      noHookups: true,
    });
    expect(draftFromSpot({ ...spot, cost: { ...spot.cost, hookups: null } })).toMatchObject({
      hookups: [],
      noHookups: false,
    });
  });

  it('takes a fee with a decimal comma', () => {
    const cost = checkDraft(filled({ feeKind: 'paid', feeAmount: '22,50', rvFee: '$30,5' })).input?.cost;
    expect(cost).toMatchObject({ nightlyFeeUsd: 22.5, rvFeeUsd: 30.5 });
    expect(checkDraft(filled({ feeKind: 'paid', feeAmount: '1,234' })).errors.feeAmount).toBeDefined();
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

  it('flags words DisCamp doesn’t allow, in every text field', () => {
    const { errors } = checkDraft(
      filled({
        name: 'Shit Creek',
        landManager: 'Whore Creek Ranch',
        surface: 'Fucking awful',
        costNotes: 'Free, you bastard',
        amenities: 'Toilet\nPorn shop',
        rules: 'No fires\nBitch about it',
        directions: 'What the fuck',
      }),
    );
    expect(errors).toEqual({
      name: BLOCKED_WORDS_MESSAGE,
      landManager: BLOCKED_WORDS_MESSAGE,
      surface: BLOCKED_WORDS_MESSAGE,
      costNotes: BLOCKED_WORDS_MESSAGE,
      amenities: BLOCKED_WORDS_MESSAGE,
      rules: BLOCKED_WORDS_MESSAGE,
      directions: BLOCKED_WORDS_MESSAGE,
    });
    // A field that's already wrong keeps its first message.
    expect(checkDraft(filled({ name: `Shit ${'x'.repeat(120)}` })).errors.name).toMatch(/120 characters/);
    expect(checkDraft(filled({ name: 'Hooker Creek', directions: 'Past the bear scat' })).input).not.toBeNull();
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
    expect(isBlankDraft({ ...emptyDraft(), clientId: 'abc', ownerId: 'someone' })).toBe(true);
  });

  it('loads a saved draft, filling in anything an older version didn’t save', () => {
    expect(storedDraftSchema.parse({ name: 'Half done' })).toEqual({ ...emptyDraft(), name: 'Half done' });
  });

  it('keeps the rest of a saved draft when one field doesn’t fit', () => {
    const longLink = `https://maps.google.com/?q=${'x'.repeat(240)}`;
    const draft = storedDraftSchema.parse({
      clientId: 'abc',
      name: 'Half done',
      siteType: 'hotel',
      coordinates: longLink,
      hookups: ['wifi'],
      amenities: 7,
    });
    expect(draft).toEqual({ ...emptyDraft(), clientId: 'abc', name: 'Half done', coordinates: longLink.slice(0, 200) });
    expect(storedDraftSchema.safeParse('not a draft').success).toBe(false);
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
