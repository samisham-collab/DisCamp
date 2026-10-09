// The "Add a spot" / "Edit spot" form as data: what the camper has typed so
// far (a draft), turned into a checked spot (or a list of field errors).
// Pure functions only, so every rule is unit tested.

import { z } from 'zod';

import type { ClearanceTier, Hookup, Reservations, SiteType, Spot, SpotDrivetrain } from '../types';
import { distanceMiles, formatCoordinates, isValidCoordinate } from './geo';
import { charCount, isPhoneNumber, spotSchema } from './schemas';

export type FeeKind = 'free' | 'paid';

export interface SpotDraft {
  /**
   * New spots only: the id the app picked for this draft on the first try to
   * save it, reused on every retry so a spot is never added twice.
   */
  clientId: string;
  name: string;
  siteType: SiteType;
  landManager: string;
  stayLimitDays: string;
  /** "latitude, longitude" in decimal degrees. */
  coordinates: string;
  clearanceTier: ClearanceTier | null;
  drivetrain: SpotDrivetrain | null;
  surface: string;
  impassableWhenWet: boolean | null;
  tent: boolean | null;
  rtt: boolean | null;
  van: boolean | null;
  bigRig: boolean | null;
  turnaround: boolean | null;
  maxTrailerFt: string;
  /** Free, paid (then `feeAmount`), or null for "not sure". */
  feeKind: FeeKind | null;
  feeAmount: string;
  rvFee: string;
  hookups: Hookup[];
  reservations: Reservations | null;
  costNotes: string;
  /** One per line. */
  amenities: string;
  /** One per line. */
  rules: string;
  directions: string;
  phone: string;
}

export type DraftField = keyof SpotDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

/** What the app sends to the server: a spot minus the fields the server owns. */
export type SpotInput = Omit<
  Spot,
  'id' | 'verified' | 'reportCount' | 'sources' | 'createdBy' | 'addedBy' | 'createdAt'
>;

export const LIMITS = {
  name: 120,
  landManager: 120,
  surface: 200,
  costNotes: 500,
  directions: 1000,
  amenity: 80,
  rule: 200,
  listItems: 30,
} as const;

export function emptyDraft(): SpotDraft {
  return {
    clientId: '',
    name: '',
    siteType: 'dispersed',
    landManager: '',
    stayLimitDays: '',
    coordinates: '',
    clearanceTier: null,
    drivetrain: null,
    surface: '',
    impassableWhenWet: null,
    tent: null,
    rtt: null,
    van: null,
    bigRig: null,
    turnaround: null,
    maxTrailerFt: '',
    feeKind: null,
    feeAmount: '',
    rvFee: '',
    hookups: [],
    reservations: null,
    costNotes: '',
    amenities: '',
    rules: '',
    directions: '',
    phone: '',
  };
}

/** True when nothing has been filled in, so there's no draft worth keeping. */
export function isBlankDraft(draft: SpotDraft): boolean {
  return JSON.stringify({ ...draft, clientId: '' }) === JSON.stringify(emptyDraft());
}

const feeText = (fee: number | null) => (fee == null ? '' : String(fee));

export function draftFromSpot(spot: Spot): SpotDraft {
  const fee = spot.cost.nightlyFeeUsd;
  return {
    clientId: '',
    name: spot.name,
    siteType: spot.siteType,
    landManager: spot.landManager,
    stayLimitDays: spot.stayLimitDays == null ? '' : String(spot.stayLimitDays),
    coordinates: formatCoordinates(spot),
    clearanceTier: spot.access.clearanceTier,
    drivetrain: spot.access.drivetrain,
    surface: spot.access.surface ?? '',
    impassableWhenWet: spot.access.impassableWhenWet,
    tent: spot.fit.tent,
    rtt: spot.fit.rtt,
    van: spot.fit.van,
    bigRig: spot.fit.bigRig,
    turnaround: spot.fit.turnaround,
    maxTrailerFt: spot.fit.maxTrailerFt == null ? '' : String(spot.fit.maxTrailerFt),
    feeKind: fee == null ? null : fee === 0 ? 'free' : 'paid',
    feeAmount: fee != null && fee > 0 ? feeText(fee) : '',
    rvFee: feeText(spot.cost.rvFeeUsd),
    hookups: [...spot.cost.hookups],
    reservations: spot.cost.reservations,
    costNotes: spot.cost.notes ?? '',
    amenities: spot.amenities.join('\n'),
    rules: spot.rules.join('\n'),
    directions: spot.directions ?? '',
    phone: spot.phone ?? '',
  };
}

/**
 * Reads "46.653, -121.614" (or with a space instead of the comma) as a point.
 * Null if it isn't two decimal numbers in range.
 */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!match) return null;
  const point = { latitude: Number(match[1]), longitude: Number(match[2]) };
  return isValidCoordinate(point) ? point : null;
}

const visible = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "$15", "15.50" or "15" as dollars; null for anything else. */
function parseFee(text: string): number | null {
  const cleaned = text.trim().replace(/^\$\s*/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value <= 10_000 ? value : null;
}

function parseWhole(text: string, min: number, max: number): number | null {
  const cleaned = text.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= min && value <= max ? value : null;
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => visible(l.replace(/^\s*[-•*]\s*/, '')))
    .filter(Boolean);
}

export interface DraftCheck {
  input: SpotInput | null;
  errors: DraftErrors;
}

/** Checks a draft. `input` is set only when there are no errors. */
export function checkDraft(draft: SpotDraft): DraftCheck {
  const errors: DraftErrors = {};
  const tooLong = (field: DraftField, value: string, max: number) => {
    if (charCount(value) > max) errors[field] = `Use ${max} characters or fewer.`;
  };

  const name = visible(draft.name);
  if (!name) errors.name = 'Give the spot a name.';
  tooLong('name', name, LIMITS.name);

  const landManager = visible(draft.landManager);
  if (!landManager) errors.landManager = 'Say who manages the land, or "Not sure".';
  tooLong('landManager', landManager, LIMITS.landManager);

  const point = parseCoordinates(draft.coordinates);
  if (!draft.coordinates.trim()) errors.coordinates = 'Drop a pin or enter the GPS location.';
  else if (!point) errors.coordinates = 'Use decimal degrees, like 46.65300, -121.61400.';
  else if (point.latitude === 0 && point.longitude === 0)
    errors.coordinates = 'That pin is at 0, 0. Move it to the spot.';

  let stayLimitDays: number | null = null;
  if (draft.stayLimitDays.trim()) {
    stayLimitDays = parseWhole(draft.stayLimitDays, 1, 365);
    if (stayLimitDays == null) errors.stayLimitDays = 'Enter whole days, 1 to 365, or leave it empty.';
  }

  const surface = visible(draft.surface);
  tooLong('surface', surface, LIMITS.surface);

  let maxTrailerFt: number | null = null;
  if (draft.maxTrailerFt.trim()) {
    maxTrailerFt = parseWhole(draft.maxTrailerFt, 0, 100);
    if (maxTrailerFt == null) errors.maxTrailerFt = 'Enter whole feet, 0 to 100, or leave it empty.';
  }

  let nightlyFeeUsd: number | null = null;
  if (draft.feeKind === 'free') nightlyFeeUsd = 0;
  if (draft.feeKind === 'paid') {
    nightlyFeeUsd = parseFee(draft.feeAmount);
    if (nightlyFeeUsd == null || nightlyFeeUsd === 0) {
      errors.feeAmount = 'Enter the nightly fee in dollars, like 15 or 22.50.';
      nightlyFeeUsd = null;
    }
  }

  let rvFeeUsd: number | null = null;
  if (draft.rvFee.trim()) {
    rvFeeUsd = parseFee(draft.rvFee);
    if (rvFeeUsd == null) errors.rvFee = 'Enter dollars, like 30, or leave it empty.';
  }

  const costNotes = draft.costNotes.trim();
  tooLong('costNotes', costNotes, LIMITS.costNotes);

  const amenities = lines(draft.amenities);
  if (amenities.length > LIMITS.listItems) errors.amenities = `List up to ${LIMITS.listItems} things.`;
  else if (amenities.some((a) => charCount(a) > LIMITS.amenity)) {
    errors.amenities = `Keep each line to ${LIMITS.amenity} characters.`;
  }

  const rules = lines(draft.rules);
  if (rules.length > LIMITS.listItems) errors.rules = `List up to ${LIMITS.listItems} rules.`;
  else if (rules.some((r) => charCount(r) > LIMITS.rule)) errors.rules = `Keep each line to ${LIMITS.rule} characters.`;

  const directions = draft.directions.trim();
  tooLong('directions', directions, LIMITS.directions);

  const phone = draft.phone.trim();
  if (phone && !isPhoneNumber(phone)) errors.phone = 'Enter a phone number with 7 to 15 digits, or leave it empty.';

  if (Object.keys(errors).length > 0 || !point) return { input: null, errors };

  const input: SpotInput = {
    name,
    latitude: point.latitude,
    longitude: point.longitude,
    siteType: draft.siteType,
    landManager,
    stayLimitDays,
    access: {
      clearanceTier: draft.clearanceTier,
      drivetrain: draft.drivetrain,
      surface: surface || null,
      impassableWhenWet: draft.impassableWhenWet,
    },
    fit: {
      tent: draft.tent,
      rtt: draft.rtt,
      van: draft.van,
      maxTrailerFt,
      bigRig: draft.bigRig,
      turnaround: draft.turnaround,
    },
    cost: {
      nightlyFeeUsd,
      rvFeeUsd,
      hookups: [...new Set(draft.hookups)],
      reservations: draft.reservations,
      ...(costNotes ? { notes: costNotes } : {}),
    },
    amenities,
    rules,
    ...(directions ? { directions } : {}),
    ...(phone ? { phone } : {}),
  };

  // Belt and braces: the same checks the app applies to spots from the server.
  const full = spotSchema.safeParse({ ...input, id: 'draft', verified: false, reportCount: 0, sources: [] });
  if (!full.success) return { input: null, errors: { name: 'Something in this spot is not valid. Check each field.' } };
  return { input, errors: {} };
}

/** Saved new-spot draft. Loose on purpose: a draft from an older version still loads. */
export const storedDraftSchema: z.ZodType<SpotDraft, z.ZodTypeDef, unknown> = z
  .object({
    clientId: z.string().max(64),
    name: z.string().max(2000),
    siteType: z.enum(['dispersed', 'campground']),
    landManager: z.string().max(2000),
    stayLimitDays: z.string().max(50),
    coordinates: z.string().max(200),
    clearanceTier: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)])
      .nullable(),
    drivetrain: z.enum(['2wd-ok', 'awd-recommended', '4wd-required', '4wd-lockers']).nullable(),
    surface: z.string().max(2000),
    impassableWhenWet: z.boolean().nullable(),
    tent: z.boolean().nullable(),
    rtt: z.boolean().nullable(),
    van: z.boolean().nullable(),
    bigRig: z.boolean().nullable(),
    turnaround: z.boolean().nullable(),
    maxTrailerFt: z.string().max(50),
    feeKind: z.enum(['free', 'paid']).nullable(),
    feeAmount: z.string().max(50),
    rvFee: z.string().max(50),
    hookups: z.array(z.enum(['electric', 'water', 'sewer'])).max(3),
    reservations: z.enum(['first-come', 'reservable', 'not-needed']).nullable(),
    costNotes: z.string().max(5000),
    amenities: z.string().max(10_000),
    rules: z.string().max(10_000),
    directions: z.string().max(10_000),
    phone: z.string().max(100),
  })
  .partial()
  .transform((d) => ({ ...emptyDraft(), ...d }));

/** A point formatted for the coordinates field. */
export function coordinatesText(point: { latitude: number; longitude: number }): string {
  return formatCoordinates(point);
}

/** Closer than this, a "new" spot is probably one that's already on the map. */
export const NEARBY_MILES = 0.25;

/** The closest other spot within NEARBY_MILES of `point`, if any. */
export function nearbySpot(
  spots: readonly Spot[],
  point: { latitude: number; longitude: number } | null,
  excludeId?: string,
): { spot: Spot; miles: number } | null {
  if (!point) return null;
  let best: { spot: Spot; miles: number } | null = null;
  for (const spot of spots) {
    if (spot.id === excludeId) continue;
    const miles = distanceMiles(point, spot);
    if (miles <= NEARBY_MILES && (!best || miles < best.miles)) best = { spot, miles };
  }
  return best;
}
