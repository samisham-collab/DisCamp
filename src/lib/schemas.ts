// Runtime validation for everything that comes from outside the code:
// the database, saved settings and the offline cache. Bad data is rejected
// here so the screens never have to guard against it.

import { z } from 'zod';

import type { ClearanceTier, Rig, Spot } from '../types';

const clearanceTier = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]) satisfies z.ZodType<ClearanceTier>;

const spotDrivetrain = z.enum(['2wd-ok', 'awd-recommended', '4wd-required', '4wd-lockers']);
export const rigDrivetrainSchema = z.enum(['2wd', 'awd', '4wd', '4wd-lockers']);
export const rigSetupSchema = z.enum(['tent', 'rtt', 'van', 'trailer', 'bigrig']);
const hookup = z.enum(['electric', 'water', 'sewer']);
const reservations = z.enum(['first-come', 'reservable', 'not-needed']);

/** Length in characters as people (and Postgres) count them, so an emoji counts once. */
export const charCount = (s: string): number => Array.from(s).length;

/** Cuts to `max` characters without splitting an emoji or accented letter in half. */
export const truncateChars = (s: string, max: number): string =>
  charCount(s) <= max ? s : Array.from(s).slice(0, max).join('');

const shortText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((s) => charCount(s) <= max, `At most ${max} characters`);
const fee = z.number().finite().min(0).max(10_000);

const PHONE_PATTERN = /^\+?[0-9 ().-]{7,25}$/;
/** Digits, spaces and ( ) . - only, with 7 to 15 actual digits (the international maximum). */
export function isPhoneNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '').length;
  return PHONE_PATTERN.test(value) && digits >= 7 && digits <= 15;
}

/** Only web links: a database row must never be able to open another app. */
const webUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed');

export const spotSchema: z.ZodType<Spot> = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, 'Spot ids may only use letters, numbers, - and _'),
  name: shortText(120),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  siteType: z.enum(['dispersed', 'campground']),
  landManager: shortText(120),
  stayLimitDays: z.number().int().min(1).max(365).nullable(),
  access: z.object({
    clearanceTier: clearanceTier.nullable(),
    drivetrain: spotDrivetrain.nullable(),
    surface: shortText(200).nullable(),
    impassableWhenWet: z.boolean().nullable(),
  }),
  fit: z.object({
    tent: z.boolean().nullable(),
    rtt: z.boolean().nullable(),
    van: z.boolean().nullable(),
    maxTrailerFt: z.number().int().min(0).max(100).nullable(),
    bigRig: z.boolean().nullable(),
    turnaround: z.boolean().nullable(),
  }),
  cost: z.object({
    nightlyFeeUsd: fee.nullable(),
    rvFeeUsd: fee.nullable(),
    hookups: z
      .array(hookup)
      .max(3)
      .refine((h) => new Set(h).size === h.length, 'Hookups must not repeat'),
    reservations: reservations.nullable(),
    notes: shortText(500).optional(),
  }),
  amenities: z.array(shortText(80)).max(30),
  rules: z.array(shortText(200)).max(30),
  directions: shortText(1000).optional(),
  phone: z.string().trim().refine(isPhoneNumber, 'Not a phone number').optional(),
  verified: z.boolean(),
  reportCount: z.number().int().min(0),
  sources: z.array(z.object({ label: shortText(200), url: webUrl })).max(10),
  createdBy: z.string().uuid().optional(),
  addedBy: shortText(40).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

/** Postgres `numeric` can arrive as a string; accept both. */
const numeric = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((v) => Number(v))
  .pipe(z.number().finite());

const sourceSchema = z.object({ label: shortText(200), url: webUrl });

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function intInRange(value: number | null, min: number, max: number): number | null {
  return value != null && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function cleanText(value: string | null | undefined, max: number): string | undefined {
  const t = value?.trim();
  return t ? truncateChars(t, max) : undefined;
}

/** Text items only: drops nulls and nested arrays that a text[] column can hold. */
function textItems(values: readonly unknown[] | null): string[] {
  return (values ?? []).filter((v): v is string => typeof v === 'string');
}

function cleanList(values: readonly unknown[] | null, maxItems: number, maxLength: number): string[] {
  return textItems(values)
    .map((v) => cleanText(v, maxLength))
    .filter((v): v is string => v != null)
    .slice(0, maxItems);
}

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

/**
 * A Postgres time as an ISO time. Accepts the JSON form PostgREST sends
 * ("2026-10-07T12:00:00.123456+00:00") and the SQL form ("2026-10-07
 * 12:00:00+00"). Extra fraction digits are cut to milliseconds, which every
 * phone's date parser understands.
 */
export function toIsoTime(text: string): string | undefined {
  const normalized = text
    .trim()
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Who added a spot in the app, and when. Starter spots (no owner) get none of
 * these. A bad name or time is dropped rather than hiding the spot; Postgres
 * sends times like "2026-10-07 10:01:00+00", which become ISO times here.
 */
function addedByCamper(
  createdBy: string | null | undefined,
  addedBy: string | null | undefined,
  createdAt: string | null | undefined,
): Pick<Spot, 'createdBy' | 'addedBy' | 'createdAt'> {
  if (!createdBy || !uuid.safeParse(createdBy).success) return {};
  const name = cleanText(addedBy, 40);
  const at = createdAt ? toIsoTime(createdAt) : undefined;
  return {
    createdBy,
    ...(name ? { addedBy: name } : {}),
    ...(at && timestamp.safeParse(at).success ? { createdAt: at } : {}),
  };
}

/**
 * One row of the `spots_api` view in Supabase, converted to a Spot.
 * Core fields (id, location, site type) must be valid or the row is skipped.
 * Everything else is cleaned instead: out-of-range values become "not
 * reported" (null), odd list items are dropped and long text is shortened,
 * so one typo can't hide a whole spot.
 */
export const spotRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    latitude: numeric,
    longitude: numeric,
    site_type: z.string(),
    land_manager: z.string(),
    stay_limit_days: z.number().nullable(),
    clearance_tier: z.number().nullable(),
    drivetrain: z.string().nullable(),
    surface: z.string().nullable(),
    impassable_when_wet: z.boolean().nullable(),
    tent: z.boolean().nullable(),
    rtt: z.boolean().nullable(),
    van: z.boolean().nullable(),
    max_trailer_ft: z.number().nullable(),
    big_rig: z.boolean().nullable(),
    turnaround: z.boolean().nullable(),
    nightly_fee_usd: numeric.nullable(),
    rv_fee_usd: numeric.nullable(),
    hookups: z.array(z.unknown()).nullable(),
    reservations: z.string().nullable(),
    cost_notes: z.string().nullable(),
    amenities: z.array(z.unknown()).nullable(),
    rules: z.array(z.unknown()).nullable(),
    directions: z.string().nullable(),
    phone: z.string().nullable(),
    verified: z.boolean(),
    report_count: z.number(),
    sources: z.unknown(),
    // Added in migration 0003. Optional so a server that hasn't run it yet still works.
    created_by: z.string().nullable().optional(),
    added_by: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
  })
  .transform((r) => {
    const fee = (v: number | null) => (v != null && v >= 0 && v <= 10_000 ? v : null);
    const phone = r.phone?.trim();
    return {
      id: r.id,
      name: cleanText(r.name, 120) ?? 'Unnamed spot',
      latitude: r.latitude,
      longitude: r.longitude,
      siteType: r.site_type,
      landManager: cleanText(r.land_manager, 120) ?? 'Land manager not reported',
      stayLimitDays: intInRange(r.stay_limit_days, 1, 365),
      access: {
        clearanceTier: intInRange(r.clearance_tier, 1, 7) as ClearanceTier | null,
        drivetrain: oneOf(r.drivetrain, spotDrivetrain.options),
        surface: cleanText(r.surface, 200) ?? null,
        impassableWhenWet: r.impassable_when_wet,
      },
      fit: {
        tent: r.tent,
        rtt: r.rtt,
        van: r.van,
        maxTrailerFt: intInRange(r.max_trailer_ft, 0, 100),
        bigRig: r.big_rig,
        turnaround: r.turnaround,
      },
      cost: {
        nightlyFeeUsd: fee(r.nightly_fee_usd),
        rvFeeUsd: fee(r.rv_fee_usd),
        hookups: [...new Set(textItems(r.hookups).filter((h) => (hookup.options as readonly string[]).includes(h)))],
        reservations: oneOf(r.reservations, reservations.options),
        notes: cleanText(r.cost_notes, 500),
      },
      amenities: cleanList(r.amenities, 30, 80),
      rules: cleanList(r.rules, 30, 200),
      directions: cleanText(r.directions, 1000),
      phone: phone && isPhoneNumber(phone) ? phone : undefined,
      verified: r.verified,
      reportCount: Math.max(0, Math.trunc(r.report_count)),
      sources: (Array.isArray(r.sources) ? r.sources : [])
        .map((src) => sourceSchema.safeParse(src))
        .flatMap((res) => (res.success ? [res.data] : []))
        .slice(0, 10),
      ...addedByCamper(r.created_by, r.added_by, r.created_at),
    };
  })
  .pipe(spotSchema);

/** Saved rig. Values are clamped by normalizeRig after parsing. */
export const storedRigSchema = z.object({
  name: z.string().max(200),
  clearanceIn: z.number().finite(),
  drivetrain: rigDrivetrainSchema,
  setup: rigSetupSchema,
  lengthFt: z.number().finite(),
}) satisfies z.ZodType<Rig>;

export const spotFilterSchema = z.enum(['fits', 'free']);
export type SpotFilter = z.infer<typeof spotFilterSchema>;

export const prefsSchema = z.object({
  filters: z.array(spotFilterSchema).max(2),
  mapType: z.enum(['standard', 'hybrid']),
  view: z.enum(['map', 'list']),
});
export type Prefs = z.infer<typeof prefsSchema>;

export const cachedSpotsSchema = z.object({
  version: z.literal(1),
  savedAt: z.string().datetime(),
  spots: z.array(spotSchema),
});
export type CachedSpots = z.infer<typeof cachedSpotsSchema>;
