// Rig-fit logic: decides whether a spot works for the camper's rig.
// Pure functions, no React, so they are easy to unit test.

import type { ClearanceTier, Rig, RigDrivetrain, RigSetup, Spot, SpotDrivetrain } from '../types';

export interface TierInfo {
  tier: ClearanceTier;
  /** Minimum clearance in inches for this tier. */
  minIn: number;
  label: string;
  road: string;
}

const TIER_TABLE: Record<ClearanceTier, TierInfo> = {
  1: { tier: 1, minIn: 2, label: '2–4"', road: 'Paved or smooth graded gravel' },
  2: { tier: 2, minIn: 4, label: '4–6"', road: 'Graded gravel, small potholes' },
  3: { tier: 3, minIn: 6, label: '6–8"', road: 'Ruts, small rocks, washboard' },
  4: { tier: 4, minIn: 8, label: '8–10"', road: 'Rocky stretches, moderate ruts' },
  5: { tier: 5, minIn: 10, label: '10–12"', road: 'Ledges, deep ruts, washouts' },
  6: { tier: 6, minIn: 12, label: '12–16"', road: 'Large rocks, steep ledges' },
  7: { tier: 7, minIn: 16, label: '16"+', road: 'Obstacles that need a spotter' },
};

/** C1 through C7, in order. */
export const CLEARANCE_TIERS: readonly TierInfo[] = [1, 2, 3, 4, 5, 6, 7].map((t) => TIER_TABLE[t as ClearanceTier]);

export function tierInfo(tier: ClearanceTier): TierInfo {
  return TIER_TABLE[tier];
}

export const SPOT_DRIVETRAINS: Record<SpotDrivetrain, { label: string; rank: number; required: boolean }> = {
  '2wd-ok': { label: '2WD OK', rank: 0, required: false },
  'awd-recommended': { label: 'AWD recommended', rank: 1, required: false },
  '4wd-required': { label: '4WD required', rank: 2, required: true },
  '4wd-lockers': { label: '4WD low + lockers', rank: 3, required: true },
};

export const RIG_DRIVETRAINS: Record<RigDrivetrain, { label: string; rank: number }> = {
  '2wd': { label: '2WD', rank: 0 },
  awd: { label: 'AWD', rank: 1 },
  '4wd': { label: '4WD', rank: 2 },
  '4wd-lockers': { label: '4WD + lockers', rank: 3 },
};

/** Rigs this long count as big rigs, whatever they're called. */
export const BIG_RIG_FT = 40;

export const RIG_SETUPS: Record<RigSetup, { label: string; short: string; tows: boolean }> = {
  tent: { label: 'Tent', short: 'Tent', tows: false },
  rtt: { label: 'Rooftop tent', short: 'Rooftop tent', tows: false },
  van: { label: 'Van / truck camper', short: 'Van', tows: false },
  trailer: { label: 'Trailer', short: 'Trailer', tows: true },
  bigrig: { label: 'Big rig (40 ft+, Class A, fifth wheel)', short: 'Big rig', tows: true },
};

/** Highest clearance tier a vehicle can handle: 0 if under 2". */
export function maxTierFor(clearanceIn: number): number {
  let max = 0;
  for (const t of CLEARANCE_TIERS) {
    if (clearanceIn >= t.minIn) max = t.tier;
  }
  return max;
}

export function isTowing(rig: Pick<Rig, 'setup'>): boolean {
  return RIG_SETUPS[rig.setup].tows;
}

export type FitStatus = 'fits' | 'tight' | 'no' | 'unknown';

/** Best first: used to sort lists. */
export const FIT_ORDER: Record<FitStatus, number> = { fits: 0, tight: 1, unknown: 2, no: 3 };

export interface FitResult {
  status: FitStatus;
  headline: string;
  /** Why the status was chosen, worst first. Empty when it simply fits. */
  reasons: string[];
  /** Worth knowing but not part of the verdict, like wet-weather roads. */
  notes: string[];
}

export const FIT_HEADLINES: Record<FitStatus, string> = {
  fits: 'Fits your rig',
  tight: 'Tight for your rig',
  no: "Won't fit your rig",
  unknown: 'Not enough reports to tell',
};

/** The parts of a rig that decide fit. The rig's name never changes a result. */
export type FitRig = Pick<Rig, 'clearanceIn' | 'drivetrain' | 'setup' | 'lengthFt'>;

/**
 * Compare a spot with a rig.
 * Precedence: no > unknown > tight > fits.
 */
export function fitFor(spot: Spot, rig: FitRig): FitResult {
  const problems: string[] = [];
  const cautions: string[] = [];
  const unknowns: string[] = [];
  const notes: string[] = [];

  // Clearance
  const tier = spot.access.clearanceTier;
  if (tier == null) {
    unknowns.push('Clearance not reported');
  } else {
    const diff = tier - maxTierFor(rig.clearanceIn);
    const info = tierInfo(tier);
    if (diff >= 2) problems.push(`Needs C${tier} (${info.label}) clearance`);
    else if (diff === 1) cautions.push(`Road is C${tier} (${info.label}), one tier above your ${rig.clearanceIn}"`);
  }

  // Drivetrain
  const drive = spot.access.drivetrain;
  if (drive == null) {
    unknowns.push('Drivetrain needs not reported');
  } else {
    const need = SPOT_DRIVETRAINS[drive];
    if (RIG_DRIVETRAINS[rig.drivetrain].rank < need.rank) {
      (need.required ? problems : cautions).push(need.label);
    }
  }

  // Where you sleep
  const f = spot.fit;
  const check = (value: boolean | null, missing: string, unknown: string) => {
    if (value === false) problems.push(missing);
    else if (value == null) unknowns.push(unknown);
  };

  switch (rig.setup) {
    case 'tent':
      check(f.tent, 'No tent ground', 'Tent ground not reported');
      break;
    case 'rtt':
      check(f.rtt, 'No level parking for a rooftop tent', 'Rooftop tent fit not reported');
      break;
    case 'van':
      check(f.van, 'No level pull-off for a van or camper', 'Van fit not reported');
      break;
    case 'bigrig':
    case 'trailer':
      break;
  }

  // Big rigs, and trailers long enough to count as one (40 ft and up, as the
  // spot form asks), need a spot suited to them and room to turn around.
  if (rig.setup === 'bigrig' || (rig.setup === 'trailer' && rig.lengthFt >= BIG_RIG_FT)) {
    check(f.bigRig, 'Not suited to big rigs', 'Big-rig fit not reported');
    check(f.turnaround, 'No turnaround', 'Turnaround not reported');
  }

  if (isTowing(rig)) {
    if (f.maxTrailerFt == null) unknowns.push('Max length not reported');
    else if (f.maxTrailerFt === 0) problems.push('No room for a trailer');
    else if (f.maxTrailerFt < rig.lengthFt)
      problems.push(`Fits up to ${f.maxTrailerFt} ft; yours is ${rig.lengthFt} ft`);
  }

  if (spot.access.impassableWhenWet) notes.push('Road is impassable when wet: check the forecast');

  // Anything that rules the spot out wins. Otherwise missing reports come
  // before cautions: "tight" promises the rest was checked, and a spot with
  // gaps must not pass the "Fits my rig" filter on a guess. The caution still
  // shows in the reasons.
  let status: FitStatus = 'fits';
  if (problems.length) status = 'no';
  else if (unknowns.length) status = 'unknown';
  else if (cautions.length) status = 'tight';

  return { status, headline: FIT_HEADLINES[status], reasons: [...problems, ...cautions, ...unknowns], notes };
}
